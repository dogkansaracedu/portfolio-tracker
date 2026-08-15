import { useMemo } from "react"
import type BigNumber from "bignumber.js"
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useTheme } from "@/contexts/ThemeContext"
import {
  PROJECTION_BAND,
  valueAtMonthsFromNow,
  type ComparisonResult,
} from "@/lib/retirement"
import { ageAt, sampleMonthsFromNow } from "./chartSeries"
import {
  BASE_CASE_CAPTION,
  OPTION_SERIES_COLORS,
  TODAYS_PURCHASING_POWER,
} from "./constants"
import type { RetirementDisplay } from "./display"

interface Props {
  results: ComparisonResult[]
  currentAge: number
  startingAmountUsd: BigNumber
  display: RetirementDisplay
}

/**
 * One line per comparison option — the same contribution plan, only growth
 * differs. Bands are deliberately not shaded here: five overlapping bands stop
 * being readable, so the chart shows base cases and says so.
 */
export function CompareChart({
  results,
  currentAge,
  startingAmountUsd,
  display,
}: Props) {
  const { theme } = useTheme()
  const palette = OPTION_SERIES_COLORS[theme]

  const points = useMemo(() => {
    const totalMonths = Math.max(
      0,
      ...results.map((r) => r.projections[PROJECTION_BAND.base].months.length),
    )
    return sampleMonthsFromNow(totalMonths).map((monthsFromNow) => {
      const point: Record<string, number> = {
        age: ageAt(currentAge, monthsFromNow),
      }
      for (const result of results) {
        point[result.option.id] = display.chartValue(
          valueAtMonthsFromNow(
            result.projections[PROJECTION_BAND.base],
            monthsFromNow,
            startingAmountUsd,
          ),
          monthsFromNow,
        )
      }
      return point
    })
  }, [results, currentAge, startingAmountUsd, display])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">
          Projected value by option
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          {BASE_CASE_CAPTION} Values are before tax.
          {display.isReal && ` Shown in ${TODAYS_PURCHASING_POWER}.`}
        </p>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={points}>
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
              formatter={(value, name) => [
                display.moneyFromChartValue(Number(value)),
                String(name),
              ]}
              labelFormatter={(label) => `Age ${Math.round(Number(label))}`}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {results.map((result, index) => (
              <Line
                key={result.option.id}
                type="monotone"
                dataKey={result.option.id}
                name={result.option.name}
                stroke={palette[index % palette.length]}
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
        <p className="mt-1 text-center text-xs text-muted-foreground">Age</p>
      </CardContent>
    </Card>
  )
}
