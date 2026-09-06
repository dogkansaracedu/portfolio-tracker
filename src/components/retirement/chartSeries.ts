import type BigNumber from "bignumber.js"
import {
  MONTHS_PER_YEAR,
  PROJECTION_BAND,
  valueAtMonthsFromNow,
  type Projection,
  type ProjectionBand,
  type ProjectionPhase,
} from "@/lib/retirement"
import { CHART_MAX_POINTS } from "./constants"

/**
 * Projection months → chart points. Every retirement chart reads its geometry
 * from the same projection objects the tables and tiles do, so a line can never
 * disagree with a figure; only the sampling (a monthly projection is far denser
 * than a chart needs) happens here.
 */

/**
 * `monthsFromNow` values to plot: today, the horizon end, anything the caller
 * pins (a coast date, retirement), and an even stride between.
 */
export function sampleMonthsFromNow(
  totalMonths: number,
  keep: number[] = [],
  maxPoints: number = CHART_MAX_POINTS,
): number[] {
  const stride = Math.max(1, Math.ceil((totalMonths + 1) / maxPoints))
  const wanted = new Set<number>([0, totalMonths, ...keep.filter((m) => m >= 0 && m <= totalMonths)])
  for (let m = 0; m <= totalMonths; m += stride) wanted.add(m)
  return [...wanted].sort((a, b) => a - b)
}

export function ageAt(currentAge: number, monthsFromNow: number): number {
  return currentAge + monthsFromNow / MONTHS_PER_YEAR
}

/**
 * A plan that overspends runs negative in the maths — deliberately, so the
 * solvers can see how far short it falls. A **portfolio value** of −$2.16M is
 * not a thing anyone owns, so everything DISPLAYED is floored at zero: the
 * chart line, the band and the milestone figures. The floor is display-only;
 * `projectGrowth` and every solver keep the unfloored series.
 */
export function floorForDisplay(value: number): number {
  return Math.max(0, value)
}

/**
 * The age a projection is spent to zero by — the first month whose value is
 * not positive — or null while it stays solvent. Read from the SAME projection
 * the chart draws, so the marker and the flooring can never disagree.
 */
export function depletionAge(
  projection: Projection,
  currentAge: number,
): number | null {
  const index = projection.months.findIndex((m) => m.valueUsd.lte(0))
  if (index === -1) return null
  return ageAt(currentAge, index + 1)
}

export interface BandPoint {
  age: number
  monthsFromNow: number
  /**
   * The phase of the month this point ends — read straight off the engine's own
   * months, so a tooltip can never disagree with the milestones table about
   * where contributing becomes coasting becomes retirement. Undefined only for
   * an empty horizon (the projection has no months at all).
   */
  phase: ProjectionPhase | undefined
  base: number
  /** [pessimistic, optimistic] — Recharts draws a tuple dataKey as a range area. */
  range: [number, number]
}

export interface BandPointsParams {
  projections: Record<ProjectionBand, Projection>
  currentAge: number
  startingAmountUsd: BigNumber
  chartValue: (nominalUsd: BigNumber, monthsFromNow: number) => number
  keep?: number[]
}

export function buildBandPoints({
  projections,
  currentAge,
  startingAmountUsd,
  chartValue,
  keep = [],
}: BandPointsParams): BandPoint[] {
  const baseMonths = projections[PROJECTION_BAND.base].months
  const totalMonths = baseMonths.length
  return sampleMonthsFromNow(totalMonths, keep).map((monthsFromNow) => {
    const at = (band: ProjectionBand) =>
      chartValue(
        valueAtMonthsFromNow(projections[band], monthsFromNow, startingAmountUsd),
        monthsFromNow,
      )
    const low = at(PROJECTION_BAND.pessimistic)
    const high = at(PROJECTION_BAND.optimistic)
    return {
      age: ageAt(currentAge, monthsFromNow),
      monthsFromNow,
      // Month `t` holds the END of month t, so `monthsFromNow` months from now
      // is month index `monthsFromNow - 1`; today takes the first month's phase.
      phase: baseMonths[Math.max(0, monthsFromNow - 1)]?.phase,
      base: floorForDisplay(at(PROJECTION_BAND.base)),
      range: [
        floorForDisplay(Math.min(low, high)),
        floorForDisplay(Math.max(low, high)),
      ] as [number, number],
    }
  })
}
