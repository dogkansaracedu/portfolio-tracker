import type BigNumber from "bignumber.js"
import {
  MONTHS_PER_YEAR,
  PROJECTION_BAND,
  type Projection,
  type ProjectionBand,
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

/**
 * A projection month's value is its END-of-month value, so month index `t` is
 * `t + 1` months from now; month 0 from now is the starting amount itself.
 */
export function valueAtMonthsFromNow(
  projection: Projection,
  monthsFromNow: number,
  startingAmountUsd: BigNumber,
): BigNumber {
  if (monthsFromNow <= 0) return startingAmountUsd
  const month = projection.months[monthsFromNow - 1]
  return month ? month.valueUsd : projection.finalValueUsd
}

export function ageAt(currentAge: number, monthsFromNow: number): number {
  return currentAge + monthsFromNow / MONTHS_PER_YEAR
}

export interface BandPoint {
  age: number
  monthsFromNow: number
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
  const totalMonths = projections[PROJECTION_BAND.base].months.length
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
      base: at(PROJECTION_BAND.base),
      range: [Math.min(low, high), Math.max(low, high)] as [number, number],
    }
  })
}
