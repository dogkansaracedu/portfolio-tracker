import type BigNumber from "bignumber.js"
import {
  MONTHS_PER_YEAR,
  PROJECTION_BAND,
  valueAtMonthsFromNow,
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
      base: floorForDisplay(at(PROJECTION_BAND.base)),
      range: [
        floorForDisplay(Math.min(low, high)),
        floorForDisplay(Math.max(low, high)),
      ] as [number, number],
    }
  })
}
