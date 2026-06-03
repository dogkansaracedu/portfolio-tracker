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
import {
  formatCurrency,
  formatSignedCurrency,
  formatSignedPercent,
  gainLossClass,
  obfuscate,
} from "@/lib/prices"
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
  /** Live total P&L (usePnLSummary) — same number the Portfolio page shows;
   *  feeds the "Total" subtitle and anchors the chart's "now" point. */
  totalPnlUsd: number
  totalPnlTry: number
  totalPnlPct: number
  usdTry: number
}

const TIME_RANGES: { id: TimeRange; label: string }[] = [
  { id: "1D", label: "1D" },
  { id: "1W", label: "1W" },
  { id: "1M", label: "1M" },
  { id: "3M", label: "3M" },
  { id: "YTD", label: "YTD" },
  { id: "1Y", label: "1Y" },
  { id: "2Y", label: "2Y" },
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
  "2Y": "past 2 years",
  ALL: "all time",
}

function compactCurrency(value: number, currency: "USD" | "TRY"): string {
  const symbol = currency === "USD" ? "$" : "₺"
  const abs = Math.abs(value)
  const sign = value < 0 ? "-" : ""
  // 1 decimal when below 10 so half-k ticks (e.g. $1.5k) render as "$1.5k"
  // instead of rounding up to "$2k". Drop trailing ".0" so $2.0k becomes
  // $2k. Same logic for M.
  const trim = (s: string) => s.replace(/\.0$/, "")
  if (abs >= 1_000_000) {
    const v = abs / 1_000_000
    return `${sign}${symbol}${trim(v.toFixed(v < 10 ? 1 : 0))}M`
  }
  if (abs >= 1_000) {
    const v = abs / 1_000
    return `${sign}${symbol}${trim(v.toFixed(v < 10 ? 1 : 0))}k`
  }
  return `${sign}${symbol}${abs.toFixed(0)}`
}

/**
 * "Nice" step size for axis ticks given a value span. Picks 1/2/5 × 10^n
 * so steps land on round numbers humans expect (1, 2, 5, 10, 20, 50, …).
 */
function niceStep(span: number, target: number): number {
  if (!Number.isFinite(span) || span <= 0) return 1
  const rough = span / Math.max(target, 1)
  const mag = Math.pow(10, Math.floor(Math.log10(rough)))
  const norm = rough / mag
  if (norm < 1.5) return 1 * mag
  if (norm < 3) return 2 * mag
  if (norm < 7) return 5 * mag
  return 10 * mag
}

/**
 * Generate round tick values from [min, max] at a "nice" step, always
 * including 0 (forced when min and max are both same sign, since the
 * niceStep grid wouldn't otherwise pin 0 to the axis).
 */
function niceTicks(
  min: number,
  max: number,
  targetCount: number = 5,
): number[] {
  if (min === max) return [0, min].sort((a, b) => a - b)
  const step = niceStep(max - min, targetCount)
  const start = Math.floor(min / step) * step
  const end = Math.ceil(max / step) * step
  const ticks: number[] = []
  for (let i = 0; i <= 20; i++) {
    const v = start + i * step
    // Step-aligned rounding eliminates float drift like 0.30000000000000004.
    ticks.push(Math.round(v / step) * step)
    if (v >= end) break
  }
  if (!ticks.some((t) => Math.abs(t) < step * 1e-6)) {
    ticks.push(0)
    ticks.sort((a, b) => a - b)
  }
  return ticks
}

export default function DashboardHero({
  snapshots,
  currentValueUsd,
  currentValueTry,
  totalPnlUsd,
  totalPnlTry,
  totalPnlPct,
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
    currentPnlUsd: totalPnlUsd,
    currentPnlTry: totalPnlTry,
    benchmarkTicker: benchmarkFetchKey,
    benchmarkSeries,
  })

  // ── Headline figures ──────────────────────────────────────────────
  // Value view: total value + period delta. P&L view: period delta as the
  // headline; "Total" subtitle = live cumulative P&L from props (same as the
  // Portfolio page). Invested = value − P&L.
  const totalPnlUsdNow = totalPnlUsd
  const totalPnlTryNow = totalPnlTry
  const totalPnlPctNow = totalPnlPct
  const investedNowUsd = currentValueUsd - totalPnlUsdNow
  const investedNowTry = currentValueTry - totalPnlTryNow

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
    delta.usd === 0 ? "text-muted-foreground" : gainLossClass(delta.usd > 0)

  const totalPnlColor =
    totalPnlUsdNow === 0
      ? "text-muted-foreground"
      : gainLossClass(totalPnlUsdNow > 0)

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
  // denom × 100 = position(right). Pick "nice" round USD/TRY ticks (and
  // force 0 to be one of them — niceTicks already does this when 0 is
  // inside the padded data range), then derive the matching % ticks at
  // those same physical positions. Both axes share gridlines, the left
  // reads as round monetary amounts (the user's headline frame), the
  // right shows the exact %-equivalent at each gridline.
  const axisDomains = useMemo<{
    pnl?: [number, number]
    pct?: [number, number]
    pnlTicks?: number[]
    pctTicks?: number[]
  }>(() => {
    if (viewMode !== "pnl" || displayChartData.length === 0) return {}
    const pnlValues = displayChartData.map((p) =>
      currency === "USD" ? p.valueUsd : p.valueTry,
    )
    // Express the benchmark in USD/TRY so both lines participate in the
    // same min/max bound — otherwise a benchmark that out- or under-
    // performs the portfolio would clip on the chart.
    const benchValuesInCurrency = displayChartData.map(
      (p) => (p.benchmarkPct / 100) * denom,
    )
    const pnlAllValues = [...pnlValues, ...benchValuesInCurrency, 0]
    const pnlMin = Math.min(...pnlAllValues)
    const pnlMax = Math.max(...pnlAllValues)
    const pad = Math.max((pnlMax - pnlMin) * 0.08, Math.abs(denom) * 0.01)
    const pnlTicks = niceTicks(pnlMin - pad, pnlMax + pad, 5)
    const tickMinUsd = pnlTicks[0]
    const tickMaxUsd = pnlTicks[pnlTicks.length - 1]
    const pctTicks = pnlTicks.map((t) => (t / denom) * 100)
    return {
      pnl: [tickMinUsd, tickMaxUsd],
      pct: [(tickMinUsd / denom) * 100, (tickMaxUsd / denom) * 100],
      pnlTicks,
      pctTicks,
    }
  }, [viewMode, displayChartData, currency, denom])

  const formatRightAxisTick = (v: number) => {
    // niceTicks emits integers for any span >= 5%, so 0 decimals is
    // safe in practice. Keep one decimal for sub-5% spans (rare).
    const decimals = Number.isInteger(v) ? 0 : 1
    return formatSignedPercent(v, decimals)
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
            {obfuscate(formatSignedCurrency(pnlVal, currency), obfuscated)}
          </span>
          <span className="text-muted-foreground">Portfolio</span>
          <span className="text-right font-medium">
            {obfuscate(formatSignedPercent(pnlPctVal, 2), obfuscated)}
          </span>
          <span className="text-muted-foreground">{activeBenchmark.label}</span>
          <span className="text-right font-medium">
            {obfuscate(formatSignedPercent(point.benchmarkPct, 2), obfuscated)}
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
                ? formatSignedCurrency(headlineValue, currency)
                : formatCurrency(headlineValue, currency),
              obfuscated,
            )}
          </p>
          {viewMode === "value" ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <span className={cn("font-medium", periodColor)}>
                {obfuscate(
                  formatSignedCurrency(periodDeltaValue, currency),
                  obfuscated,
                )}
              </span>
              {/* In ALL range, delta is "value − $0 anchor" while % falls
                  back to lifetime return (pnl/invested). Mixing the two on
                  one line reads as if you earned 3% on a $22k gain, which
                  isn't what's happening — the same % already lives in the
                  P&L tab's "Total" subtitle. Hide it here. */}
              {timeRange !== "ALL" && (
                <span className={cn("font-medium", periodColor)}>
                  {obfuscate(formatSignedPercent(delta.pct, 2), obfuscated)}
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
                {obfuscate(formatSignedPercent(delta.pct, 2), obfuscated)}
              </span>
              <span className="text-muted-foreground">·</span>
              <span className="text-muted-foreground">
                Total{" "}
                <span className={cn("font-medium", totalPnlColor)}>
                  {obfuscate(
                    formatSignedCurrency(
                      currency === "USD" ? totalPnlUsdNow : totalPnlTryNow,
                      currency,
                    ),
                    obfuscated,
                  )}
                </span>{" "}
                ({obfuscate(formatSignedPercent(totalPnlPctNow, 2), obfuscated)})
              </span>
              <span className="text-muted-foreground">·</span>
              <DropdownMenu>
                <DropdownMenuTrigger
                  className="inline-flex items-center gap-1 rounded-md text-muted-foreground hover:text-foreground"
                >
                  <span>
                    {activeBenchmark.label}{" "}
                    <span className="font-medium text-foreground">
                      {obfuscate(formatSignedPercent(compareNow.pct, 2), obfuscated)}
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
                  ticks={axisDomains.pnlTicks}
                  tickFormatter={(v: number) => compactCurrency(v, currency)}
                />
                {viewMode === "pnl" && (
                  // Right axis: same physical scale as the left, relabeled
                  // in %. position(left) / denom × 100 = position(right), so
                  // the green line reads consistently off both axes. The
                  // grey benchmark line is plotted in % directly on this
                  // axis. Both axes share the same `ticks` positions so
                  // gridlines align.
                  <YAxis
                    yAxisId="compare"
                    orientation="right"
                    domain={axisDomains.pct ?? ["auto", "auto"]}
                    ticks={axisDomains.pctTicks}
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
                  // De-emphasized: thin stroke + partial opacity so the
                  // benchmark reads as a reference line, not a peer to the
                  // portfolio line.
                  strokeWidth={1}
                  strokeOpacity={0.45}
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
