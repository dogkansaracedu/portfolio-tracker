import { describe, it, expect } from "vitest"
import {
  SENSITIVITY_INPUT,
  SENSITIVITY_KIND,
  SENSITIVITY_METRIC,
} from "@/lib/retirement/constants"
import { computeSensitivityInsights } from "@/lib/retirement/insights"
import { solveRequiredContribution } from "@/lib/retirement/solvers"
import { computeRetirementTarget } from "@/lib/retirement/target"
import { scenario } from "@/lib/retirement/test-fixtures"

describe("computeSensitivityInsights", () => {
  const inputs = scenario()
  const insights = computeSensitivityInsights(inputs)
  const contributionSteps = insights.filter(
    (i) => i.kind === SENSITIVITY_KIND.contributionStep,
  )
  const ageShifts = insights.filter(
    (i) => i.kind === SENSITIVITY_KIND.retirementAgeShift,
  )

  it("reports the +25% and +50% contribution steps and the ±5-year age shifts", () => {
    expect(contributionSteps).toHaveLength(2)
    expect(contributionSteps.map((i) => i.changedValue.toNumber())).toEqual([
      1250, 1500,
    ])
    expect(ageShifts.map((i) => i.changedValue.toNumber())).toEqual([50, 60])
    expect(ageShifts[0].changedInput).toBe(SENSITIVITY_INPUT.retirementAge)
  })

  it("saves months at a bigger contribution, and more of them at +50%", () => {
    const [plus25, plus50] = contributionSteps.map((i) => i.effect)
    if (
      plus25.metric !== SENSITIVITY_METRIC.monthsToTarget ||
      plus50.metric !== SENSITIVITY_METRIC.monthsToTarget
    ) {
      throw new Error("contribution steps must report months to target")
    }
    expect(plus25.monthsSaved!).toBeGreaterThan(0)
    expect(plus50.monthsSaved!).toBeGreaterThan(plus25.monthsSaved!)
    expect(plus25.changedMonths!).toBeLessThan(plus25.baseMonths!)
  })

  it("needs more per month to retire 5 years earlier and less to retire later", () => {
    const [earlier, later] = ageShifts.map((i) => i.effect)
    if (
      earlier.metric !== SENSITIVITY_METRIC.requiredMonthlyContributionUsd ||
      later.metric !== SENSITIVITY_METRIC.requiredMonthlyContributionUsd
    ) {
      throw new Error("age shifts must report required contribution")
    }
    expect(earlier.deltaUsd!.isGreaterThan(0)).toBe(true)
    expect(later.deltaUsd!.isLessThan(0)).toBe(true)
  })

  it("is solver output, not a re-derivation", () => {
    const shifted = { ...inputs, retirementAge: inputs.retirementAge + 5 }
    const expected = solveRequiredContribution(
      computeRetirementTarget(shifted),
      shifted,
    )
    const effect = ageShifts[1].effect
    if (effect.metric !== SENSITIVITY_METRIC.requiredMonthlyContributionUsd) {
      throw new Error("age shifts must report required contribution")
    }
    expect(effect.changedUsd!.toNumber()).toBe(expected!.toNumber())
  })

  it("skips an age shift that lands before the current age", () => {
    const tight = computeSensitivityInsights(
      scenario({ currentAge: 52, retirementAge: 55 }),
    )
    const shifts = tight.filter(
      (i) => i.kind === SENSITIVITY_KIND.retirementAgeShift,
    )
    expect(shifts).toHaveLength(1)
    expect(shifts[0].changedValue.toNumber()).toBe(60)
  })

  it("carries nulls through when a step cannot reach the target", () => {
    const unreachable = computeSensitivityInsights(
      scenario({ monthlyContributionUsd: 0, startingAmountUsd: 0 }),
    )
    const step = unreachable.find(
      (i) => i.kind === SENSITIVITY_KIND.contributionStep,
    )!.effect
    if (step.metric !== SENSITIVITY_METRIC.monthsToTarget) {
      throw new Error("contribution steps must report months to target")
    }
    expect(step.baseMonths).toBeNull()
    expect(step.monthsSaved).toBeNull()
  })
})
