import { describe, it, expect } from "vitest"
import { bn, BN_ZERO } from "@/lib/config"
import { PROJECTION_BAND, WITHDRAWAL_STRATEGY } from "@/lib/retirement/constants"
import { projectScenario } from "@/lib/retirement/projection"
import {
  normalizeScenarioInputs,
  type RetirementPlanStart,
  type StoredRetirementScenarioInputs,
} from "@/lib/retirement/scenario"
import { scenario } from "@/lib/retirement/test-fixtures"
import {
  BAND_POSITION,
  computePlanTracking,
  planMonthDate,
  wholeMonthsBetween,
  type ActualMonthlyContribution,
  type ActualValuePoint,
  type PlanTrackingOptions,
} from "@/lib/retirement/tracking"

/**
 * The plan calendar: string dates only, and the two helpers are inverses —
 * whatever `planMonthDate` clamps to, `wholeMonthsBetween` reads back as a
 * whole month.
 */
describe("wholeMonthsBetween", () => {
  it("is zero on the same day", () => {
    expect(wholeMonthsBetween("2026-09-06", "2026-09-06")).toBe(0)
  })

  it("needs the day of month to come round before a month counts", () => {
    expect(wholeMonthsBetween("2026-09-06", "2026-10-05")).toBe(0)
    expect(wholeMonthsBetween("2026-09-06", "2026-10-06")).toBe(1)
    expect(wholeMonthsBetween("2026-09-06", "2026-10-07")).toBe(1)
  })

  it("treats a clamped month end as a whole month (Jan 31 → Feb 28)", () => {
    expect(wholeMonthsBetween("2026-01-31", "2026-02-27")).toBe(0)
    expect(wholeMonthsBetween("2026-01-31", "2026-02-28")).toBe(1)
    // 2028 is a leap year: the anniversary is the 29th, so the 28th is short.
    expect(wholeMonthsBetween("2028-01-31", "2028-02-28")).toBe(0)
    expect(wholeMonthsBetween("2028-01-31", "2028-02-29")).toBe(1)
  })

  it("rolls over the year", () => {
    expect(wholeMonthsBetween("2026-11-15", "2027-02-14")).toBe(2)
    expect(wholeMonthsBetween("2026-11-15", "2027-02-15")).toBe(3)
    expect(wholeMonthsBetween("2026-06-01", "2028-06-01")).toBe(24)
  })

  it("is negative when the second date comes first", () => {
    expect(wholeMonthsBetween("2026-10-06", "2026-09-06")).toBe(-1)
  })

  it("inverts planMonthDate at every month of a year", () => {
    for (let t = 0; t <= 12; t++) {
      expect(wholeMonthsBetween("2026-01-31", planMonthDate("2026-01-31", t))).toBe(t)
    }
  })
})

describe("planMonthDate", () => {
  it("is the start date itself at month 0", () => {
    expect(planMonthDate("2026-06-01", 0)).toBe("2026-06-01")
  })

  it("clamps the day to the target month's length", () => {
    expect(planMonthDate("2026-01-31", 1)).toBe("2026-02-28")
    expect(planMonthDate("2028-01-31", 1)).toBe("2028-02-29")
    expect(planMonthDate("2026-01-31", 3)).toBe("2026-04-30")
    // Clamping never sticks: month 2 is back on the 31st.
    expect(planMonthDate("2026-01-31", 2)).toBe("2026-03-31")
  })

  it("rolls over the year", () => {
    expect(planMonthDate("2026-11-15", 3)).toBe("2027-02-15")
    expect(planMonthDate("2026-06-01", 24)).toBe("2028-06-01")
  })
})

// ─── The worked case ────────────────────────────────────────────────

const STARTED_AT = "2026-06-01"
const TODAY = "2026-09-06"
const STARTING_AMOUNT_USD = 50_000

const frozenInputs = scenario({ startingAmountUsd: STARTING_AMOUNT_USD })

const planStart: RetirementPlanStart = {
  startedAt: STARTED_AT,
  startingAmountUsd: STARTING_AMOUNT_USD,
  inputs: frozenInputs,
}

/** The frozen base projection, recomputed independently of the engine. */
const baseProjection = projectScenario(frozenInputs, {
  band: PROJECTION_BAND.base,
  startingAmountUsd: bn(STARTING_AMOUNT_USD),
  includeRetirementDrawdown: true,
})

/** The frozen plan's own value three whole months in — the yardstick. */
const PLANNED_AT_3_MONTHS = baseProjection.months[2].valueUsd

/** $200 short of the plan: inside the band (which is ±~$365 wide here). */
const LIVE_VALUE_USD = PLANNED_AT_3_MONTHS.minus(200)

const actualContributions: ActualMonthlyContribution[] = [
  // Before the plan started — must not count.
  { month: "2026-05", investedUsd: bn(9000) },
  { month: "2026-06", investedUsd: bn(1200) },
  { month: "2026-07", investedUsd: bn(800) },
  { month: "2026-08", investedUsd: bn(-200) },
  { month: "2026-09", investedUsd: bn(1000) },
  // After today's month — must not count either.
  { month: "2026-10", investedUsd: bn(5000) },
]

function track(
  overrides: Partial<PlanTrackingOptions> = {},
): ReturnType<typeof computePlanTracking> {
  return computePlanTracking({
    planStart,
    todayIso: TODAY,
    liveValueUsd: LIVE_VALUE_USD,
    actualValues: [],
    actualContributions,
    ...overrides,
  })
}

describe("computePlanTracking", () => {
  it("counts 3 whole elapsed months but 4 calendar months covered", () => {
    const tracking = track()
    expect(tracking.elapsedMonths).toBe(3)
    expect(tracking.monthsCovered).toBe(4)
  })

  it("measures the value against the frozen plan at the elapsed month", () => {
    const tracking = track()
    // Month index 2 is 3 months from now (values are end-of-month).
    expect(tracking.plannedValueUsd.base.toString()).toBe(
      PLANNED_AT_3_MONTHS.toString(),
    )
    // $50,000 growing at 7%/yr with $1,000 landing each month end.
    expect(tracking.plannedValueUsd.base.toNumber()).toBeCloseTo(53_869.92, 2)
    // Gap = planned − actual: positive means behind the plan.
    expect(tracking.valueGapUsd.toNumber()).toBeCloseTo(200, 6)
    expect(tracking.actualValueUsd.toString()).toBe(LIVE_VALUE_USD.toString())
  })

  it("is ahead (a negative value gap) when the actual value beats the plan", () => {
    const tracking = track({ liveValueUsd: PLANNED_AT_3_MONTHS.plus(10_000) })
    expect(tracking.valueGapUsd.toNumber()).toBeCloseTo(-10_000, 6)
  })

  it("sums the planned contributions over the months COVERED, not elapsed", () => {
    const tracking = track()
    const expected = baseProjection.months
      .slice(0, 4)
      .reduce((sum, month) => sum.plus(month.contributionUsd), BN_ZERO)
    expect(tracking.plannedContributionsUsd.toNumber()).toBeCloseTo(
      expected.toNumber(),
      6,
    )
    // $1,000/month flat, four calendar months.
    expect(tracking.plannedContributionsUsd.toNumber()).toBeCloseTo(4000, 6)
  })

  it("sums actual contributions only over the covered calendar months", () => {
    const tracking = track()
    // 1200 + 800 − 200 + 1000; the 2026-05 and 2026-10 rows are outside.
    expect(tracking.actualContributionsUsd.toNumber()).toBe(2800)
    expect(tracking.contributionGapUsd.toNumber()).toBeCloseTo(1200, 6)
  })

  it("reports a negative contribution gap when actual outpaces planned", () => {
    const tracking = track({
      actualContributions: [{ month: "2026-06", investedUsd: bn(10_000) }],
    })
    expect(tracking.contributionGapUsd.toNumber()).toBeCloseTo(-6000, 6)
  })

  it("places the actual value inside the band", () => {
    const tracking = track()
    expect(tracking.bandPosition).toBe(BAND_POSITION.withinBand)
    expect(
      tracking.plannedValueUsd.pessimistic.isLessThan(
        tracking.plannedValueUsd.optimistic,
      ),
    ).toBe(true)
  })

  it("places the actual value below the pessimistic band", () => {
    const tracking = track({ liveValueUsd: PLANNED_AT_3_MONTHS.minus(20_000) })
    expect(tracking.bandPosition).toBe(BAND_POSITION.belowPessimistic)
  })

  it("places the actual value above the optimistic band", () => {
    const tracking = track({ liveValueUsd: PLANNED_AT_3_MONTHS.plus(20_000) })
    expect(tracking.bandPosition).toBe(BAND_POSITION.aboveOptimistic)
  })

  it("runs all three bands with the drawdown, from the frozen starting amount", () => {
    const tracking = track()
    const withDrawdown = projectScenario(frozenInputs, {
      band: PROJECTION_BAND.pessimistic,
      startingAmountUsd: bn(STARTING_AMOUNT_USD),
      includeRetirementDrawdown: true,
    })
    expect(tracking.projections.pessimistic.months).toHaveLength(
      withDrawdown.months.length,
    )
    expect(tracking.projections.base.months[0].valueUsd.isGreaterThan(0)).toBe(
      true,
    )
    expect(tracking.startingAmountUsd.toNumber()).toBe(STARTING_AMOUNT_USD)
  })

  it("keeps the frozen inputs, not the scenario's current ones", () => {
    const tracking = track()
    expect(tracking.inputs.monthlyContributionUsd).toBe(
      frozenInputs.monthlyContributionUsd,
    )
    expect(tracking.startedAt).toBe(STARTED_AT)
  })

  it("normalizes frozen inputs saved before contributionEndAge existed", () => {
    const stored = {
      startingAmountUsd: STARTING_AMOUNT_USD,
      monthlyContributionUsd: 1000,
      contributionGrowthPct: 0,
      currentAge: 35,
      retirementAge: 55,
      depletionAge: 80,
      monthlySpendingUsd: 3000,
      safeWithdrawalRatePct: 4,
      withdrawalStrategy: WITHDRAWAL_STRATEGY.preservation,
      primaryExpectedReturn: { pessimistic: 4, base: 7, optimistic: 10 },
      usdInflationPct: 2,
      tryInflationPct: 30,
      tryDepreciationPct: 25,
      options: [],
    } satisfies StoredRetirementScenarioInputs

    const tracking = track({
      planStart: { ...planStart, inputs: stored },
    })
    expect(tracking.inputs.contributionEndAge).toBe(55)
    expect(tracking.inputs).toEqual(normalizeScenarioInputs(stored))
  })
})

describe("computePlanTracking actual series", () => {
  const snapshots: ActualValuePoint[] = [
    { date: "2026-05-31", valueUsd: bn(49_000) }, // before the plan started
    { date: "2026-06-01", valueUsd: bn(50_000) },
    { date: "2026-07-15", valueUsd: bn(52_000) },
  ]

  it("drops snapshots taken before the plan started and appends today's live point", () => {
    const tracking = track({ actualValues: snapshots })
    expect(tracking.actualSeries.map((point) => point.date)).toEqual([
      "2026-06-01",
      "2026-07-15",
      TODAY,
    ])
    expect(tracking.actualSeries.at(-1)!.valueUsd.toString()).toBe(
      LIVE_VALUE_USD.toString(),
    )
  })

  it("replaces a same-day snapshot with the live point rather than duplicating it", () => {
    const tracking = track({
      actualValues: [...snapshots, { date: TODAY, valueUsd: bn(53_500) }],
    })
    expect(tracking.actualSeries.map((point) => point.date)).toEqual([
      "2026-06-01",
      "2026-07-15",
      TODAY,
    ])
    expect(tracking.actualSeries.at(-1)!.valueUsd.toString()).toBe(
      LIVE_VALUE_USD.toString(),
    )
  })

  it("is today's live point alone when there is no history yet", () => {
    const tracking = track({ actualValues: [] })
    expect(tracking.actualSeries).toHaveLength(1)
    expect(tracking.actualSeries[0].date).toBe(TODAY)
  })
})

describe("computePlanTracking on the day it starts", () => {
  const sameDay = track({ todayIso: STARTED_AT })

  it("has no elapsed months but still covers its first calendar month", () => {
    expect(sameDay.elapsedMonths).toBe(0)
    expect(sameDay.monthsCovered).toBe(1)
  })

  it("plans the starting amount itself at month 0", () => {
    expect(sameDay.plannedValueUsd.base.toNumber()).toBe(STARTING_AMOUNT_USD)
    // One month of planned contribution against the start month's actual.
    expect(sameDay.plannedContributionsUsd.toNumber()).toBeCloseTo(1000, 6)
    expect(sameDay.actualContributionsUsd.toNumber()).toBe(1200)
  })
})
