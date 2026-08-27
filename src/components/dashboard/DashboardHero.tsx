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
  type HeroMeasure,
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
import type { Snapshot, IntradaySnapshot } from "@/types/database"

interface DashboardHeroProps {
  snapshots: Snapshot[]
  /** Rolling-24h intraday (hourly) totals — feeds the hero's 1D view. */
  intradaySnapshots: IntradaySnapshot[]
  currentValueUsd: number
  currentValueTry: number
  /** Live total P&L (usePnLSummary) — same number the Portfolio page shows;
   *  feeds the "Total" subtitle and anchors the chart's "now" point. Gross:
   *  the after-tax view lives only on the Portfolio page's taxed rows. */
  totalPnlUsd: number
  totalPnlTry: number
  /** null = nothing ever deployed (peak ≤ 0) → render "—". */
  totalPnlPct: number | null
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
  { id: "pnl", label: "Performance" },
]

/** Return measure for the Performance percent race. `hint` is the button's
 *  title attribute — the switch is compact, so the "why" lives there. */
const MEASURES: { id: HeroMeasure; label: string; hint: string }[] = [
  {
    id: "twr",
    label: "TWR",
    hint: "Time-weighted return — deposits and withdrawals removed. Scores the strategy against the index.",
  },
  {
    id: "mwr",
    label: "MWR",
    hint: "Money-weighted return (XIRR) — deposit timing counts. Scores your actual dollars against the same flows placed into the index.",
  },
]

/** Headline sub-label under the big percent, per measure. */
const MEASURE_SUBLABELS: Record<HeroMeasure, string> = {
  twr: "Growth vs market — time-weighted, deposits/withdrawals removed",
  mwr: "Your money's growth — money-weighted, deposit timing included",
}

/** Appended to the benchmark's label under MWR: the line is the what-if index
 *  (same flows, same dates), not the index's own buy-and-hold return. */
const WHAT_IF_LABEL_SUFFIX = " (same flows)"

/** Lifetime XIRR chip: label, unit suffix (an annualized rate, not a total),
 *  and the hover explainer. */
const XIRR_LABEL = "XIRR"
const XIRR_PER_YEAR_SUFFIX = "/yr"
const XIRR_HINT =
  "Lifetime money-weighted annual return (XIRR) across every deposit and withdrawal."

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
  intradaySnapshots,
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
    "dashboardHero.viewMode.v2",
    "pnl",
  )
  const [timeRange, setTimeRange] = usePersistedState<TimeRange>(
    "dashboardHero.timeRange",
    "1M",
  )
  const [benchmarkId, setBenchmarkId] = usePersistedState<string>(
    "dashboardHero.benchmark",
    DEFAULT_BENCHMARK_ID,
  )
  const [measure, setMeasure] = usePersistedState<HeroMeasure>(
    "dashboardHero.measure",
    "twr",
  )

  // The measure switch only applies to the Performance percent race outside 1D
  // (intraday is always the simple intraday change).
  const showMeasureSwitch = viewMode === "pnl" && timeRange !== "1D"
  // The hook ignores `measure` wherever the switch is hidden; mirror that here
  // so a persisted "mwr" can't mislabel the intraday / value views.
  const effectiveMeasure: HeroMeasure = showMeasureSwitch ? measure : "twr"
  const activeMeasure =
    MEASURES.find((m) => m.id === effectiveMeasure) ?? MEASURES[0]

  // Benchmark is always picked (default = SPY). Only fetch in P&L view —
  // the Value view doesn't render a benchmark line.
  const activeBenchmark = findBenchmark(benchmarkId)
  const benchmarkFetchKey = viewMode === "pnl" ? activeBenchmark.id : null
  const { series: benchmarkSeries } = useBenchmark(benchmarkFetchKey)
  // Under MWR the grey line is the what-if index — say so wherever it's named.
  const benchmarkLabel =
    activeBenchmark.label +
    (effectiveMeasure === "mwr" ? WHAT_IF_LABEL_SUFFIX : "")

  const {
    chartData,
    xTicks,
    current,
    compareNow,
    delta,
    pnlDenom,
    twrEnd,
    benchmarkEnd,
    gapPts,
    approximate,
    lifetimeXirrPct,
  } = useDashboardHero({
    snapshots,
    intradaySnapshots,
    currentValueUsd,
    currentValueTry,
    viewMode,
    timeRange,
    measure: effectiveMeasure,
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

  // P&L headline is the active measure's return %: green/red by direction,
  // muted at exactly flat.
  const twrColor =
    twrEnd === 0 ? "text-muted-foreground" : gainLossClass(twrEnd > 0)
  // Gap (you − index) chip: green when ahead of the market, red when behind.
  const gapColor =
    gapPts === 0 ? "text-muted-foreground" : gainLossClass(gapPts > 0)
  // Lifetime XIRR chip (percent — visible under obfuscation).
  const xirrColor =
    lifetimeXirrPct == null || lifetimeXirrPct === 0
      ? "text-muted-foreground"
      : gainLossClass(lifetimeXirrPct > 0)

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
    // The portfolio line now plots twrPct (also on the right % axis), so its
    // currency-equivalent must participate in the shared min/max bound too —
    // otherwise a TWR that out- or under-performs the benchmark would clip.
    const twrValuesInCurrency = displayChartData.map(
      (p) => (p.twrPct / 100) * denom,
    )
    const pnlAllValues = [
      ...pnlValues,
      ...benchValuesInCurrency,
      ...twrValuesInCurrency,
      0,
    ]
    const pnlMin = Math.min(...pnlAllValues)
    const pnlMax = Math.max(...pnlAllValues)
    // The denom×1% pad floor stops multi-month ranges from over-magnifying tiny
    // P&L noise. But an intraday day is usually well under 1%, so that floor
    // would dominate and squash the 1D line into a sliver (axis ±2% for a 0.9%
    // day). Use a much smaller floor (0.1%) for 1D so the axis fits the day.
    const padFloor = Math.abs(denom) * (timeRange === "1D" ? 0.001 : 0.01)
    const pad = Math.max((pnlMax - pnlMin) * 0.08, padFloor)
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
  }, [viewMode, displayChartData, currency, denom, timeRange])

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
    // The payload comes from displayChartData, so valueUsd/valueTry are
    // rebased to 0 at the window's first point — the money gained/lost
    // since the range start, as of the hovered date.
    const gainSinceStart = currency === "USD" ? point.valueUsd : point.valueTry
    let dateLabel: string
    if (point.label === "Şimdi") {
      dateLabel = "Şimdi"
    } else if (timeRange === "1D") {
      dateLabel = point.label
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
          <span className="text-muted-foreground">
            You ({activeMeasure.label})
          </span>
          <span className="text-right font-medium">
            {obfuscate(
              formatSignedCurrency(gainSinceStart, currency),
              obfuscated,
            )}
            <span className="text-muted-foreground"> · </span>
            {formatSignedPercent(point.twrPct, 2)}
          </span>
          <span className="text-muted-foreground">{benchmarkLabel}</span>
          <span className="text-right font-medium">
            {formatSignedPercent(point.benchmarkPct, 2)}
          </span>
        </div>
      </div>
    )
  }

  // Color the chart by the period's direction (Robinhood-style):
  // green when up, red when down — independent of theme primary.
  // Key off whatever the lead line actually plots, so the line always agrees
  // with the headline: the active measure's return in P&L mode (twrEnd carries
  // TWR or MWR), period ΔValue in value mode. (A large mid-window deposit can
  // flip their signs apart — money-weighted delta up while the time-weighted
  // return is down.)
  const isLoss = viewMode === "pnl" ? twrEnd < 0 : delta.usd < 0
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

          {/* Measure switch — which return the percent race plots. Performance
              mode only, and never in 1D (intraday is the simple change). */}
          {showMeasureSwitch && (
            <div className="inline-flex rounded-lg bg-muted p-0.5">
              {MEASURES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMeasure(m.id)}
                  title={m.hint}
                  className={cn(
                    "rounded-md px-2 py-1 text-xs font-medium transition-colors",
                    measure === m.id
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Big number + delta */}
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {viewMode === "value"
              ? "Total Value"
              : `Performance · ${RANGE_LABELS[timeRange]}`}
          </p>
          <p
            className={cn(
              "text-2xl font-bold tracking-tight sm:text-3xl md:text-4xl",
              viewMode === "pnl" && twrColor,
            )}
          >
            {viewMode === "pnl"
              ? formatSignedPercent(twrEnd, 2)
              : obfuscate(formatCurrency(headlineValue, currency), obfuscated)}
          </p>
          {viewMode === "pnl" && (
            <p className="text-xs text-muted-foreground">
              {MEASURE_SUBLABELS[effectiveMeasure]}
              {approximate && (
                <span
                  className="ml-1.5 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase"
                  title="Older history is weekly-sampled; periods containing a deposit or withdrawal are estimated."
                >
                  approximate
                </span>
              )}
            </p>
          )}
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
                  Performance tab's "Total" subtitle. Hide it here. */}
              {timeRange !== "ALL" && (
                <span className={cn("font-medium", periodColor)}>
                  {formatSignedPercent(delta.pct, 2)}
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
                ({totalPnlPctNow == null ? "—" : formatSignedPercent(totalPnlPctNow, 2)})
              </span>
              {/* Lifetime annualized XIRR — absent (never 0) when the history is
                  under a year or the solver found no rate. A percent, so it
                  stays visible under the privacy toggle. */}
              {lifetimeXirrPct != null && (
                <>
                  <span className="text-muted-foreground">·</span>
                  <span
                    className="text-muted-foreground"
                    title={XIRR_HINT}
                  >
                    {XIRR_LABEL}{" "}
                    <span className={cn("font-medium", xirrColor)}>
                      {formatSignedPercent(lifetimeXirrPct, 1)}
                      {XIRR_PER_YEAR_SUFFIX}
                    </span>
                  </span>
                </>
              )}
              {timeRange !== "1D" && (
                <>
                  <span className="text-muted-foreground">·</span>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      className="inline-flex items-center gap-1 rounded-md text-muted-foreground hover:text-foreground"
                    >
                      <span>
                        {benchmarkLabel}{" "}
                        <span className="font-medium text-foreground">
                          {formatSignedPercent(benchmarkEnd, 2)}
                        </span>{" "}
                        <span className={cn("font-medium", gapColor)}>
                          ({formatSignedPercent(gapPts, 1).replace("%", "")} pts)
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
                </>
              )}
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
                    if (timeRange === "1D") return point?.label ?? ""
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
                {viewMode === "pnl" ? (
                  <>
                    {/* P&L mode is a TWR-vs-index % race: both lines share the
                        right (%) axis and start ~0% at the window's left edge.
                        Bold = your time-weighted return. */}
                    <Area
                      yAxisId="compare"
                      type="monotone"
                      dataKey="twrPct"
                      name="primary"
                      stroke={strokeColor}
                      fill="url(#hero-fill)"
                      strokeWidth={2}
                    />
                    {timeRange !== "1D" && (
                      <Area
                        yAxisId="compare"
                        type="monotone"
                        dataKey="benchmarkPct"
                        name="compare"
                        stroke="var(--muted-foreground)"
                        fill="transparent"
                        // De-emphasized: thin stroke + partial opacity so the
                        // benchmark reads as a reference line, not a peer to the
                        // portfolio (TWR) line.
                        strokeWidth={1}
                        strokeOpacity={0.45}
                        isAnimationActive={false}
                      />
                    )}
                  </>
                ) : (
                  <>
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
                      yAxisId="primary"
                      type="monotone"
                      dataKey={currency === "USD" ? "compareUsd" : "compareTry"}
                      name="compare"
                      stroke="var(--muted-foreground)"
                      fill="transparent"
                      // De-emphasized: thin dashed reference line for cost basis.
                      strokeWidth={1}
                      strokeOpacity={0.45}
                      strokeDasharray="4 4"
                      isAnimationActive={false}
                    />
                  </>
                )}
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
