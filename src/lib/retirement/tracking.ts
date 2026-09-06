import type BigNumber from "bignumber.js"
import { bn, BN_ZERO } from "@/lib/config"
import { MONTHS_PER_YEAR, PROJECTION_BAND } from "@/lib/retirement/constants"
import {
  projectScenario,
  valueAtMonthsFromNow,
} from "@/lib/retirement/projection"
import {
  normalizeScenarioInputs,
  type RetirementPlanStart,
} from "@/lib/retirement/scenario"
import type {
  Projection,
  ProjectionBand,
  RetirementScenarioInputs,
} from "@/lib/retirement/types"

/**
 * Plan tracking — "am I on track?": what actually happened, measured against
 * what the frozen plan start projected (GLOSSARY: plan start, value gap,
 * contribution gap). The yardstick is the plan as it was on the day it was
 * started, so later edits to the scenario cannot move it.
 *
 * See docs/components/GLOSSARY.md#plan-tracking-formula.
 */

const BANDS: ProjectionBand[] = [
  PROJECTION_BAND.pessimistic,
  PROJECTION_BAND.base,
  PROJECTION_BAND.optimistic,
]

/** One day of actual portfolio history (a snapshot), nominal USD. */
export interface ActualValuePoint {
  /** "YYYY-MM-DD" */
  date: string
  valueUsd: BigNumber
}

/**
 * One calendar month of actual contributions: the budgeting engine's
 * "invested (monthly)" figure (GLOSSARY) — net external money into tracked
 * platforms, negative on a net-withdrawal month.
 */
export interface ActualMonthlyContribution {
  /** "YYYY-MM" */
  month: string
  investedUsd: BigNumber
}

export interface PlanTrackingOptions {
  planStart: RetirementPlanStart
  /** "YYYY-MM-DD" — the caller passes `homeDayIso()`. */
  todayIso: string
  /** Today's actual portfolio total. */
  liveValueUsd: BigNumber
  /** Daily snapshots over any range; filtered here to the plan's window. */
  actualValues: ActualValuePoint[]
  /** Any range; filtered here to the covered calendar months. */
  actualContributions: ActualMonthlyContribution[]
}

/** Where the actual value sits relative to the frozen plan's band. */
export type BandPosition =
  | "above_optimistic"
  | "within_band"
  | "below_pessimistic"

export const BAND_POSITION = {
  aboveOptimistic: "above_optimistic",
  withinBand: "within_band",
  belowPessimistic: "below_pessimistic",
} as const satisfies Record<string, BandPosition>

export interface PlanTracking {
  startedAt: string
  startingAmountUsd: BigNumber
  /** The frozen inputs, normalized (a stored row can predate an input). */
  inputs: RetirementScenarioInputs
  /** Whole months from `startedAt` to today (floor). */
  elapsedMonths: number
  /** Calendar months touched, start month through today's month inclusive (≥ 1). */
  monthsCovered: number
  /** The frozen plan's three bands, drawdown included, from `startingAmountUsd`. */
  projections: Record<ProjectionBand, Projection>
  /** Planned value per band at `elapsedMonths`. */
  plannedValueUsd: Record<ProjectionBand, BigNumber>
  actualValueUsd: BigNumber
  /** Planned base − actual. Positive = behind (same sign as the Coast FIRE gap). */
  valueGapUsd: BigNumber
  bandPosition: BandPosition
  /** The frozen BASE projection's contributions over the first `monthsCovered` months. */
  plannedContributionsUsd: BigNumber
  /** Actual invested over the covered calendar months. */
  actualContributionsUsd: BigNumber
  /** Planned − actual. Positive = behind. */
  contributionGapUsd: BigNumber
  /** Snapshots on/after `startedAt` with today's live point at the end. Ascending. */
  actualSeries: ActualValuePoint[]
}

/**
 * Two clocks, deliberately: the VALUE comparison runs on whole elapsed months
 * (`elapsedMonths`), because the frozen projection only defines a value at
 * month ENDS, while the CONTRIBUTION comparison runs on calendar months
 * (`monthsCovered`), because that is the bucket the budgeting engine hands over.
 * A plan started mid-month therefore counts its first partial month in full on
 * both sides — planned and actual — so the two stay comparable.
 */
export function computePlanTracking(options: PlanTrackingOptions): PlanTracking {
  const { planStart, todayIso, liveValueUsd } = options
  const startedAt = planStart.startedAt
  const startingAmountUsd = bn(planStart.startingAmountUsd)
  const inputs = normalizeScenarioInputs(planStart.inputs)

  const elapsedMonths = Math.max(0, wholeMonthsBetween(startedAt, todayIso))
  const monthsCovered = Math.max(
    1,
    calendarMonthsBetween(monthKey(startedAt), monthKey(todayIso)) + 1,
  )

  const projections = {} as Record<ProjectionBand, Projection>
  const plannedValueUsd = {} as Record<ProjectionBand, BigNumber>
  for (const band of BANDS) {
    const projection = projectScenario(inputs, {
      band,
      startingAmountUsd,
      includeRetirementDrawdown: true,
    })
    projections[band] = projection
    plannedValueUsd[band] = valueAtMonthsFromNow(
      projection,
      elapsedMonths,
      startingAmountUsd,
    )
  }

  const plannedContributionsUsd = projections[PROJECTION_BAND.base].months
    .slice(0, monthsCovered)
    .reduce((sum, month) => sum.plus(month.contributionUsd), BN_ZERO)

  const fromMonth = monthKey(startedAt)
  const toMonth = monthKey(todayIso)
  const actualContributionsUsd = options.actualContributions
    .filter((row) => row.month >= fromMonth && row.month <= toMonth)
    .reduce((sum, row) => sum.plus(row.investedUsd), BN_ZERO)

  return {
    startedAt,
    startingAmountUsd,
    inputs,
    elapsedMonths,
    monthsCovered,
    projections,
    plannedValueUsd,
    actualValueUsd: liveValueUsd,
    valueGapUsd: plannedValueUsd[PROJECTION_BAND.base].minus(liveValueUsd),
    bandPosition: positionInBand(liveValueUsd, plannedValueUsd),
    plannedContributionsUsd,
    actualContributionsUsd,
    contributionGapUsd: plannedContributionsUsd.minus(actualContributionsUsd),
    actualSeries: buildActualSeries(options),
  }
}

function positionInBand(
  actualValueUsd: BigNumber,
  plannedValueUsd: Record<ProjectionBand, BigNumber>,
): BandPosition {
  if (actualValueUsd.isLessThan(plannedValueUsd[PROJECTION_BAND.pessimistic])) {
    return BAND_POSITION.belowPessimistic
  }
  if (actualValueUsd.isGreaterThan(plannedValueUsd[PROJECTION_BAND.optimistic])) {
    return BAND_POSITION.aboveOptimistic
  }
  return BAND_POSITION.withinBand
}

/**
 * The actual line the chart draws: snapshots inside the plan's window, with
 * today's live total as the last point. A snapshot already stamped today is
 * REPLACED by the live total rather than sitting beside it — the same day must
 * not appear twice, and the live figure is the fresher of the two.
 * Snapshots arrive ascending (the caller's contract) and stay in that order.
 */
function buildActualSeries(options: PlanTrackingOptions): ActualValuePoint[] {
  const { planStart, todayIso, liveValueUsd } = options
  const series = options.actualValues.filter(
    (point) => point.date >= planStart.startedAt && point.date <= todayIso,
  )
  const todayPoint: ActualValuePoint = { date: todayIso, valueUsd: liveValueUsd }
  const sameDay = series.findIndex((point) => point.date === todayIso)
  if (sameDay === -1) return [...series, todayPoint]
  return series.map((point, i) => (i === sameDay ? todayPoint : point))
}

// ─── Plan calendar ──────────────────────────────────────────────────
//
// Dates are strings end to end: parsed as plain Y/M/D numbers, never through
// `new Date("YYYY-MM-DD")`, whose locale/UTC parsing shifts a day around the
// home timezone.

/**
 * The calendar date ending plan month `monthsFromNow`: `startedAt` itself at 0,
 * `startedAt + t` months after that, with the day clamped to the target month's
 * length (Jan 31 + 1 month = Feb 28, or Feb 29 in a leap year).
 */
export function planMonthDate(startedAt: string, monthsFromNow: number): string {
  const { year, month, day } = parseIso(startedAt)
  const shifted = year * MONTHS_PER_YEAR + (month - 1) + Math.trunc(monthsFromNow)
  const targetYear = Math.floor(shifted / MONTHS_PER_YEAR)
  const targetMonth =
    (((shifted % MONTHS_PER_YEAR) + MONTHS_PER_YEAR) % MONTHS_PER_YEAR) + 1
  return formatIso(
    targetYear,
    targetMonth,
    Math.min(day, daysInMonth(targetYear, targetMonth)),
  )
}

/**
 * Whole months from one date to another, floored — the inverse of
 * {@link planMonthDate}, so `wholeMonthsBetween(d, planMonthDate(d, t)) === t`
 * including at a clamped month end (Jan 31 → Feb 28 is a whole month, because
 * Feb 28 is where "one month after Jan 31" lands). Negative when `toIso`
 * precedes `fromIso`.
 */
export function wholeMonthsBetween(fromIso: string, toIso: string): number {
  const from = parseIso(fromIso)
  const to = parseIso(toIso)
  const months =
    (to.year - from.year) * MONTHS_PER_YEAR + (to.month - from.month)
  const anniversaryDay = Math.min(from.day, daysInMonth(to.year, to.month))
  return to.day < anniversaryDay ? months - 1 : months
}

/** Calendar months from one "YYYY-MM" to another (0 = the same month). */
function calendarMonthsBetween(fromMonth: string, toMonth: string): number {
  const [fromYear, fromM] = fromMonth.split("-").map(Number)
  const [toYear, toM] = toMonth.split("-").map(Number)
  return (toYear - fromYear) * MONTHS_PER_YEAR + (toM - fromM)
}

/** "2026-09-06" → "2026-09". */
function monthKey(iso: string): string {
  return iso.slice(0, 7)
}

function parseIso(iso: string): { year: number; month: number; day: number } {
  const [year, month, day] = iso.split("-").map(Number)
  return { year, month, day }
}

function formatIso(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${pad2(month)}-${pad2(day)}`
}

function pad2(value: number): string {
  return String(value).padStart(2, "0")
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28
  return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}
