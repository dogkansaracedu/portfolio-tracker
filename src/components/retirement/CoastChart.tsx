import { useMemo } from "react"
import type BigNumber from "bignumber.js"
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useTheme } from "@/contexts/ThemeContext"
import type {
  CoastDate,
  CoastFirePoint,
  Projection,
  ProjectionBand,
} from "@/lib/retirement"
import { ageAt, buildBandPoints } from "./chartSeries"
import { coastMarkerLines } from "./coastMarkers"
import {
  AGE_LABEL,
  BAND_CAPTION,
  COAST_CURVE_COLOR,
  COAST_CHART_TITLE,
  COAST_DATE_MARKER_LABEL,
  COAST_STRIP_LABELS,
  TODAYS_PURCHASING_POWER,
} from "./constants"
import type { RetirementDisplay } from "./display"

interface Props {
  projections: Record<ProjectionBand, Projection>
  curve: CoastFirePoint[]
  coastDate: CoastDate | null
  currentAge: number
  /** The contribution end age — the plan's own answer, marked beside the earliest. */
  plannedCoastAge: number
  startingAmountUsd: BigNumber
  display: RetirementDisplay
}

/**
 * The Coast FIRE number rising toward the retirement target as compounding time
 * runs out, with the projected portfolio band overlaid. Where the projection
 * meets the curve is the coast date — marked as a dot, and as a line beside the
 * age the plan actually stops contributing at.
 */
export function CoastChart({
  projections,
  curve,
  coastDate,
  currentAge,
  plannedCoastAge,
  startingAmountUsd,
  display,
}: Props) {
  const { theme } = useTheme()
  const coastColor = COAST_CURVE_COLOR[theme]

  const points = useMemo(() => {
    const band = buildBandPoints({
      projections,
      currentAge,
      startingAmountUsd,
      chartValue: display.chartValue,
      keep: coastDate ? [coastDate.monthsFromNow] : [],
    })
    return band.map((point) => {
      const curvePoint = curve[point.monthsFromNow]
      return {
        ...point,
        coastFireNumber: curvePoint
          ? display.chartValue(curvePoint.coastFireNumberUsd, point.monthsFromNow)
          : undefined,
      }
    })
  }, [projections, curve, coastDate, currentAge, startingAmountUsd, display])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">
          {COAST_CHART_TITLE}
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
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Area
              dataKey="range"
              name="Pessimistic – optimistic"
              stroke="none"
              fill="color-mix(in oklch, var(--primary) 12%, transparent)"
              legendType="none"
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="base"
              name="Projected portfolio"
              stroke="var(--primary)"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="coastFireNumber"
              name={COAST_STRIP_LABELS.coastFireNumber}
              stroke={coastColor}
              strokeWidth={2}
              strokeDasharray="5 3"
              dot={false}
              isAnimationActive={false}
            />
            {coastMarkerLines({
              plannedCoastAge,
              earliestCoastAge:
                coastDate === null
                  ? null
                  : ageAt(currentAge, coastDate.monthsFromNow),
              earliestColor: coastColor,
            })}
            {coastDate && (
              <ReferenceDot
                x={ageAt(currentAge, coastDate.monthsFromNow)}
                y={display.chartValue(
                  coastDate.portfolioValueUsd,
                  coastDate.monthsFromNow,
                )}
                r={5}
                fill={coastColor}
                stroke="var(--background)"
                strokeWidth={2}
                label={{
                  value: COAST_DATE_MARKER_LABEL,
                  position: "top",
                  fontSize: 11,
                  fill: "var(--muted-foreground)",
                }}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
        <p className="mt-1 text-center text-xs text-muted-foreground">
          {AGE_LABEL}
        </p>
      </CardContent>
    </Card>
  )
}
