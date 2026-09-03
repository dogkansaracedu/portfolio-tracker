import { useMemo } from "react"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useTheme } from "@/contexts/ThemeContext"
import { useDisplayCurrency } from "@/contexts/DisplayContext"
import {
  formatCompactCurrency,
  formatMoney,
  moneyAxisLabels,
} from "@/lib/prices"
import type { FiatCurrency } from "@/lib/constants/currencies"
import type { MonthlyBudgetRow } from "@/lib/budget"
import {
  BUDGET_CHART_COLORS,
  BUDGET_SERIES,
  BUDGET_SERIES_LABELS,
  type BudgetSeries,
} from "@/components/budget/constants"
import { legFor, monthLabel } from "@/components/budget/display"

interface Props {
  /** Ascending by month (oldest left). */
  rows: MonthlyBudgetRow[]
  currency: FiatCurrency
}

const SERIES_ORDER: BudgetSeries[] = [
  BUDGET_SERIES.income,
  BUDGET_SERIES.invested,
  BUDGET_SERIES.spent,
]

/**
 * Grouped monthly bars for income / invested / spent in the display currency.
 * Unknown legs (months with no income data) are omitted from the chart rather
 * than drawn as zero; the savings rate lives in the table — one axis only.
 *
 * Under the privacy toggle the axis loses its LABELS and the tooltip masks.
 * An unmasked axis would hand the hidden amounts straight back — the bars are
 * still to scale, so a labelled axis is the table's masked figures readable
 * off a ruler. Masking each tick instead was worse than dropping them: five
 * identical dot-rows at 11px read as stray gridlines against the dashed grid,
 * and they held 56px of a 390px chart to say nothing. Same idiom as the asset
 * history chart's price axis below `md` — the axis keeps its scale, drops its
 * labels. The bar SHAPE stays (the reason percentages stay visible too).
 */
export function BudgetTrendChart({ rows, currency }: Props) {
  const { theme } = useTheme()
  const { obfuscated } = useDisplayCurrency()
  const colors = BUDGET_CHART_COLORS[theme]

  const data = useMemo(
    () =>
      rows.map((row) => ({
        label: monthLabel(row.month),
        income: legFor(row, "income", currency)?.toNumber(),
        invested: legFor(row, "invested", currency)?.toNumber(),
        spent: legFor(row, "spent", currency)?.toNumber(),
      })),
    [rows, currency],
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Monthly trend</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={data} barGap={2}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis dataKey="label" className="text-xs" tick={{ fontSize: 11 }} />
            <YAxis
              className="text-xs"
              // Privacy on → no labels at all (see above), so the formatter
              // never runs and the gutter goes back to the bars.
              {...moneyAxisLabels(obfuscated, { fontSize: 11, width: 56 })}
              // Compact: a quarter of the phone chart used to go to ".00".
              tickFormatter={(v: number) => formatCompactCurrency(v, currency)}
            />
            <Tooltip
              formatter={(value, name) => [
                formatMoney(Number(value), currency, obfuscated),
                BUDGET_SERIES_LABELS[name as BudgetSeries],
              ]}
            />
            <Legend
              formatter={(value) => BUDGET_SERIES_LABELS[value as BudgetSeries]}
            />
            {SERIES_ORDER.map((series) => (
              <Bar
                key={series}
                dataKey={series}
                fill={colors[series]}
                radius={[2, 2, 0, 0]}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
