import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatCurrency } from "@/lib/prices"
import type { PerformanceMetrics } from "@/lib/performance"

interface Props {
  metrics: PerformanceMetrics
  currentValueUsd: number
  currency: "USD" | "TRY"
}

export function PerformanceSummary({ metrics, currentValueUsd, currency }: Props) {
  const stats = [
    {
      label: "Current Value",
      value: formatCurrency(currentValueUsd, currency),
    },
    {
      label: "All-Time Return",
      value: metrics.allTimeReturnPct != null
        ? `${metrics.allTimeReturnPct >= 0 ? "+" : ""}${metrics.allTimeReturnPct.toFixed(1)}%`
        : "N/A",
      color: metrics.allTimeReturnPct != null
        ? metrics.allTimeReturnPct >= 0 ? "text-green-600" : "text-red-600"
        : undefined,
    },
    {
      label: "CAGR",
      value: metrics.cagr != null ? `${metrics.cagr.toFixed(1)}%` : "N/A",
    },
    {
      label: "Best Month",
      value: metrics.bestMonth
        ? `${metrics.bestMonth.label}: +${metrics.bestMonth.returnPct.toFixed(1)}%`
        : "N/A",
      color: "text-green-600",
    },
    {
      label: "Worst Month",
      value: metrics.worstMonth
        ? `${metrics.worstMonth.label}: ${metrics.worstMonth.returnPct.toFixed(1)}%`
        : "N/A",
      color: metrics.worstMonth ? "text-red-600" : undefined,
    },
    {
      label: "Max Drawdown",
      value: metrics.maxDrawdownPct !== 0
        ? `${metrics.maxDrawdownPct.toFixed(1)}%`
        : "N/A",
      color: metrics.maxDrawdownPct !== 0 ? "text-red-600" : undefined,
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
