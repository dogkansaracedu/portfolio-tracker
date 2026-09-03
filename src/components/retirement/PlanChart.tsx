import { useMemo } from "react"
import type BigNumber from "bignumber.js"
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { PROJECTION_BAND, type Projection, type ProjectionBand } from "@/lib/retirement"
import { useTheme } from "@/contexts/ThemeContext"
import { buildBandPoints, depletionAge } from "./chartSeries"
import { coastMarkerLines } from "./coastMarkers"
import {
  AGE_LABEL,
  BAND_CAPTION,
  DEPLETED_AT_LABEL,
  COAST_CURVE_COLOR,
  EARLIEST_RETIREMENT_LINE_LABEL,
  RETIREMENT_AGE_LINE_LABEL,
  RETIREMENT_TARGET_LINE_LABEL,
  TODAYS_PURCHASING_POWER,
} from "./constants"
import { formatAge, type RetirementDisplay } from "./display"

interface Props {
  projections: Record<ProjectionBand, Projection>
  currentAge: number
  retirementAge: number
  /** Marked only when it is short of retirement — i.e. the plan coasts. */
  contributionEndAge: number
  /** The coast date as an age; marked alongside the planned one when it differs. */
  earliestCoastAge?: number | null
  /** "When can I retire?" only: where the answer falls on this same projection. */
  earliestRetirementAge?: number | null
  startingAmountUsd: BigNumber
  targetUsd: BigNumber
  monthsToRetirement: number
  display: RetirementDisplay
}

/**
 * The plan projection: base line inside the pessimistic–optimistic band, with
 * the retirement age, the retirement target and — when the plan coasts — both
 * the age contributions stop and the earliest age they could have. Both
 * withdrawal strategies run past retirement: the line carries on through the
 * drawdown, down to zero at the depletion age when depleting, typically still
 * rising when the SWR sustains it under preservation.
 */
export function PlanChart({
  projections,
  currentAge,
  retirementAge,
  contributionEndAge,
  earliestCoastAge = null,
  earliestRetirementAge = null,
  startingAmountUsd,
  targetUsd,
  monthsToRetirement,
  display,
}: Props) {
  const { theme } = useTheme()
  const points = useMemo(
    () =>
      buildBandPoints({
        projections,
        currentAge,
        startingAmountUsd,
        chartValue: display.chartValue,
        keep: [monthsToRetirement],
      }),
    [projections, currentAge, startingAmountUsd, display, monthsToRetirement],
  )

  const targetValue = display.chartValue(targetUsd, monthsToRetirement)

  // The pessimistic leg is the one that runs out; naming the age turns a line
  // that flattens on zero into an answer.
  const depletedAge = depletionAge(
    projections[PROJECTION_BAND.pessimistic],
    currentAge,
  )

  // The two age markers overprint whenever they are close (two years is ~10px
  // on a phone), so they sit on OPPOSITE sides of their lines and on different
  // rows: retirement top-right, earliest top-left one line down.
  const earliestLabelOffset = 14

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">
          Projected portfolio value
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          {BAND_CAPTION}
          {display.isReal && ` Shown in ${TODAYS_PURCHASING_POWER}.`}
        </p>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={points}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis
              dataKey="age"
              type="number"
              domain={["dataMin", "dataMax"]}
              tick={{ fontSize: 11 }}
              tickFormatter={(v: number) => `${Math.round(v)}`}
              axisLine={false}
              tickLine={false}
              minTickGap={24}
            />
            <YAxis
              tick={{ fontSize: 11 }}
              width={60}
              axisLine={false}
              tickLine={false}
              tickFormatter={display.axisTick}
            />
            <Tooltip
              contentStyle={{
                background: "var(--background)",
                border: "1px solid var(--border)",
                color: "var(--foreground)",
                borderRadius: 8,
                fontSize: 12,
              }}
              formatter={(value, name) =>
                Array.isArray(value)
                  ? [
                      `${display.moneyFromChartValue(Number(value[0]))} – ${display.moneyFromChartValue(Number(value[1]))}`,
                      "Pessimistic – optimistic",
                    ]
                  : [display.moneyFromChartValue(Number(value)), String(name)]
              }
              labelFormatter={(label) =>
                `${AGE_LABEL} ${Math.round(Number(label))}`
              }
            />
            <Area
              dataKey="range"
              name="Pessimistic – optimistic"
              stroke="none"
              fill="color-mix(in oklch, var(--primary) 12%, transparent)"
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="base"
              name="Base case"
              stroke="var(--primary)"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
            <ReferenceLine
              y={targetValue}
              stroke="var(--muted-foreground)"
              strokeDasharray="4 4"
              label={{
                value: RETIREMENT_TARGET_LINE_LABEL(
                  display.moneyFromChartValue(targetValue),
                ),
                position: "insideBottomLeft",
                fontSize: 11,
                fill: "var(--muted-foreground)",
              }}
            />
            {depletedAge !== null && (
              <ReferenceLine
                x={depletedAge}
                stroke="var(--destructive)"
                strokeDasharray="4 4"
                label={{
                  value: DEPLETED_AT_LABEL(formatAge(depletedAge)),
                  position: "insideBottomRight",
                  fontSize: 11,
                  fill: "var(--destructive)",
                }}
              />
            )}
            {coastMarkerLines({
              plannedCoastAge:
                contributionEndAge < retirementAge ? contributionEndAge : null,
              earliestCoastAge:
                contributionEndAge < retirementAge ? earliestCoastAge : null,
              earliestColor: COAST_CURVE_COLOR[theme],
            })}
            {earliestRetirementAge !== null && (
              <ReferenceLine
                x={earliestRetirementAge}
                stroke="var(--primary)"
                strokeDasharray="4 4"
                label={{
                  value: EARLIEST_RETIREMENT_LINE_LABEL(
                    formatAge(earliestRetirementAge),
                  ),
                  position: "insideTopLeft",
                  dy: earliestLabelOffset,
                  fontSize: 11,
                  fill: "var(--primary)",
                }}
              />
            )}
            <ReferenceLine
              x={retirementAge}
              stroke="var(--muted-foreground)"
              strokeDasharray="4 4"
              label={{
                value: RETIREMENT_AGE_LINE_LABEL(formatAge(retirementAge)),
                position: "insideTopRight",
                fontSize: 11,
                fill: "var(--muted-foreground)",
              }}
            />
          </ComposedChart>
        </ResponsiveContainer>
        <p className="mt-1 text-center text-xs text-muted-foreground">
          {AGE_LABEL}
        </p>
      </CardContent>
    </Card>
  )
}
