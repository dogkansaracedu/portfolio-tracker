import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useDisplayCurrency } from "@/contexts/DisplayContext"
import { formatCurrency, obfuscate } from "@/lib/prices"
import type { Snapshot } from "@/types/database"
import type { BalanceChange, InvestmentPnL } from "@/hooks/useDashboard"

interface PortfolioMetricsCardProps {
  snapshots: Snapshot[]
  currentValueUsd: number
  currentValueTry: number
  balanceChange: BalanceChange
  investmentPnL: InvestmentPnL
}

function formatPct(value: number): string {
  const sign = value >= 0 ? "+" : ""
  return `${sign}${value.toFixed(2)}%`
}

function formatSigned(value: number, currency: "USD" | "TRY"): string {
  const sign = value >= 0 ? "+" : ""
  return `${sign}${formatCurrency(Math.abs(value), currency)}`
}

function MetricRow({
  label,
  sublabel,
  value,
  pct,
  currency,
  obfuscated,
}: {
  label: string
  sublabel?: string
  value: number
  pct: number
  currency: "USD" | "TRY"
  obfuscated: boolean
}) {
  const color =
    value > 0 ? "text-emerald-600" : value < 0 ? "text-red-500" : "text-muted-foreground"

  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-medium">{label}</p>
        {sublabel && (
          <p className="text-xs text-muted-foreground">{sublabel}</p>
        )}
      </div>
      <div className="text-right">
        <p className={`text-sm font-bold ${color}`}>
          {obfuscate(formatSigned(value, currency), obfuscated)}
        </p>
        <p className={`text-xs ${color}`}>
          {obfuscate(formatPct(pct), obfuscated)}
        </p>
      </div>
    </div>
  )
}

export default function PortfolioMetricsCard({
  snapshots,
  currentValueUsd,
  currentValueTry,
  balanceChange,
  investmentPnL,
}: PortfolioMetricsCardProps) {
  const { currency, obfuscated } = useDisplayCurrency()

  // Build chart data: snapshots + current value as last point
  const chartData = [
    ...snapshots.map((s) => ({
      date: s.snapshot_date,
      label: new Date(s.snapshot_date).toLocaleDateString("tr-TR", {
        month: "short",
        year: "2-digit",
      }),
      value: currency === "USD" ? (s.total_usd ?? 0) : (s.total_try ?? 0),
    })),
    {
      date: new Date().toISOString().slice(0, 10),
      label: "Now",
      value: currency === "USD" ? currentValueUsd : currentValueTry,
    },
  ]

  const changeValue =
    currency === "USD" ? balanceChange.changeUsd : balanceChange.changeTry

  const hasSnapshots = snapshots.length > 0
  const hasChart = chartData.length > 1

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle>Portfolio Tracker</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {hasChart ? (
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11 }}
                className="text-xs"
              />
              <YAxis
                tick={{ fontSize: 11 }}
                className="text-xs"
                tickFormatter={(v: number) =>
                  currency === "USD"
                    ? `$${(v / 1000).toFixed(0)}k`
                    : `₺${(v / 1000).toFixed(0)}k`
                }
                width={50}
              />
              <Tooltip
                formatter={(value) => [
                  obfuscate(formatCurrency(Number(value), currency), obfuscated),
                  "Value",
                ]}
                labelFormatter={(label) => String(label)}
              />
              {snapshots.length > 0 && (
                <ReferenceLine
                  y={currency === "USD" ? (snapshots[0].total_usd ?? 0) : (snapshots[0].total_try ?? 0)}
                  stroke="hsl(var(--muted-foreground))"
                  strokeDasharray="4 4"
                  strokeOpacity={0.5}
                />
              )}
              <Area
                type="monotone"
                dataKey="value"
                stroke="hsl(var(--primary))"
                fill="hsl(var(--primary) / 0.1)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-[200px] items-center justify-center">
            <p className="text-sm text-muted-foreground">
              Take a snapshot to see portfolio history.
            </p>
          </div>
        )}

        <div className="space-y-3 border-t pt-3">
          {hasSnapshots && (
            <MetricRow
              label="Balance Change"
              sublabel={`since ${balanceChange.snapshotDate}`}
              value={changeValue}
              pct={balanceChange.changePct}
              currency={currency}
              obfuscated={obfuscated}
            />
          )}
          <MetricRow
            label="Investment P&L"
            sublabel={`cost: ${obfuscate(formatCurrency(investmentPnL.totalCostBasisUsd, "USD"), obfuscated)}`}
            value={investmentPnL.totalPnlUsd}
            pct={investmentPnL.totalPnlPct}
            currency="USD"
            obfuscated={obfuscated}
          />
        </div>
      </CardContent>
    </Card>
  )
}
