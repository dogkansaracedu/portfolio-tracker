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
import { HintPopover } from "@/components/common/HintPopover"
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
  formatCompactCurrency,
  formatMoney,
  formatSignedMoney,
  formatSignedPercent,
  gainLossToneClass,
  moneyAxisLabels,
  NEUTRAL_FIGURE_CLASS,
} from "@/lib/prices"
import { SegmentedControl } from "@/components/common/SegmentedControl"
import { SeriesDot } from "@/components/common/SeriesDot"
import { CHART_TOOLTIP_CONTENT_STYLE } from "@/lib/constants/charts"
import { DECIMALS } from "@/lib/config"
import { DISPLAY_LOCALE, NOW_LABEL } from "@/lib/constants/app"
import {
  MWR_LABEL,
  MWR_PER_YEAR_HINT,
  MWR_PER_YEAR_SUFFIX,
  TWR_LABEL,
} from "@/lib/constants/returns"
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

/** Return measure for the Performance percent race. `hint` is the explainer
 *  the `HintPopover` beside the switch carries — the switch itself is two
 *  three-letter chips, so the "why" cannot live on them. */
const MEASURES: { id: HeroMeasure; label: string; hint: string }[] = [
  {
    id: "twr",
    label: TWR_LABEL,
    hint: "Time-weighted return — deposits and withdrawals removed. Scores the strategy against the index.",
  },
  {
    id: "mwr",
    label: MWR_LABEL,
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

/** The one name for net invested capital — the Value-mode subtitle, the
 *  Performance subtitle, the dashed reference series and its tooltip row all
 *  say this. "Cost basis" stays reserved for the FIFO figures (Portfolio
 *  "Bought", Asset Detail "Cost Basis"). */
const NET_INVESTED_LABEL = "Net invested"

/** Wording for a window with no real starting base: the delta is measured from
 *  the first deposit, so it is a total, not a period gain. */
const SINCE_FIRST_DEPOSIT_LABEL = "since first deposit"

/** The chip that marks a sampled/estimated series, and its explainer. A
 *  `title` here never fired on touch, so the one thing that says WHY the
 *  numbers are approximate was unreachable on a phone. */
const APPROXIMATE_LABEL = "approximate"
const APPROXIMATE_HINT =
  "Older history is weekly-sampled; periods containing a deposit or withdrawal are estimated."

/** Subtitle chips are separated by a middle dot carried as the FOLLOWING
 *  chip's `::before`, never as its own flex child — a separate child dangles
 *  at the end of a wrapped line. Below `sm` the chips each take their own line,
 *  where a separator has nothing to separate and reads as a bullet, so the dot
 *  starts at `sm`. */
const CHIP_SEPARATOR = "sm:before:mr-3 sm:before:content-['·']"

/** The benchmark line's own neutral — dedicated, so it never reads as either
 *  side of the gain/loss palette and stays legible in both themes. */
const BENCHMARK_STROKE = "var(--muted-foreground)"

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

/** A hovered point's date, in the app's locale — the same short-month idiom
 *  the tables use ("2 September 2026" reads as one language with them). */
function formatTooltipDate(ms: number): string {
  return new Date(ms).toLocaleDateString(DISPLAY_LOCALE, {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  })
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
  // ONE label source for both lines, read by the tooltip, the subtitle chip and
  // the legend dots, so the three can never disagree.
  const benchmarkLabel =
    activeBenchmark.label +
    (effectiveMeasure === "mwr" ? WHAT_IF_LABEL_SUFFIX : "")
  const youLabel = `You (${activeMeasure.label})`

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
  const investedNowUsd = currentValueUsd - totalPnlUsdNow
  const investedNowTry = currentValueTry - totalPnlTryNow

  // Value mode's big number. P&L mode has its own headline (the percent), so
  // this is only ever read there.
  const headlineValue = currency === "USD" ? current.usd : current.try

  const periodDeltaValue = currency === "USD" ? delta.usd : delta.try

  // No real starting base for this window (ALL's $0 anchor, or a range that
  // reaches back before the portfolio existed): the "delta" is the whole
  // portfolio measured against nothing, so it is not a gain. `delta.pct` is
  // already null in exactly that case — the amount now follows the same rule,
  // rendering in the neutral tone and saying what it is measured from.
  const hasStartingBase = delta.pct != null
  const periodColor = hasStartingBase
    ? gainLossToneClass(delta.usd)
    : NEUTRAL_FIGURE_CLASS

  const totalPnlColor = gainLossToneClass(totalPnlUsdNow)

  // P&L headline is the active measure's return %: green/red by direction,
  // muted at exactly flat.
  const twrColor = gainLossToneClass(twrEnd)
  // Gap (you − index) chip: green when ahead of the market, red when behind.
  const gapColor = gainLossToneClass(gapPts)
  // Lifetime MWR chip (percent — visible under obfuscation).
  const xirrColor =
    lifetimeXirrPct == null
      ? NEUTRAL_FIGURE_CLASS
      : gainLossToneClass(lifetimeXirrPct)

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
  // denom × 100 = position(right). In Performance mode BOTH plotted lines
  // live on the % axis, so the "nice" round step is picked in **percent**
  // (0.5 / 1 / 2 / 5 …) and the money ticks are derived from it — gridlines
  // at 2.1% and 8.7% cannot be read as a comparison. The left axis then
  // shows the money equivalent of each round percent, compact-formatted.
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
    const toPct = (v: number) => (v / denom) * 100
    const pctTicks = niceTicks(toPct(pnlMin - pad), toPct(pnlMax + pad), 5)
    const pnlTicks = pctTicks.map((t) => (t / 100) * denom)
    return {
      pnl: [pnlTicks[0], pnlTicks[pnlTicks.length - 1]],
      pct: [pctTicks[0], pctTicks[pctTicks.length - 1]],
      pnlTicks,
      pctTicks,
    }
  }, [viewMode, displayChartData, currency, denom, timeRange])

  const formatRightAxisTick = (v: number) => {
    // The % ticks are now themselves round numbers (the axis pair is built
    // from a nice % step, see `axisDomains`), so 0 decimals covers almost
    // every case; keep one for the sub-1% spans an intraday day produces.
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
    if (point.label === NOW_LABEL || timeRange === "1D") {
      dateLabel = point.label
    } else {
      dateLabel = formatTooltipDate(point.dateMs)
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
          <span className="text-muted-foreground">{youLabel}</span>
          <span className="text-right font-medium">
            {formatSignedMoney(gainSinceStart, currency, obfuscated)}
            <span className="text-muted-foreground"> · </span>
            {formatSignedPercent(point.twrPct, DECIMALS.percentage)}
          </span>
          <span className="text-muted-foreground">{benchmarkLabel}</span>
          <span className="text-right font-medium">
            {formatSignedPercent(point.benchmarkPct, DECIMALS.percentage)}
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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SegmentedControl
            ariaLabel="Hero view"
            value={viewMode}
            options={VIEW_MODES.map((m) => ({ id: m.id, label: m.label }))}
            onChange={setViewMode}
            size="sm"
          />

          {/* Measure switch — which return the percent race plots. Performance
              mode only, and never in 1D (intraday is the simple change). */}
          {showMeasureSwitch && (
            <div className="flex items-center gap-1.5">
              <SegmentedControl
                ariaLabel="Return measure"
                value={measure}
                options={MEASURES.map((m) => ({ id: m.id, label: m.label }))}
                onChange={setMeasure}
                size="sm"
              />
              {/* The active measure's explainer, on hover and on tap alike. */}
              <HintPopover
                text={activeMeasure.hint}
                label={activeMeasure.label}
                align="end"
              />
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
            {viewMode === "pnl" ? (
              <>
                {formatSignedPercent(twrEnd, DECIMALS.percentage)}
                {/* Period money gain (window-rebased delta — same figure the
                    tooltip's "Now" row shows), smaller beside the %. Colored
                    by its own sign, not the %'s: a mid-window deposit can flip
                    money-weighted delta and TWR apart. */}
                <span
                  className={cn(
                    "ml-2 text-lg font-semibold sm:text-xl md:text-2xl",
                    periodColor,
                  )}
                >
                  {formatSignedMoney(periodDeltaValue, currency, obfuscated)}
                </span>
              </>
            ) : (
              formatMoney(headlineValue, currency, obfuscated)
            )}
          </p>
          {viewMode === "pnl" && (
            <p className="text-xs text-muted-foreground">
              <SeriesDot color={strokeColor} />
              {youLabel} — {MEASURE_SUBLABELS[effectiveMeasure]}
              {approximate && (
                // The chip is the trigger (hover AND tap). Below `sm` it grows
                // to a 40px target, pulled back vertically so the chip itself
                // stays a chip and never overlaps the lines around it — the
                // same idiom the interest badge uses.
                <HintPopover
                  text={APPROXIMATE_HINT}
                  label={APPROXIMATE_LABEL}
                  align="start"
                  className="ml-1.5 max-sm:-my-2.5 max-sm:min-h-10"
                >
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase">
                    {APPROXIMATE_LABEL}
                  </span>
                </HintPopover>
              )}
            </p>
          )}
          {viewMode === "value" ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <span className={cn("font-medium", periodColor)}>
                {formatSignedMoney(periodDeltaValue, currency, obfuscated)}
              </span>
              {/* The % is null when the window has no real starting base
                  (ALL's $0 anchor, or a range reaching before the portfolio
                  existed) — a Δ against ~$0 has no meaningful %, so it is
                  hidden, not fabricated. The amount then says what it IS
                  measured from, in the neutral tone: it is the whole
                  portfolio, not a gain. */}
              {hasStartingBase ? (
                <>
                  <span className={cn("font-medium", periodColor)}>
                    {formatSignedPercent(delta.pct as number, DECIMALS.percentage)}
                  </span>
                  <span className="font-normal text-muted-foreground">
                    {RANGE_LABELS[timeRange]}
                  </span>
                </>
              ) : (
                <span className="font-normal text-muted-foreground">
                  {SINCE_FIRST_DEPOSIT_LABEL}
                </span>
              )}
              <span className={cn("text-muted-foreground", CHIP_SEPARATOR)}>
                {NET_INVESTED_LABEL}{" "}
                <span className="font-medium text-foreground">
                  {formatMoney(
                    currency === "USD" ? compareNow.usd : compareNow.try,
                    currency,
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
                  {formatSignedMoney(
                    currency === "USD" ? totalPnlUsdNow : totalPnlTryNow,
                    currency,
                    obfuscated,
                  )}
                </span>
              </span>
              {/* Lifetime annualized XIRR — absent (never 0) when the history is
                  under a year or the solver found no rate. A percent, so it
                  stays visible under the privacy toggle. */}
              {lifetimeXirrPct != null && (
                <HintPopover
                  text={MWR_PER_YEAR_HINT}
                  label={MWR_LABEL}
                  className={CHIP_SEPARATOR}
                >
                  <span>
                    {MWR_LABEL}{" "}
                    <span className={cn("font-medium", xirrColor)}>
                      {formatSignedPercent(
                        lifetimeXirrPct,
                        DECIMALS.percentageRate,
                      )}
                      {MWR_PER_YEAR_SUFFIX}
                    </span>
                  </span>
                </HintPopover>
              )}
              {timeRange !== "1D" && (
                <DropdownMenu>
                    <DropdownMenuTrigger
                      className={cn(
                        "inline-flex items-center gap-1 rounded-md text-muted-foreground hover:text-foreground",
                        CHIP_SEPARATOR,
                      )}
                    >
                      <span>
                        {/* The legend IS this chip: the dot ties the name to
                            the grey line in the chart, so no separate legend
                            row is needed at any width. */}
                        <SeriesDot color={BENCHMARK_STROKE} />
                        {benchmarkLabel}{" "}
                        <span className="font-medium text-foreground">
                          {formatSignedPercent(benchmarkEnd, DECIMALS.percentage)}
                        </span>{" "}
                        <span className={cn("font-medium", gapColor)}>
                          (
                          {formatSignedPercent(
                            gapPts,
                            DECIMALS.percentageRate,
                          ).replace("%", "")}{" "}
                          pts)
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
              )}
              <span className={cn("text-muted-foreground", CHIP_SEPARATOR)}>
                {NET_INVESTED_LABEL}{" "}
                {formatMoney(
                  currency === "USD" ? investedNowUsd : investedNowTry,
                  currency,
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
                {/* The money axis. Hidden amounts drop its labels: the
                    headline above is masked, and a labelled axis under a
                    to-scale line hands the same figure back off a ruler. */}
                <YAxis
                  yAxisId="primary"
                  {...moneyAxisLabels(obfuscated, { fontSize: 11, width: 56 })}
                  axisLine={false}
                  tickLine={false}
                  domain={axisDomains.pnl ?? ["auto", "auto"]}
                  ticks={axisDomains.pnlTicks}
                  tickFormatter={(v: number) => formatCompactCurrency(v, currency)}
                />
                {viewMode === "pnl" && (
                  // Right axis: same physical scale as the left, relabeled
                  // in %. position(left) / denom × 100 = position(right), so
                  // the green line reads consistently off both axes. The
                  // grey benchmark line is plotted in % directly on this
                  // axis. Both axes share the same `ticks` positions so
                  // gridlines align.
                  //
                  // It keeps its labels under the privacy toggle: percentages
                  // are never masked, and a % scale alone yields no amount —
                  // recovering one needs `denom`, itself a hidden figure.
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
                  contentStyle={CHART_TOOLTIP_CONTENT_STYLE}
                  content={viewMode === "pnl" ? renderPnlTooltip : undefined}
                  formatter={(value, name) => {
                    const isCompare = name === "compare"
                    const label = isCompare ? NET_INVESTED_LABEL : "Value"
                    return [
                      formatMoney(Number(value), currency, obfuscated),
                      label,
                    ]
                  }}
                  labelFormatter={(label) => {
                    const ms = Number(label)
                    if (Number.isNaN(ms)) return ""
                    const point = chartData.find((p) => p.dateMs === ms)
                    if (point?.label === NOW_LABEL) return NOW_LABEL
                    if (timeRange === "1D") return point?.label ?? ""
                    return formatTooltipDate(ms)
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
                        // A full-opacity 1.5px line in its own neutral: the
                        // card's whole point is "you vs the index", which a
                        // 45%-opacity hairline could not carry.
                        stroke={BENCHMARK_STROKE}
                        fill="transparent"
                        strokeWidth={1.5}
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
                      stroke={BENCHMARK_STROKE}
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

        {/* Time range */}
        <SegmentedControl
          ariaLabel="Time range"
          value={timeRange}
          options={TIME_RANGES.map((r) => ({ id: r.id, label: r.label }))}
          onChange={setTimeRange}
          size="sm"
        />
      </CardContent>
    </Card>
  )
}
