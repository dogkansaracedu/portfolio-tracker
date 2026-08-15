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
import type { Projection, ProjectionBand } from "@/lib/retirement"
import { buildBandPoints } from "./chartSeries"
import {
  BAND_CAPTION,
  CONTRIBUTIONS_STOP_LABEL,
  TODAYS_PURCHASING_POWER,
} from "./constants"
import type { RetirementDisplay } from "./display"

interface Props {
  projections: Record<ProjectionBand, Projection>
  currentAge: number
  retirementAge: number
  /** Marked only when it is short of retirement — i.e. the plan coasts. */
  contributionEndAge: number
  startingAmountUsd: BigNumber
  targetUsd: BigNumber
  monthsToRetirement: number
  display: RetirementDisplay
}

/**
 * The plan projection: base line inside the pessimistic–optimistic band, with
 * the retirement age, the retirement target and — when the plan coasts — the
 * age contributions stop all marked. Both withdrawal strategies run past
 * retirement: the line carries on through the drawdown, down to zero at the
 * depletion age when depleting, typically still rising when the SWR sustains it
 * under preservation.
 */
export function PlanChart({
  projections,
  currentAge,
  retirementAge,
  contributionEndAge,
  startingAmountUsd,
  targetUsd,
  monthsToRetirement,
  display,
}: Props) {
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
              labelFormatter={(label) => `Age ${Math.round(Number(label))}`}
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
                value: "Retirement target",
                position: "insideTopLeft",
                fontSize: 11,
                fill: "var(--muted-foreground)",
              }}
            />
            {contributionEndAge < retirementAge && (
              <ReferenceLine
                x={contributionEndAge}
                stroke="var(--muted-foreground)"
                strokeDasharray="2 4"
                label={{
                  value: CONTRIBUTIONS_STOP_LABEL,
                  position: "insideBottomLeft",
                  fontSize: 11,
                  fill: "var(--muted-foreground)",
                }}
              />
            )}
            <ReferenceLine
              x={retirementAge}
              stroke="var(--muted-foreground)"
              strokeDasharray="4 4"
              label={{
                value: `Retirement age ${retirementAge}`,
                position: "insideTopRight",
                fontSize: 11,
                fill: "var(--muted-foreground)",
              }}
            />
          </ComposedChart>
        </ResponsiveContainer>
        <p className="mt-1 text-center text-xs text-muted-foreground">Age</p>
      </CardContent>
    </Card>
  )
}
