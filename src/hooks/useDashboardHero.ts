import { useMemo } from "react"
import { useTransactionData } from "@/contexts/TransactionDataContext"
import {
  filterByTimeRange,
  computePnLTimeSeries,
  computeCurrentInvestedUsd,
  computePeakInvestedUsd,
  type TimeRange,
} from "@/lib/performance"
import { resolveHeroPctDenom } from "@/lib/dashboard/heroPercent"
import type { BenchmarkPrice, Snapshot } from "@/types/database"

export type HeroViewMode = "value" | "pnl"

/** What the secondary chart line / chip represents at any moment. */
export type CompareKind = "currency" | "percent"

export interface HeroPoint {
  date: string
  /** Epoch milliseconds for `date` at UTC midnight. Used by Recharts as
   *  the X-axis numeric value so points are positioned by actual time
   *  span (not by uniform array index). */
  dateMs: number
  label: string
  /** Underlying value in USD (raw — value mode) or P&L in USD (pnl mode). */
  valueUsd: number
  valueTry: number
  /** Value-mode secondary series — cost basis (currency). Unused in P&L
   *  mode; kept on the type so the data shape is uniform. */
  compareUsd: number
  compareTry: number
  /** P&L-mode benchmark return as cumulative % from the chart's range start.
   *  Always 0 in value mode and at the range-start anchor itself. */
  benchmarkPct: number
}

export interface DashboardHeroData {
  chartData: HeroPoint[]
  /** Epoch ms (matching `chartData[i].dateMs`) chosen as X-axis tick
   *  positions: at most one per visible bucket (month for ≥1M ranges,
   *  day for shorter), plus the final "now" anchor. Prevents the same
   *  month label rendering 8× when daily snapshots cluster. */
  xTicks: number[]
  current: { usd: number; try: number }
  /** Current value of the secondary series at "now". `usd`/`try` are
   *  populated when `compareKind === 'currency'`; `pct` when 'percent'.
   *  The unused fields stay at 0 so callers can ignore them safely. */
  compareNow: { usd: number; try: number; pct: number }
  compareKind: CompareKind
  rangeStart: { usd: number; try: number; date: string | null }
  delta: { usd: number; try: number; pct: number }
  /** Denominator the chart uses to map left-axis (USD/TRY) to right-axis
   *  (%) in P&L mode = portfolio value at the visible range's start. Zero
   *  when there's no usable starting value (e.g. ALL range whose synthetic
   *  zero-anchor lands before the first snapshot); callers must guard. */
  pnlDenom: { usd: number; try: number }
  loading: boolean
}

interface UseDashboardHeroArgs {
  snapshots: Snapshot[]
  currentValueUsd: number
  currentValueTry: number
  viewMode: HeroViewMode
  timeRange: TimeRange
  usdTry: number
  /** P&L mode: live total P&L (usePnLSummary) used to anchor the chart's "now"
   *  point so it matches the headline Total. Falls back to value − invested. */
  currentPnlUsd?: number
  currentPnlTry?: number
  /** When set (P&L mode only), the secondary line shows the benchmark's
   *  cumulative % return from the range start instead of market value. */
  benchmarkTicker?: string | null
  benchmarkSeries?: BenchmarkPrice[]
}

/**
 * Two-pointer lookup: walk `series` (already sorted ascending by date) in
 * lockstep with the caller's ascending date list. Returns the close at or
 * before `target` for each target. `null` when no preceding close exists.
 *
 * Linear in the larger of the two lists — beats N × O(log N) binary searches
 * when chart and benchmark are both dense (5y daily ≈ 1250 rows).
 */
function closesAtOrBefore(
  series: BenchmarkPrice[],
  targets: string[],
): Array<number | null> {
  const out: Array<number | null> = new Array(targets.length).fill(null)
  if (series.length === 0) return out
  let i = 0
  let lastClose: number | null = null
  for (let t = 0; t < targets.length; t++) {
    const target = targets[t]
    while (i < series.length && series[i].date <= target) {
      lastClose = series[i].close_usd
      i++
    }
    out[t] = lastClose
  }
  return out
}

function pad2(n: number): string {
  return n.toString().padStart(2, "0")
}

function todayLocalIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

function formatLabel(dateStr: string, range: TimeRange): string {
  const d = new Date(dateStr)
  if (range === "1D" || range === "1W") {
    return d.toLocaleDateString("tr-TR", { day: "2-digit", month: "short" })
  }
  // Use full 4-digit year to avoid the "Şub 26" ambiguity (which Turkish
  // readers can mis-parse as "26 Şubat" — i.e. day 26 of February —
  // instead of "Şub 2026"). "Şub 2026" is unambiguous.
  return d.toLocaleDateString("tr-TR", { month: "short", year: "numeric" })
}

/**
 * Build the hero card's time series and period delta.
 *
 * Value mode  -> chartData is total portfolio value; delta is ΔValue.
 * P&L mode    -> chartData is true money-weighted P&L (value − net cash
 *                deployed) at each point; delta is ΔP&L (period gain/loss
 *                excluding new deposits and withdrawals).
 *
 * Transfers (incl. opening-balance entries) are treated as neutral cash
 * flows so they don't distort short-range P&L.
 */
export function useDashboardHero({
  snapshots,
  currentValueUsd,
  currentValueTry,
  viewMode,
  timeRange,
  usdTry,
  currentPnlUsd,
  currentPnlTry,
  benchmarkTicker = null,
  benchmarkSeries = [],
}: UseDashboardHeroArgs): DashboardHeroData {
  const { transactions, rates, loading: pnlLoading } = useTransactionData()

  // Benchmark overlay only applies in P&L mode. Value mode keeps the
  // existing cost-basis secondary line. Memoise the "is benchmark active"
  // flag so the main useMemo dep array stays stable when the user toggles
  // back to Value.
  const benchmarkActive =
    viewMode === "pnl" && !!benchmarkTicker && benchmarkSeries.length > 0

  return useMemo<DashboardHeroData>(() => {
    if (snapshots.length === 0 && currentValueUsd === 0 && currentValueTry === 0) {
      return {
        chartData: [],
        xTicks: [],
        current: { usd: 0, try: 0 },
        compareNow: { usd: 0, try: 0, pct: 0 },
        compareKind: "currency",
        rangeStart: { usd: 0, try: 0, date: null },
        delta: { usd: 0, try: 0, pct: 0 },
        pnlDenom: { usd: 0, try: 0 },
        loading: pnlLoading,
      }
    }

    // Always compute the P&L series — we need invested capital at each
    // snapshot for the secondary (cost basis / market value) line.
    const pnlSeries = computePnLTimeSeries(snapshots, transactions, rates)
    const investedAtSnap = new Map<string, number>()
    for (const p of pnlSeries) investedAtSnap.set(p.date, p.investedUsd)

    type RawPoint = {
      date: string
      usd: number
      try: number
      compareUsd: number
      compareTry: number
    }
    let raw: RawPoint[] = []

    if (viewMode === "value") {
      raw = snapshots.map((s) => {
        const snapTotalUsd = s.total_usd ?? 0
        const snapTotalTry = s.total_try ?? 0
        const ratio =
          snapTotalUsd > 0 ? snapTotalTry / snapTotalUsd : usdTry
        const investedUsd = investedAtSnap.get(s.snapshot_date) ?? 0
        return {
          date: s.snapshot_date,
          usd: snapTotalUsd,
          try: snapTotalTry,
          compareUsd: investedUsd,
          compareTry: investedUsd * ratio,
        }
      })
    } else {
      // P&L: compute true money-weighted P&L per snapshot, then convert
      // to TRY using each snapshot's effective rate (try / usd ratio).
      raw = pnlSeries.map((p, i) => {
        const snap = snapshots[i]
        const snapTotalUsd = snap?.total_usd ?? 0
        const snapTotalTry = snap?.total_try ?? 0
        const ratio = snapTotalUsd > 0 ? snapTotalTry / snapTotalUsd : usdTry
        return {
          date: p.date,
          usd: p.pnlUsd,
          try: p.pnlUsd * ratio,
          compareUsd: snapTotalUsd,
          compareTry: snapTotalTry,
        }
      })
    }

    // Append the live "now" point so the chart always anchors on today.
    const today = todayLocalIso()
    const investedNow = computeCurrentInvestedUsd(transactions, rates)
    const nowRatio =
      currentValueUsd > 0 ? currentValueTry / currentValueUsd : usdTry
    if (viewMode === "value") {
      raw.push({
        date: today,
        usd: currentValueUsd,
        try: currentValueTry,
        compareUsd: investedNow,
        compareTry: investedNow * nowRatio,
      })
    } else {
      // Anchor the "now" point to the live P&L total so chart == headline.
      const pnlNowUsd =
        currentPnlUsd != null ? currentPnlUsd : currentValueUsd - investedNow
      const pnlNowTry =
        currentPnlTry != null ? currentPnlTry : pnlNowUsd * nowRatio
      raw.push({
        date: today,
        usd: pnlNowUsd,
        try: pnlNowTry,
        compareUsd: currentValueUsd,
        compareTry: currentValueTry,
      })
    }

    // Prepend a synthetic zero-anchor one day before the earliest
    // transaction (any range). This makes the chart start at the user's
    // actual entry point — "since money first entered the portfolio" —
    // rather than at the requested window edge (where there were no
    // positions yet). 1Y/YTD with no pre-cutoff history therefore behave
    // like ALL: chart begins at first-tx-1, not at cutoff. Matches the
    // pattern brokers use for newly-listed instruments.
    if (transactions.length > 0 && raw.length > 0) {
      let earliest = transactions[0].date.slice(0, 10)
      for (let i = 1; i < transactions.length; i++) {
        const d = transactions[i].date.slice(0, 10)
        if (d < earliest) earliest = d
      }
      const anchorDate = new Date(`${earliest}T00:00:00Z`)
      anchorDate.setUTCDate(anchorDate.getUTCDate() - 1)
      const anchorStr = `${anchorDate.getUTCFullYear()}-${pad2(
        anchorDate.getUTCMonth() + 1,
      )}-${pad2(anchorDate.getUTCDate())}`
      // Avoid prepending if first raw point is already at/before this date.
      if (raw[0].date > anchorStr) {
        raw.unshift({
          date: anchorStr,
          usd: 0,
          try: 0,
          compareUsd: 0,
          compareTry: 0,
        })
      }
    }

    // Avoid duplicate "today" entry if today's snapshot already exists.
    if (raw.length >= 2) {
      const last = raw[raw.length - 1]
      const prev = raw[raw.length - 2]
      if (prev.date === last.date) {
        raw.splice(raw.length - 2, 1)
      }
    }

    // Filter by time range (with anchor for ≥1M ranges — see filterByTimeRange).
    // Keep compare values keyed by date so the filter (which only sees the
    // canonical snapshot fields) doesn't drop them.
    const compareByDate = new Map<string, { usd: number; try: number }>()
    for (const p of raw) {
      compareByDate.set(p.date, { usd: p.compareUsd, try: p.compareTry })
    }
    const fakeSnapshots = raw.map(
      (p) =>
        ({
          snapshot_date: p.date,
          total_usd: p.usd,
          total_try: p.try,
        }) as unknown as Snapshot,
    )
    const filtered = filterByTimeRange(fakeSnapshots, timeRange)

    const chartData: HeroPoint[] = filtered.map((s) => {
      const compare = compareByDate.get(s.snapshot_date) ?? { usd: 0, try: 0 }
      return {
        date: s.snapshot_date,
        dateMs: new Date(`${s.snapshot_date}T00:00:00Z`).getTime(),
        label: formatLabel(s.snapshot_date, timeRange),
        valueUsd: s.total_usd ?? 0,
        valueTry: s.total_try ?? 0,
        // Value mode: snapshot's invested USD/TRY (cost basis line).
        // P&L mode: snapshot's market value (= total). We read [0] below
        // to derive the right-axis denominator before this field becomes
        // dead-weight for P&L mode (which doesn't draw a compare line).
        compareUsd: compare.usd,
        compareTry: compare.try,
        benchmarkPct: 0,
      }
    })

    // Benchmark overlay (P&L mode, when series loaded): fill benchmarkPct
    // as cumulative % return from chartData[0].date. The benchmark is
    // anchored on the first point that has a usable close — earlier points
    // stay at 0% so ranges starting before the benchmark's listing date
    // still render cleanly. Yahoo's adjclose is USD-denominated; we expose
    // the same value to both currency display modes (currency-adjusted
    // benchmark return is a separate, future feature).
    if (benchmarkActive && chartData.length > 0) {
      const dates = chartData.map((p) => p.date)
      const closes = closesAtOrBefore(benchmarkSeries, dates)
      let base: number | null = null
      for (const c of closes) {
        if (c != null && c > 0) {
          base = c
          break
        }
      }
      if (base != null && base > 0) {
        for (let i = 0; i < chartData.length; i++) {
          const c = closes[i]
          chartData[i].benchmarkPct =
            c != null && c > 0 ? (c / base - 1) * 100 : 0
        }
      }
    }

    if (chartData.length > 0) {
      chartData[chartData.length - 1].label = "Şimdi"
    }

    // Pick one tick per unique label (e.g. "Nis 2026") so the X-axis
    // doesn't repeat the same month/day string for every dense daily
    // snapshot. The last point's label is "Şimdi" — always include it.
    const seen = new Set<string>()
    const xTicks: number[] = []
    for (const p of chartData) {
      if (!seen.has(p.label)) {
        seen.add(p.label)
        xTicks.push(p.dateMs)
      }
    }
    if (
      chartData.length > 0 &&
      xTicks[xTicks.length - 1] !== chartData[chartData.length - 1].dateMs
    ) {
      xTicks.push(chartData[chartData.length - 1].dateMs)
    }

    const start = chartData[0]
    const end = chartData[chartData.length - 1]
    const startUsd = start?.valueUsd ?? 0
    const endUsd = end?.valueUsd ?? 0
    const startTry = start?.valueTry ?? 0
    const endTry = end?.valueTry ?? 0

    const deltaUsd = endUsd - startUsd
    const deltaTry = endTry - startTry
    // Percent denominator (resolveHeroPctDenom):
    //  · Value mode, normal window → the period's starting portfolio value.
    //  · P&L mode, or value mode with an ~$0 start (ALL range / pre-history) →
    //    PEAK net invested, the same base as the headline Total P&L % (one
    //    denominator everywhere; stable across withdrawals). In the ~$0-start
    //    case the numerator also switches to lifetime P&L (value − invested),
    //    so the figure equals the headline Total P&L % exactly.
    let pctNumer: number = deltaUsd
    if (viewMode !== "pnl" && (timeRange === "ALL" || Math.abs(startUsd) < 1)) {
      pctNumer = currentValueUsd - computeCurrentInvestedUsd(transactions, rates)
    }
    const peakInvested = computePeakInvestedUsd(transactions, rates).toNumber()
    const pctDenom =
      resolveHeroPctDenom({ viewMode, timeRange, startUsd, peakInvested }) || 1

    const deltaPct = pctDenom !== 0 ? (pctNumer / pctDenom) * 100 : 0

    // In P&L mode the secondary line is always the benchmark (percent);
    // in value mode it's the cost-basis amount (currency). Loading state
    // (P&L mode before the benchmark series arrives) reports percent with
    // a 0 placeholder — a brief 0% blip on first paint, not a wrong unit.
    const compareKind: CompareKind = viewMode === "pnl" ? "percent" : "currency"
    const endCompare = end
      ? viewMode === "pnl"
        ? { usd: 0, try: 0, pct: end.benchmarkPct }
        : { usd: end.compareUsd, try: end.compareTry, pct: 0 }
      : { usd: 0, try: 0, pct: 0 }

    // pnlDenom = portfolio value at the visible range's first point. In
    // P&L mode this is the snapshot total we stashed on `compareUsd/Try`
    // before computing the chart. It's the denominator that maps the
    // left-axis (USD/TRY P&L) to the right-axis (%) so the green line
    // reads consistently off both axes. 0 in value mode (caller ignores).
    const pnlDenom =
      viewMode === "pnl" && start
        ? { usd: start.compareUsd, try: start.compareTry }
        : { usd: 0, try: 0 }

    return {
      chartData,
      xTicks,
      current: { usd: endUsd, try: endTry },
      compareNow: endCompare,
      compareKind,
      rangeStart: { usd: startUsd, try: startTry, date: start?.date ?? null },
      delta: { usd: deltaUsd, try: deltaTry, pct: deltaPct },
      pnlDenom,
      loading: pnlLoading,
    }
  }, [
    snapshots,
    transactions,
    rates,
    currentValueUsd,
    currentValueTry,
    viewMode,
    timeRange,
    usdTry,
    currentPnlUsd,
    currentPnlTry,
    pnlLoading,
    benchmarkActive,
    benchmarkSeries,
  ])
}
