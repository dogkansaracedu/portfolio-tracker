import { useMemo, useState } from "react"
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
import { Card, CardContent } from "@/components/ui/card"
import { useDisplayCurrency } from "@/contexts/DisplayContext"
import { useDashboardHero, type HeroViewMode } from "@/hooks/useDashboardHero"
import { formatCurrency, obfuscate } from "@/lib/prices"
import { cn } from "@/lib/utils"
import type { TimeRange } from "@/lib/performance"
import type { Snapshot } from "@/types/database"

interface DashboardHeroProps {
  snapshots: Snapshot[]
  currentValueUsd: number
  currentValueTry: number
  usdTry: number
}

const TIME_RANGES: { id: TimeRange; label: string }[] = [
  { id: "1D", label: "1G" },
  { id: "1W", label: "1H" },
  { id: "1M", label: "1A" },
  { id: "3M", label: "3A" },
  { id: "YTD", label: "YTD" },
  { id: "1Y", label: "1Y" },
  { id: "ALL", label: "TÜM" },
]

const VIEW_MODES: { id: HeroViewMode; label: string }[] = [
  { id: "value", label: "Değer" },
  { id: "pnl", label: "Kar / Zarar" },
]

const RANGE_LABELS: Record<TimeRange, string> = {
  "1D": "son 1 gün",
  "1W": "son 1 hafta",
  "1M": "son 1 ay",
  "3M": "son 3 ay",
  "6M": "son 6 ay",
  YTD: "yıl başından beri",
  "1Y": "son 1 yıl",
  ALL: "tüm zamanlar",
}

function formatPct(value: number): string {
  const sign = value >= 0 ? "+" : ""
  return `${sign}${value.toFixed(2)}%`
}

function formatSigned(value: number, currency: "USD" | "TRY"): string {
  const sign = value >= 0 ? "+" : ""
  return `${sign}${formatCurrency(Math.abs(value), currency)}`
}

function compactCurrency(value: number, currency: "USD" | "TRY"): string {
  const symbol = currency === "USD" ? "$" : "₺"
  const abs = Math.abs(value)
  const sign = value < 0 ? "-" : ""
  if (abs >= 1_000_000) return `${sign}${symbol}${(abs / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `${sign}${symbol}${(abs / 1_000).toFixed(0)}k`
  return `${sign}${symbol}${abs.toFixed(0)}`
}

export default function DashboardHero({
  snapshots,
  currentValueUsd,
  currentValueTry,
  usdTry,
}: DashboardHeroProps) {
  const { currency, obfuscated } = useDisplayCurrency()
  const [viewMode, setViewMode] = useState<HeroViewMode>("value")
  const [timeRange, setTimeRange] = useState<TimeRange>("1M")

  const { chartData, current, delta } = useDashboardHero({
    snapshots,
    currentValueUsd,
    currentValueTry,
    viewMode,
    timeRange,
    usdTry,
  })

  // ── Headline figures ──────────────────────────────────────────────
  // Value view: live total portfolio value + period delta (gain/loss).
  // P&L view: period P&L delta (gain/loss from price movement only,
  //   excluding deposits) as the headline. Subtitle shows the *current
  //   cumulative* money-weighted P&L, which is `current.usd` in P&L mode
  //   (= live value − net cash deployed). Net cash deployed is derived
  //   from the same series, ensuring the totals are internally consistent.
  const totalPnlUsdNow = current.usd // cumulative money-weighted P&L
  const totalPnlTryNow = current.try
  const investedNowUsd = currentValueUsd - totalPnlUsdNow
  const investedNowTry = currentValueTry - totalPnlTryNow
  const totalPnlPctNow =
    investedNowUsd !== 0 ? (totalPnlUsdNow / Math.abs(investedNowUsd)) * 100 : 0

  const headlineValue =
    viewMode === "value"
      ? currency === "USD"
        ? current.usd
        : current.try
      : currency === "USD"
        ? delta.usd
        : delta.try

  const periodDeltaValue = currency === "USD" ? delta.usd : delta.try

  const periodColor =
    delta.usd > 0
      ? "text-emerald-600"
      : delta.usd < 0
        ? "text-red-500"
        : "text-muted-foreground"

  const totalPnlColor =
    totalPnlUsdNow > 0
      ? "text-emerald-600"
      : totalPnlUsdNow < 0
        ? "text-red-500"
        : "text-muted-foreground"

  // For the P&L chart we want the area to start at 0 (range start = baseline)
  // and climb/fall to the period delta. Subtract rangeStart from each point.
  const displayChartData = useMemo(() => {
    if (viewMode === "value") return chartData
    const baseUsd = chartData[0]?.valueUsd ?? 0
    const baseTry = chartData[0]?.valueTry ?? 0
    return chartData.map((p) => ({
      ...p,
      valueUsd: p.valueUsd - baseUsd,
      valueTry: p.valueTry - baseTry,
    }))
  }, [chartData, viewMode])

  const isLoss = viewMode === "pnl" && delta.usd < 0
  const strokeColor = isLoss ? "rgb(239, 68, 68)" : "hsl(var(--primary))"
  const fillColor = isLoss ? "rgb(239 68 68 / 0.1)" : "hsl(var(--primary) / 0.1)"

  const hasChart = chartData.length >= 2
  const showZeroRef = viewMode === "pnl" && hasChart

  return (
    <Card className="overflow-hidden">
      <CardContent className="space-y-5 pt-2">
        {/* View mode tabs */}
        <div className="flex items-center justify-between gap-3">
          <div className="inline-flex rounded-lg bg-muted p-1">
            {VIEW_MODES.map((mode) => (
              <button
                key={mode.id}
                type="button"
                onClick={() => setViewMode(mode.id)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  viewMode === mode.id
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {mode.label}
              </button>
            ))}
          </div>
        </div>

        {/* Big number + delta */}
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {viewMode === "value"
              ? "Toplam Değer"
              : `Kar / Zarar · ${RANGE_LABELS[timeRange]}`}
          </p>
          <p
            className={cn(
              "text-3xl font-bold tracking-tight md:text-4xl",
              viewMode === "pnl" && periodColor,
            )}
          >
            {obfuscate(
              viewMode === "pnl"
                ? formatSigned(headlineValue, currency)
                : formatCurrency(headlineValue, currency),
              obfuscated,
            )}
          </p>
          {viewMode === "value" ? (
            <div
              className={cn("flex items-center gap-2 text-sm font-medium", periodColor)}
            >
              <span>{obfuscate(formatSigned(periodDeltaValue, currency), obfuscated)}</span>
              <span>·</span>
              <span>{obfuscate(formatPct(delta.pct), obfuscated)}</span>
              <span className="font-normal text-muted-foreground">
                {RANGE_LABELS[timeRange]}
              </span>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <span className={cn("font-medium", periodColor)}>
                {obfuscate(formatPct(delta.pct), obfuscated)}
              </span>
              <span className="text-muted-foreground">·</span>
              <span className="text-muted-foreground">
                Toplam{" "}
                <span className={cn("font-medium", totalPnlColor)}>
                  {obfuscate(
                    formatSigned(
                      currency === "USD" ? totalPnlUsdNow : totalPnlTryNow,
                      currency,
                    ),
                    obfuscated,
                  )}
                </span>{" "}
                ({obfuscate(formatPct(totalPnlPctNow), obfuscated)})
              </span>
              <span className="text-muted-foreground">·</span>
              <span className="text-muted-foreground">
                Yatırılan{" "}
                {obfuscate(
                  formatCurrency(
                    currency === "USD" ? investedNowUsd : investedNowTry,
                    currency,
                  ),
                  obfuscated,
                )}
              </span>
            </div>
          )}
        </div>

        {/* Chart */}
        {hasChart ? (
          <div className="h-[220px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={displayChartData}
                margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="hero-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={strokeColor} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={strokeColor} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  className="stroke-border"
                  vertical={false}
                />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  minTickGap={24}
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={56}
                  tickFormatter={(v: number) => compactCurrency(v, currency)}
                />
                <Tooltip
                  cursor={{ stroke: "hsl(var(--muted-foreground))", strokeWidth: 1, strokeDasharray: "3 3" }}
                  contentStyle={{
                    background: "hsl(var(--background))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  formatter={(value) => [
                    obfuscate(
                      viewMode === "pnl"
                        ? formatSigned(Number(value), currency)
                        : formatCurrency(Number(value), currency),
                      obfuscated,
                    ),
                    viewMode === "value" ? "Değer" : "Kar/Zarar",
                  ]}
                  labelFormatter={(label) => String(label)}
                />
                {showZeroRef && (
                  <ReferenceLine
                    y={0}
                    stroke="hsl(var(--muted-foreground))"
                    strokeDasharray="4 4"
                    strokeOpacity={0.5}
                  />
                )}
                <Area
                  type="monotone"
                  dataKey={currency === "USD" ? "valueUsd" : "valueTry"}
                  stroke={strokeColor}
                  fill={fillColor}
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="flex h-[220px] items-center justify-center rounded-lg border border-dashed">
            <p className="text-sm text-muted-foreground">
              Bu zaman aralığı için yeterli veri yok.
            </p>
          </div>
        )}

        {/* Time range tabs */}
        <div className="flex flex-wrap gap-1.5">
          {TIME_RANGES.map((range) => (
            <button
              key={range.id}
              type="button"
              onClick={() => setTimeRange(range.id)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                timeRange === range.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/70",
              )}
            >
              {range.label}
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
