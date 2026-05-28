import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatCurrency, formatSignedPercent, gainLossClass } from "@/lib/prices"
import type { PerformanceMetrics, TimeRange } from "@/lib/performance"

interface Props {
  metrics: PerformanceMetrics
  currentValueUsd: number
  currency: "USD" | "TRY"
  timeRange: TimeRange
}

export function PerformanceSummary({
  metrics,
  currentValueUsd,
  currency,
  timeRange,
}: Props) {
  // Best/Worst Month and Max Drawdown are computed over the selected range,
  // unlike All-Time Return and CAGR (always lifetime). Suffix the range-scoped
  // cards so the mix is unambiguous; "ALL" needs no suffix (it is lifetime).
  const rangeSuffix = timeRange === "ALL" ? "" : ` (${timeRange})`
  const stats = [
    {
      label: "Current Value",
      value: formatCurrency(currentValueUsd, currency),
    },
    {
      label: "All-Time Return",
      value: metrics.allTimeReturnPct != null
        ? formatSignedPercent(metrics.allTimeReturnPct, 1)
        : "N/A",
      color: metrics.allTimeReturnPct != null
        ? gainLossClass(metrics.allTimeReturnPct >= 0)
        : undefined,
    },
    {
      label: "CAGR",
      value: metrics.cagr != null ? `${metrics.cagr.toFixed(1)}%` : "N/A",
    },
    {
      label: `Best Month${rangeSuffix}`,
      value: metrics.bestMonth
        ? `${metrics.bestMonth.label}: +${metrics.bestMonth.returnPct.toFixed(1)}%`
        : "N/A",
      color: gainLossClass(true),
    },
    {
      label: `Worst Month${rangeSuffix}`,
      value: metrics.worstMonth
        ? `${metrics.worstMonth.label}: ${metrics.worstMonth.returnPct.toFixed(1)}%`
        : "N/A",
      color: metrics.worstMonth ? gainLossClass(false) : undefined,
    },
    {
      label: `Max Drawdown${rangeSuffix}`,
      value: metrics.maxDrawdownPct !== 0
        ? `${metrics.maxDrawdownPct.toFixed(1)}%`
        : "N/A",
      color: metrics.maxDrawdownPct !== 0 ? gainLossClass(false) : undefined,
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
      {stats.map((stat) => (
        <Card key={stat.label}>
          <CardHeader className="pb-1 pt-3 px-3">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              {stat.label}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3">
            <p className={`text-sm font-semibold ${stat.color ?? ""}`}>
              {stat.value}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
