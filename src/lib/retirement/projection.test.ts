import { describe, it, expect } from "vitest"
import { bn, BN_ZERO } from "@/lib/config"
import { PROJECTION_PHASE, WITHDRAWAL_STRATEGY } from "@/lib/retirement/constants"
import { computeRetirementTarget } from "@/lib/retirement/target"
import {
  monthlyRateFromAnnualPct,
  nominalMonthlySpendingAtRetirement,
  projectGrowth,
  projectScenario,
} from "@/lib/retirement/projection"
import { scenario } from "@/lib/retirement/test-fixtures"

/**
 * Worked numeric cases for the projection core. Every figure below is
 * reproducible by hand from the GLOSSARY projection formula.
 */
describe("monthlyRateFromAnnualPct", () => {
  it("compounds monthly as (1+r)^(1/12) − 1", () => {
    // 1.07^(1/12) − 1 = 0.005654145387405…
    expect(monthlyRateFromAnnualPct(7).toNumber()).toBeCloseTo(
      0.005654145387405,
      12,
    )
  })

  it("is not the naive r ÷ 12", () => {
    expect(monthlyRateFromAnnualPct(7).toNumber()).not.toBeCloseTo(7 / 12 / 100, 6)
  })

  it("compounds back to the annual rate over 12 months", () => {
    const twelveMonths = bn(1)
      .plus(monthlyRateFromAnnualPct(7))
      .exponentiatedBy(12)
    expect(twelveMonths.toNumber()).toBeCloseTo(1.07, 12)
  })

  it("is 0 at a 0% expected return", () => {
    expect(monthlyRateFromAnnualPct(0).toNumber()).toBe(0)
  })
})

describe("projectGrowth", () => {
  const plainPlan = {
    startingAmountUsd: BN_ZERO,
    monthlyContributionUsd: bn(1000),
    contributionGrowthPct: 0,
    annualRatePct: 7,
    accumulationMonths: 120,
  }

  it("grows $1,000/month for 10 years at 7%/yr to $171,051.73", () => {
    // Ordinary annuity: 1000 × ((1+r_m)^120 − 1) ÷ r_m.
    const projection = projectGrowth(plainPlan)
    expect(projection.finalValueUsd.toNumber()).toBeCloseTo(171051.731256, 2)
    expect(projection.totalContributionsUsd.toNumber()).toBe(120000)
    expect(projection.months).toHaveLength(120)
  })

  it("compounds a lump sum with no contributions", () => {
    const projection = projectGrowth({
      ...plainPlan,
      startingAmountUsd: bn(10000),
      monthlyContributionUsd: BN_ZERO,
    })
    expect(projection.finalValueUsd.toNumber()).toBeCloseTo(19671.513573, 2)
    expect(projection.totalContributionsUsd.toNumber()).toBe(0)
  })

  it("adds the contribution at month end (first month is exactly one payment)", () => {
    const projection = projectGrowth({ ...plainPlan, accumulationMonths: 1 })
    expect(projection.finalValueUsd.toNumber()).toBe(1000)
    expect(projection.months[0]).toMatchObject({
      monthIndex: 0,
      phase: PROJECTION_PHASE.accumulation,
    })
  })

  it("steps the contribution up once a year, not every month", () => {
    const projection = projectGrowth({
      ...plainPlan,
      contributionGrowthPct: 10,
      accumulationMonths: 25,
    })
    const contributionAt = (i: number) =>
      projection.months[i].contributionUsd.toNumber()
    expect(contributionAt(0)).toBe(1000)
    expect(contributionAt(11)).toBe(1000)
    expect(contributionAt(12)).toBeCloseTo(1100, 10)
    expect(contributionAt(23)).toBeCloseTo(1100, 10)
    expect(contributionAt(24)).toBeCloseTo(1210, 10)
  })

  it("sums the ContributionEnhancer into the month's contribution", () => {
    const enhanced = projectGrowth({
      ...plainPlan,
      contributionEnhancer: (_monthIndex, base) => base.times(0.25),
    })
    const plain = projectGrowth(plainPlan)
    expect(enhanced.totalContributionsUsd.toNumber()).toBe(150000)
    // Same flows scaled by 1.25 → same growth path scaled by 1.25.
    expect(enhanced.finalValueUsd.toNumber()).toBeCloseTo(
      plain.finalValueUsd.times(1.25).toNumber(),
      6,
    )
  })

  it("draws down in the retirement phase, stepping spending up annually", () => {
    const projection = projectGrowth({
      ...plainPlan,
      accumulationMonths: 12,
      retirementMonths: 24,
      retirementSpendingUsd: bn(2000),
      usdInflationPct: 2,
    })
    expect(projection.months).toHaveLength(36)
    const first = projection.months[12]
    expect(first.phase).toBe(PROJECTION_PHASE.retirement)
    expect(first.contributionUsd.toNumber()).toBe(0)
    expect(first.withdrawalUsd.toNumber()).toBe(2000)
    expect(projection.months[24].withdrawalUsd.toNumber()).toBeCloseTo(2040, 10)
    // Contributions stop at retirement.
    expect(projection.totalContributionsUsd.toNumber()).toBe(12000)
  })

  it("returns the starting amount over a zero-month horizon", () => {
    const projection = projectGrowth({
      ...plainPlan,
      startingAmountUsd: bn(5000),
      accumulationMonths: 0,
    })
    expect(projection.finalValueUsd.toNumber()).toBe(5000)
    expect(projection.months).toHaveLength(0)
  })
})

describe("projectScenario", () => {
  it("takes its horizon from the ages and its rate from the chosen band", () => {
    const inputs = scenario()
    const base = projectScenario(inputs)
    const pessimistic = projectScenario(inputs, { band: "pessimistic" })
    expect(base.months).toHaveLength(240)
    expect(base.finalValueUsd.isGreaterThan(pessimistic.finalValueUsd)).toBe(true)
  })

  it("seeds a null starting amount as 0 and honours the resolved override", () => {
    const inputs = scenario({ startingAmountUsd: null })
    const seeded = projectScenario(inputs, { startingAmountUsd: bn(50000) })
    const empty = projectScenario(inputs)
    expect(
      seeded.finalValueUsd.minus(empty.finalValueUsd).toNumber(),
    ).toBeCloseTo(50000 * Math.pow(1.07, 20), 2)
  })

  it("stops at retirement when the drawdown is not asked for", () => {
    const projection = projectScenario(scenario())
    expect(projection.months).toHaveLength(240)
    expect(projection.months.every((m) => m.withdrawalUsd.isZero())).toBe(true)
  })

  it("draws the same withdrawal stream under capital preservation", () => {
    const preserving = projectScenario(scenario(), {
      includeRetirementDrawdown: true,
    })
    const depleting = projectScenario(
      scenario({ withdrawalStrategy: WITHDRAWAL_STRATEGY.depletion }),
      { includeRetirementDrawdown: true },
    )
    // Strategy changes the retirement target, never the projected drawdown.
    expect(preserving.months).toHaveLength(240 + 300)
    expect(
      preserving.months.map((m) => m.withdrawalUsd.toNumber()),
    ).toEqual(depleting.months.map((m) => m.withdrawalUsd.toNumber()))
  })

  it("keeps growing under preservation when the return outruns the withdrawals", () => {
    // $3,000/month for 20 years reaches ~$1.56M by 55, so the $4,458/month
    // opening withdrawal is ~3.4%/yr — well inside the 7% base return.
    const projection = projectScenario(scenario({ monthlyContributionUsd: 3000 }), {
      includeRetirementDrawdown: true,
    })
    const atRetirement = projection.months[239].valueUsd
    expect(projection.finalValueUsd.isGreaterThan(atRetirement)).toBe(true)
    expect(
      projection.months.every((m) => m.valueUsd.isGreaterThan(0)),
    ).toBe(true)
  })

  it("does not collapse to zero over an SWR-consistent preservation horizon", () => {
    // Funded exactly at the preservation target (annual spending ÷ SWR), the
    // 4% withdrawal against a 7% return leaves the principal intact.
    const inputs = scenario({ currentAge: 55, monthlyContributionUsd: 0 })
    const projection = projectScenario(inputs, {
      startingAmountUsd: computeRetirementTarget(inputs),
      includeRetirementDrawdown: true,
    })
    expect(projection.months).toHaveLength(300)
    expect(
      projection.finalValueUsd.isGreaterThan(computeRetirementTarget(inputs)),
    ).toBe(true)
  })

  it("appends the depletion drawdown when asked, opening at inflated spending", () => {
    const inputs = scenario({
      withdrawalStrategy: WITHDRAWAL_STRATEGY.depletion,
    })
    const projection = projectScenario(inputs, {
      includeRetirementDrawdown: true,
    })
    expect(projection.months).toHaveLength(240 + 300)
    // $3,000 of today's money, 20 years of 2% inflation.
    expect(projection.months[240].withdrawalUsd.toNumber()).toBeCloseTo(
      4457.842188,
      2,
    )
    expect(nominalMonthlySpendingAtRetirement(inputs).toNumber()).toBeCloseTo(
      4457.842188,
      2,
    )
  })
})
