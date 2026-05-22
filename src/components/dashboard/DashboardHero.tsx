import { useMemo } from "react"
import { ChevronDown } from "lucide-react"
import { usePersistedState } from "@/hooks/usePersistedState"
import { useBenchmark } from "@/hooks/useBenchmark"
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
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu"
import { useDisplayCurrency } from "@/contexts/DisplayContext"
import {
  useDashboardHero,
  type HeroPoint,
  type HeroViewMode,
} from "@/hooks/useDashboardHero"
import { formatCurrency, obfuscate } from "@/lib/prices"
import { cn } from "@/lib/utils"
import {
  BENCHMARKS,
  DEFAULT_BENCHMARK_ID,
  findBenchmark,
} from "@/lib/constants/benchmarks"
import type { TimeRange } from "@/lib/performance"
import type { Snapshot } from "@/types/database"

interface DashboardHeroProps {
  snapshots: Snapshot[]
  currentValueUsd: number
  currentValueTry: number
  usdTry: number
}

const TIME_RANGES: { id: TimeRange; label: string }[] = [
  { id: "1D", label: "1D" },
  { id: "1W", label: "1W" },
  { id: "1M", label: "1M" },
  { id: "3M", label: "3M" },
  { id: "YTD", label: "YTD" },
  { id: "1Y", label: "1Y" },
  { id: "ALL", label: "ALL" },
]

const VIEW_MODES: { id: HeroViewMode; label: string }[] = [
  { id: "value", label: "Value" },
  { id: "pnl", label: "P&L" },
]

const RANGE_LABELS: Record<TimeRange, string> = {
  "1D": "past day",
  "1W": "past week",
  "1M": "past month",
  "3M": "past 3 months",
  "6M": "past 6 months",
  YTD: "year to date",
  "1Y": "past year",
  ALL: "all time",
}

function formatPct(value: number): string {
  const sign = value >= 0 ? "+" : ""
  return `${sign}${value.toFixed(2)}%`
}

function formatSigned(value: number, currency: "USD" | "TRY"): string {
  // Always emit an explicit sign — both directions. The previous
  // `value >= 0 ? "+" : ""` paired with `Math.abs(value)` silently
  // dropped the minus on losses, so a tooltip on a -$940 dip read as
  // a positive "$940.79". `compactCurrency` (Y-axis) already does this
  // correctly; `formatSigned` (tooltips, headlines) now matches.
  const sign = value > 0 ? "+" : value < 0 ? "-" : ""
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
  // Persist view/range across tab-visibility-driven re-mounts (auth token
  // refresh on tab focus return causes consumer re-renders that can reset
  // local state).
  const [viewMode, setViewMode] = usePersistedState<HeroViewMode>(
    "dashboardHero.viewMode",
    "value",
  )
  const [timeRange, setTimeRange] = usePersistedState<TimeRange>(
    "dashboardHero.timeRange",
    "1M",
  )
  const [benchmarkId, setBenchmarkId] = usePersistedState<string>(
    "dashboardHero.benchmark",
    DEFAULT_BENCHMARK_ID,
  )

  // Benchmark is always picked (default = SPY). Only fetch in P&L view —
  // the Value view doesn't render a benchmark line.
  const activeBenchmark = findBenchmark(benchmarkId)
  const benchmarkFetchKey = viewMode === "pnl" ? activeBenchmark.id : null
  const { series: benchmarkSeries } = useBenchmark(benchmarkFetchKey)

  const {
    chartData,
    xTicks,
    current,
    compareNow,
    delta,
    pnlDenom,
  } = useDashboardHero({
    snapshots,
    currentValueUsd,
    currentValueTry,
    viewMode,
    timeRange,
    usdTry,
    benchmarkTicker: benchmarkFetchKey,
    benchmarkSeries,
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
  // `benchmarkPct` is already 0-anchored at range-start so it passes through.
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

  // Denominator mapping the left axis (USD/TRY P&L) to the right axis (%).
  // Falls back to current portfolio value when the visible window's start
  // has no usable value (e.g. ALL range with synthetic $0 anchor) — keeps
  // the right axis sensible instead of dividing by ~0.
  const denomUsd =
    Math.abs(pnlDenom.usd) > 0.01 ? pnlDenom.usd : Math.abs(currentValueUsd) || 1
  const denomTry =
    Math.abs(pnlDenom.try) > 0.01 ? pnlDenom.try : Math.abs(currentValueTry) || 1
  const denom = currency === "USD" ? denomUsd : denomTry

  // Calibrate left (USD/TRY) and right (%) axes so position(left) /
  // denom × 100 = position(right). The union of the portfolio %-equivalent
  // range and the benchmark %-range is the right-axis domain; the left
  // domain is back-derived from it so both lines fit and 0 is always on
  // both axes (we seed `pctValues` with 0).
  const axisDomains = useMemo<{
    pnl?: [number, number]
    pct?: [number, number]
  }>(() => {
    if (viewMode !== "pnl" || displayChartData.length === 0) return {}
    const pnlValues = displayChartData.map((p) =>
      currency === "USD" ? p.valueUsd : p.valueTry,
    )
    const pnlPctValues = pnlValues.map((v) => (v / denom) * 100)
    const benchValues = displayChartData.map((p) => p.benchmarkPct)
    const pctValues = [...pnlPctValues, ...benchValues, 0]
    const pctMin = Math.min(...pctValues)
    const pctMax = Math.max(...pctValues)
    const pad = Math.max((pctMax - pctMin) * 0.08, 0.5)
    const finalPctMin = pctMin - pad
    const finalPctMax = pctMax + pad
    return {
      pnl: [(finalPctMin / 100) * denom, (finalPctMax / 100) * denom],
      pct: [finalPctMin, finalPctMax],
    }
  }, [viewMode, displayChartData, currency, denom])

  const formatRightAxisTick = (v: number) => {
    const sign = v > 0 ? "+" : ""
    return `${sign}${v.toFixed(v >= 100 || v <= -100 ? 0 : 1)}%`
  }

  const renderPnlTooltip = (props: {
    active?: boolean
    payload?: ReadonlyArray<{ payload?: HeroPoint }>
  }) => {
    if (!props.active || !props.payload || props.payload.length === 0) return null
    const point = props.payload[0].payload
    if (!point) return null
    const pnlVal = currency === "USD" ? point.valueUsd : point.valueTry
    const pnlPctVal = denom !== 0 ? (pnlVal / denom) * 100 : 0
    let dateLabel: string
    if (point.label === "Şimdi") {
      dateLabel = "Şimdi"
    } else {
      const d = new Date(point.dateMs)
      dateLabel = d.toLocaleDateString("tr-TR", {
        day: "2-digit",
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      })
    }
    return (
      <div
        className="rounded-lg border px-2.5 py-2 text-xs shadow-sm"
        style={{
          background: "var(--background)",
          borderColor: "var(--border)",
          color: "var(--foreground)",
        }}
      >
        <p className="mb-1.5 font-medium text-muted-foreground">{dateLabel}</p>
        <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5">
          <span className="text-muted-foreground">Portfolio</span>
          <span className="text-right font-medium">
            {obfuscate(formatSigned(pnlVal, currency), obfuscated)}
          </span>
          <span className="text-muted-foreground">Portfolio</span>
          <span className="text-right font-medium">
            {obfuscate(formatPct(pnlPctVal), obfuscated)}
          </span>
          <span className="text-muted-foreground">{activeBenchmark.label}</span>
          <span className="text-right font-medium">
            {obfuscate(formatPct(point.benchmarkPct), obfuscated)}
          </span>
        </div>
      </div>
    )
  }

  // Color the chart by the period's direction (Robinhood-style):
  // green when up, red when down — independent of theme primary.
  const isLoss = delta.usd < 0
  const strokeColor = isLoss ? "rgb(239, 68, 68)" : "rgb(16, 185, 129)"
  const fillColor = isLoss ? "rgb(239 68 68 / 0.18)" : "rgb(16 185 129 / 0.18)"

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
              ? "Total Value"
              : `P&L · ${RANGE_LABELS[timeRange]}`}
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
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <span className={cn("font-medium", periodColor)}>
                {obfuscate(formatSigned(periodDeltaValue, currency), obfuscated)}
              </span>
              {/* In ALL range, delta is "value − $0 anchor" while % falls
                  back to lifetime return (pnl/invested). Mixing the two on
                  one line reads as if you earned 3% on a $22k gain, which
                  isn't what's happening — the same % already lives in the
                  P&L tab's "Total" subtitle. Hide it here. */}
              {timeRange !== "ALL" && (
                <span className={cn("font-medium", periodColor)}>
                  {obfuscate(formatPct(delta.pct), obfuscated)}
                </span>
              )}
              <span className="font-normal text-muted-foreground">
                {RANGE_LABELS[timeRange]}
              </span>
              <span className="text-muted-foreground">·</span>
              <span className="text-muted-foreground">
                Cost basis{" "}
                <span className="font-medium text-foreground">
                  {obfuscate(
                    formatCurrency(
                      currency === "USD" ? compareNow.usd : compareNow.try,
                      currency,
                    ),
                    obfuscated,
                  )}
                </span>
              </span>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <span className={cn("font-medium", periodColor)}>
                {obfuscate(formatPct(delta.pct), obfuscated)}
              </span>
              <span className="text-muted-foreground">·</span>
              <span className="text-muted-foreground">
                Total{" "}
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
              <DropdownMenu>
                <DropdownMenuTrigger
                  className="inline-flex items-center gap-1 rounded-md text-muted-foreground hover:text-foreground"
                >
                  <span>
                    {activeBenchmark.label}{" "}
                    <span className="font-medium text-foreground">
                      {obfuscate(formatPct(compareNow.pct), obfuscated)}
                    </span>
                  </span>
                  <ChevronDown className="size-3" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {BENCHMARKS.map((b) => (
                    <DropdownMenuItem
                      key={b.id}
                      onClick={() => setBenchmarkId(b.id)}
                    >
                      {b.fullName}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <span className="text-muted-foreground">·</span>
              <span className="text-muted-foreground">
                Invested{" "}
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
                  dataKey="dateMs"
                  type="number"
                  scale="time"
                  domain={["dataMin", "dataMax"]}
                  ticks={xTicks}
                  tickFormatter={(ms: number) =>
                    chartData.find((p) => p.dateMs === ms)?.label ?? ""
                  }
                  tick={{ fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  minTickGap={24}
                />
                <YAxis
                  yAxisId="primary"
                  tick={{ fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={56}
                  domain={axisDomains.pnl ?? ["auto", "auto"]}
                  tickFormatter={(v: number) => compactCurrency(v, currency)}
                />
                {viewMode === "pnl" && (
                  // Right axis: same physical scale as the left, relabeled
                  // in %. position(left) / denom × 100 = position(right), so
                  // the green line reads consistently off both axes. The
                  // grey benchmark line is plotted in % directly on this
                  // axis.
                  <YAxis
                    yAxisId="compare"
                    orientation="right"
                    domain={axisDomains.pct ?? ["auto", "auto"]}
                    tick={{ fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    width={48}
                    tickFormatter={formatRightAxisTick}
                  />
                )}
                <Tooltip
                  cursor={{ stroke: "var(--muted-foreground)", strokeWidth: 1, strokeDasharray: "3 3" }}
                  contentStyle={{
                    background: "var(--background)",
                    border: "1px solid var(--border)",
                    color: "var(--foreground)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  content={viewMode === "pnl" ? renderPnlTooltip : undefined}
                  formatter={(value, name) => {
                    const isCompare = name === "compare"
                    const label = isCompare ? "Cost basis" : "Value"
                    return [
                      obfuscate(formatCurrency(Number(value), currency), obfuscated),
                      label,
                    ]
                  }}
                  labelFormatter={(label) => {
                    const ms = Number(label)
                    if (Number.isNaN(ms)) return ""
                    const point = chartData.find((p) => p.dateMs === ms)
                    if (point?.label === "Şimdi") return "Şimdi"
                    const d = new Date(ms)
                    return d.toLocaleDateString("tr-TR", {
                      day: "2-digit",
                      month: "long",
                      year: "numeric",
                      timeZone: "UTC",
                    })
                  }}
                />
                {showZeroRef && (
                  <ReferenceLine
                    yAxisId="primary"
                    y={0}
                    stroke="var(--muted-foreground)"
                    strokeDasharray="4 4"
                    strokeOpacity={0.5}
                  />
                )}
                <Area
                  yAxisId="primary"
                  type="monotone"
                  dataKey={currency === "USD" ? "valueUsd" : "valueTry"}
                  name="primary"
                  stroke={strokeColor}
                  fill={fillColor}
                  strokeWidth={2}
                />
                <Area
                  yAxisId={viewMode === "pnl" ? "compare" : "primary"}
                  type="monotone"
                  dataKey={
                    viewMode === "pnl"
                      ? "benchmarkPct"
                      : currency === "USD"
                        ? "compareUsd"
                        : "compareTry"
                  }
                  name="compare"
                  stroke="var(--muted-foreground)"
                  fill="transparent"
                  strokeWidth={1.5}
                  // Solid grey in P&L mode (it's the benchmark, the focal
                  // comparison) — dashed only in Value mode where the cost-
                  // basis line is intentionally secondary.
                  strokeDasharray={viewMode === "pnl" ? undefined : "4 4"}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="flex h-[220px] items-center justify-center rounded-lg border border-dashed">
            <p className="text-sm text-muted-foreground">
              Not enough data for this time range.
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
