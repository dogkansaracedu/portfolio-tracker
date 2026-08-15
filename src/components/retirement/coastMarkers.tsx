import type { ReactElement } from "react"
import { ReferenceLine } from "recharts"
import { COAST_LINE_LABELS } from "./constants"
import { formatAge } from "./display"

/**
 * The two coast markers, drawn the same way on every chart that carries them:
 * where the plan says contributions stop, and the earliest age they could stop
 * — the [coast date](../../docs/components/GLOSSARY.md#coast-fire-gap) — when
 * that is a different month.
 *
 * A function returning an array of `ReferenceLine`s rather than a component:
 * Recharts classifies the chart's own children, so a wrapper component would
 * not be recognised as reference lines at all.
 */

/** Closer than a month apart, the two markers are one line; only the planned one draws. */
const SAME_AGE_TOLERANCE_YEARS = 1 / 12

export function showsEarliestCoast(
  plannedCoastAge: number | null,
  earliestCoastAge: number | null,
): boolean {
  if (earliestCoastAge === null) return false
  if (plannedCoastAge === null) return true
  return Math.abs(earliestCoastAge - plannedCoastAge) >= SAME_AGE_TOLERANCE_YEARS
}

export interface CoastMarkerParams {
  /** The contribution end age — null when the plan contributes to retirement. */
  plannedCoastAge: number | null
  /** The coast date as an age — null when the plan never reaches the curve. */
  earliestCoastAge: number | null
  /** The coast concept's own hue (COAST_CURVE_COLOR for the active theme). */
  earliestColor: string
}

export function coastMarkerLines({
  plannedCoastAge,
  earliestCoastAge,
  earliestColor,
}: CoastMarkerParams): ReactElement[] {
  const lines: ReactElement[] = []

  if (plannedCoastAge !== null) {
    lines.push(
      <ReferenceLine
        key="planned-coast"
        x={plannedCoastAge}
        stroke="var(--muted-foreground)"
        strokeDasharray="2 4"
        label={{
          value: COAST_LINE_LABELS.planned(formatAge(plannedCoastAge)),
          position: "insideBottomRight",
          fontSize: 11,
          fill: "var(--muted-foreground)",
        }}
      />,
    )
  }

  if (earliestCoastAge !== null && showsEarliestCoast(plannedCoastAge, earliestCoastAge)) {
    lines.push(
      <ReferenceLine
        key="earliest-coast"
        x={earliestCoastAge}
        stroke={earliestColor}
        strokeDasharray="2 4"
        label={{
          value: COAST_LINE_LABELS.earliest(formatAge(earliestCoastAge)),
          position: "insideBottomLeft",
          fontSize: 11,
          fill: earliestColor,
        }}
      />,
    )
  }

  return lines
}
