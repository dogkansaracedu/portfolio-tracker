import { describe, it, expect } from "vitest"
import { bn } from "@/lib/config"
import { projectScenario } from "@/lib/retirement/projection"
import {
  solveMonthsToTarget,
  solveRequiredContribution,
} from "@/lib/retirement/solvers"
import { computeRetirementTarget } from "@/lib/retirement/target"
import { scenario } from "@/lib/retirement/test-fixtures"

/**
 * The two inverse plan modes must agree with the forward one: solving for the
 * contribution and projecting it back has to land on the target.
 */
describe("solveRequiredContribution", () => {
  it("round-trips: projecting the solved contribution reaches the target", () => {
    const inputs = scenario()
    const target = computeRetirementTarget(inputs)
    const contributionUsd = solveRequiredContribution(target, inputs)
    expect(contributionUsd).not.toBeNull()

    const projection = projectScenario(inputs, {
      monthlyContributionUsd: contributionUsd!,
    })
    expect(projection.finalValueUsd.isGreaterThanOrEqualTo(target)).toBe(true)
    expect(projection.finalValueUsd.toNumber()).toBeCloseTo(target.toNumber(), 2)
  })

  it("round-trips under a stepped-up contribution plan", () => {
    const inputs = scenario({ contributionGrowthPct: 5, startingAmountUsd: 25000 })
    const target = computeRetirementTarget(inputs)
    const contributionUsd = solveRequiredContribution(target, inputs)!
    const projection = projectScenario(inputs, {
      monthlyContributionUsd: contributionUsd,
    })
    expect(projection.finalValueUsd.toNumber()).toBeCloseTo(target.toNumber(), 2)
  })

  it("solves the hand-checkable case: $171,051.73 in 10 years at 7% is $1,000/month", () => {
    const inputs = scenario({ currentAge: 45, retirementAge: 55 })
    const contributionUsd = solveRequiredContribution(bn(171051.731256), inputs)
    expect(contributionUsd!.toNumber()).toBeCloseTo(1000, 4)
  })

  it("is zero when the starting amount already covers the target", () => {
    const inputs = scenario({ startingAmountUsd: 5000000 })
    const target = computeRetirementTarget(inputs)
    expect(solveRequiredContribution(target, inputs)!.toNumber()).toBe(0)
  })

  it("is null when no contribution can reach the target in the horizon", () => {
    // Already at retirement age: no months left for any contribution to land in.
    const inputs = scenario({ currentAge: 55, startingAmountUsd: 0 })
    const target = computeRetirementTarget(inputs)
    expect(solveRequiredContribution(target, inputs)).toBeNull()
  })

  it("solves through a coasting window: retire at 50, stop contributing at 40", () => {
    // 5 contributing years, then 10 coasting ones to retirement — the solved
    // contribution has to fund the target through the coast, so it is larger
    // than the same plan contributing all the way.
    const inputs = scenario({
      currentAge: 35,
      retirementAge: 50,
      contributionEndAge: 40,
      depletionAge: 85,
    })
    const target = computeRetirementTarget(inputs)
    const contributionUsd = solveRequiredContribution(target, inputs)!
    const projection = projectScenario(inputs, {
      monthlyContributionUsd: contributionUsd,
    })
    expect(projection.finalValueUsd.isGreaterThanOrEqualTo(target)).toBe(true)
    expect(projection.finalValueUsd.toNumber()).toBeCloseTo(target.toNumber(), 2)
    expect(projection.totalContributionsUsd.toNumber()).toBeCloseTo(
      contributionUsd.times(60).toNumber(),
      6,
    )

    const contributingToRetirement = solveRequiredContribution(
      target,
      scenario({ currentAge: 35, retirementAge: 50, depletionAge: 85 }),
    )!
    expect(
      contributionUsd.isGreaterThan(contributingToRetirement),
    ).toBe(true)
  })

  it("is null when the plan coasts from today — no contribution can move it", () => {
    // Contributions stop at the current age: the projection is a lump sum
    // compounding, so the target is not reachable at any contribution.
    const inputs = scenario({ contributionEndAge: 35, startingAmountUsd: 1000 })
    const target = computeRetirementTarget(inputs)
    expect(solveRequiredContribution(target, inputs)).toBeNull()
  })
})

describe("solveMonthsToTarget", () => {
  it("returns 120 months for $1,000/month at 7% reaching $171,051.73", () => {
    const inputs = scenario()
    expect(solveMonthsToTarget(bn(1000), bn(171051.731256), inputs)).toBe(120)
  })

  it("agrees with solveRequiredContribution over the same horizon", () => {
    const inputs = scenario()
    const target = computeRetirementTarget(inputs)
    const contributionUsd = solveRequiredContribution(target, inputs)!
    expect(solveMonthsToTarget(contributionUsd, target, inputs)).toBe(240)
  })

  it("is 0 when the starting amount is already at the target", () => {
    const inputs = scenario({ startingAmountUsd: 500000 })
    expect(solveMonthsToTarget(bn(1000), bn(400000), inputs)).toBe(0)
  })

  it("is null when nothing ever grows toward the target", () => {
    const inputs = scenario({ monthlyContributionUsd: 0 })
    expect(solveMonthsToTarget(bn(0), bn(100000), inputs)).toBeNull()
  })

  it("stops contributing at the contribution end age even past retirement", () => {
    // The scan runs a century out, but the plan's contributions end at 45:
    // beyond that only growth carries it, so the crossing lands later than the
    // same plan contributing throughout.
    const coasting = scenario({ contributionEndAge: 45 })
    const contributing = scenario()
    const target = bn(1000000)
    const coastingMonths = solveMonthsToTarget(bn(1000), target, coasting)!
    const contributingMonths = solveMonthsToTarget(bn(1000), target, contributing)!
    expect(coastingMonths).toBeGreaterThan(contributingMonths)
  })

  it("looks past retirement age — time to target is not capped by the plan", () => {
    const inputs = scenario({ monthlyContributionUsd: 100 })
    const months = solveMonthsToTarget(bn(100), bn(2000000), inputs)
    expect(months).not.toBeNull()
    expect(months!).toBeGreaterThan(240)
  })
})
