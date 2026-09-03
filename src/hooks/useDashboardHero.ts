import { useMemo } from "react"
import { useTransactionData } from "@/contexts/TransactionDataContext"
import {
  filterByTimeRange,
  computePnLTimeSeries,
  computeCurrentInvestedUsd,
  computeTWRSeries,
  type TimeRange,
} from "@/lib/performance"
import {
  closesAtOrBefore,
  computeLifetimeXirrPct,
  computeMWRSeries,
  computeWhatIfIndexMWRSeries,
} from "@/lib/mwr"
import { buildIntradaySeries } from "@/lib/dashboard/intraday"
import { DISPLAY_LOCALE, NOW_LABEL } from "@/lib/constants/app"
import type { BenchmarkPrice, Snapshot, IntradaySnapshot } from "@/types/database"

export type HeroViewMode = "value" | "pnl"

/** Which return measure the Performance-mode percent race plots.
 *  TWR = time-weighted (strategy vs index, flows removed);
 *  MWR = money-weighted / XIRR (the investor's dollars, flow timing counts). */
export type HeroMeasure = "twr" | "mwr"

/** What the secondary chart line / chip represents at any moment. */
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
  /** P&L-mode index return as cumulative % from the chart's range start, in the
   *  ACTIVE measure: the raw index rebase under TWR, the what-if index (same
   *  flows) under MWR. Always 0 in value mode and at the range-start anchor. */
  benchmarkPct: number
  /** Cumulative portfolio return % since the window start (0 at the start
   *  anchor), in the ACTIVE measure — time-weighted under `measure: "twr"`,
   *  money-weighted (XIRR) under `"mwr"`. Populated in P&L mode; 0 in value
   *  mode. (Field name kept from the TWR-only build; it carries either.) */
  twrPct: number
}

export interface DashboardHeroData {
  chartData: HeroPoint[]
  /** Epoch ms (matching `chartData[i].dateMs`) chosen as X-axis tick
   *  positions: at most one per visible bucket (month for ≥1M ranges,
   *  day for shorter), plus the final "now" anchor. Prevents the same
   *  month label rendering 8× when daily snapshots cluster. */
  xTicks: number[]
  current: { usd: number; try: number }
  /** Current value of the secondary series at "now". `usd`/`try` carry it in
   *  Value mode, `pct` in P&L mode; the unused fields stay at 0 so callers can
   *  ignore them safely. */
  compareNow: { usd: number; try: number; pct: number }
  /** `pct` is null when the window has no real starting base (< $1) —
   *  callers hide the percent rather than fabricate one. */
  delta: { usd: number; try: number; pct: number | null }
  /** Denominator the chart uses to map left-axis (USD/TRY) to right-axis
   *  (%) in P&L mode = portfolio value at the visible range's start. Zero
   *  when there's no usable starting value (e.g. ALL range whose synthetic
   *  zero-anchor lands before the first snapshot); callers must guard. */
  pnlDenom: { usd: number; try: number }
  /** P&L mode: the portfolio's cumulative return % at "now" (window end) in the
   *  ACTIVE measure (TWR or MWR). */
  twrEnd: number
  /** P&L mode: the index's cumulative return % at "now" in the ACTIVE measure
   *  (= last point's benchmarkPct — raw index under TWR, what-if under MWR). */
  benchmarkEnd: number
  /** P&L mode: twrEnd − benchmarkEnd, in percentage points. */
  gapPts: number
  /** P&L mode: window relied on weekly snapshots with a flow → "approximate".
   *  Always false under `measure: "mwr"` (MWR needs no intermediate valuations). */
  approximate: boolean
  /** P&L mode: lifetime annualized XIRR % ("+X.X%/yr" chip). Null when the
   *  history spans < 1 year or the solver has no solution — never a fake 0. */
  lifetimeXirrPct: number | null
}

interface UseDashboardHeroArgs {
  snapshots: Snapshot[]
  intradaySnapshots: IntradaySnapshot[]
  currentValueUsd: number
  currentValueTry: number
  viewMode: HeroViewMode
  timeRange: TimeRange
  /** Which return measure the P&L-mode percent race plots. Only meaningful in
   *  P&L mode outside 1D — the intraday branch ignores it entirely. */
  measure?: HeroMeasure
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
 * Write a dated cumulative-% series onto one of the chart's percent fields,
 * carrying the last known value forward across chart points the series doesn't
 * cover (e.g. the synthetic $0 anchor, or a snapshot the engine skipped).
 */
function applyPctSeries(
  chartData: HeroPoint[],
  points: ReadonlyArray<{ date: string; cumulativePct: number }>,
  field: "twrPct" | "benchmarkPct",
): void {
  const byDate = new Map<string, number>()
  for (const p of points) byDate.set(p.date, p.cumulativePct)
  let last = 0
  for (const point of chartData) {
    const v = byDate.get(point.date)
    if (v !== undefined) last = v
    point[field] = v ?? last
  }
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
    return d.toLocaleDateString(DISPLAY_LOCALE, {
      month: "short",
      day: "numeric",
    })
  }
  // Full 4-digit year: "Feb 26" would read as a day-of-month.
  return d.toLocaleDateString(DISPLAY_LOCALE, {
    month: "short",
    year: "numeric",
  })
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
 *
 * In P&L mode (outside 1D) `measure` selects which return the percent race
 * plots: "twr" (default) draws the time-weighted return vs the index's own
 * return; "mwr" draws the cumulative money-weighted (XIRR) return vs the
 * what-if index (the same external flows placed into the index on the same
 * dates). Both land on the same `twrPct`/`benchmarkPct` fields.
 */
export function useDashboardHero({
  snapshots,
  intradaySnapshots,
  currentValueUsd,
  currentValueTry,
  viewMode,
  timeRange,
  measure = "twr",
  usdTry,
  currentPnlUsd,
  currentPnlTry,
  benchmarkTicker = null,
  benchmarkSeries = [],
}: UseDashboardHeroArgs): DashboardHeroData {
  const { transactions, rates } = useTransactionData()

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
        delta: { usd: 0, try: 0, pct: 0 },
        pnlDenom: { usd: 0, try: 0 },
        twrEnd: 0,
        benchmarkEnd: 0,
        gapPts: 0,
        approximate: false,
        lifetimeXirrPct: null,
      }
    }

    // Lifetime annualized XIRR — range-independent (every external flow ever,
    // against the live value today), so it is computed once for both branches.
    const today = todayLocalIso()
    const lifetimeXirrPct =
      viewMode === "pnl"
        ? computeLifetimeXirrPct(transactions, rates, currentValueUsd, today)
        : null

    // ── 1D: intraday (hourly) view ───────────────────────────────────
    // Built from the rolling-24h intraday totals (time-of-day axis) plus the
    // live "now" anchor — not the daily snapshots. The index/benchmark overlay
    // is suppressed for 1D (one daily close can't draw an intraday line).
    if (timeRange === "1D") {
      const nowMs = Date.now()
      const investedNow = computeCurrentInvestedUsd(transactions, rates)
      const series = buildIntradaySeries({
        intraday: intradaySnapshots,
        nowUsd: currentValueUsd,
        nowTry: currentValueTry,
        nowMs,
      })
      const chartData: HeroPoint[] = series.points.map((p) => {
        const ratio = p.valueUsd > 0 ? p.valueTry / p.valueUsd : usdTry
        const pnlUsd = p.valueUsd - investedNow
        return {
          date: p.date,
          dateMs: p.dateMs,
          label: p.label,
          // Value mode reads valueUsd/valueTry; P&L mode reads twrPct (intraday
          // % change) and the secondary line stays flat at 0 (overlay hidden).
          valueUsd: viewMode === "pnl" ? pnlUsd : p.valueUsd,
          valueTry: viewMode === "pnl" ? pnlUsd * ratio : p.valueTry,
          compareUsd: viewMode === "pnl" ? p.valueUsd : investedNow,
          compareTry: viewMode === "pnl" ? p.valueTry : investedNow * ratio,
          benchmarkPct: 0,
          twrPct: viewMode === "pnl" ? p.twrPct : 0,
        }
      })
      const endUsd = chartData[chartData.length - 1]?.valueUsd ?? 0
      const endTry = chartData[chartData.length - 1]?.valueTry ?? 0
      const pnlDenom =
        viewMode === "pnl" && chartData.length > 0
          ? { usd: chartData[0].compareUsd, try: chartData[0].compareTry }
          : { usd: 0, try: 0 }
      return {
        chartData,
        xTicks: series.xTicks,
        current: { usd: endUsd, try: endTry },
        compareNow:
          viewMode === "pnl"
            ? { usd: 0, try: 0, pct: 0 }
            : {
                usd: chartData[chartData.length - 1]?.compareUsd ?? 0,
                try: chartData[chartData.length - 1]?.compareTry ?? 0,
                pct: 0,
              },
        delta: {
          usd: series.deltaUsd,
          try: series.deltaTry,
          pct: series.deltaPct,
        },
        pnlDenom,
        twrEnd: viewMode === "pnl" ? series.twrEnd : 0,
        benchmarkEnd: 0,
        gapPts: 0,
        approximate: false,
        lifetimeXirrPct,
      }
    }

    // Always compute the P&L series — we need invested capital at each
    // snapshot for the secondary (cost basis / market value) line.
    const pnlSeries = computePnLTimeSeries(snapshots, transactions, rates)
    // Both directions of the snapshot ↔ P&L pairing go by DATE, never by
    // index: the series is built from a sorted copy of the snapshots, so its
    // order is its own and a change to the query's `order by` would silently
    // pair every point with the wrong day. One snapshot per date is a DB
    // uniqueness constraint (`user_id, snapshot_date`).
    const investedAtSnap = new Map<string, number>()
    for (const p of pnlSeries) investedAtSnap.set(p.date, p.investedUsd)
    const snapByDate = new Map(snapshots.map((s) => [s.snapshot_date, s]))

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
      raw = pnlSeries.map((p) => {
        const snap = snapByDate.get(p.date)
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
        twrPct: 0,
      }
    })

    // Benchmark overlay (P&L mode / TWR measure, when series loaded): fill
    // benchmarkPct as cumulative % return from chartData[0].date. Under the MWR
    // measure this raw rebase is replaced by the what-if index below — the fair
    // opponent for a money-weighted portfolio line is the same flows placed into
    // the index, not the index's own buy-and-hold return.
    // The benchmark is
    // anchored on the first point that has a usable close — earlier points
    // stay at 0% so ranges starting before the benchmark's listing date
    // still render cleanly. Yahoo's adjclose is USD-denominated; we expose
    // the same value to both currency display modes (currency-adjusted
    // benchmark return is a separate, future feature).
    if (benchmarkActive && measure === "twr" && chartData.length > 0) {
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

    // Portfolio lead series (the active measure), same window as the chart,
    // extended to live "now". Both engines only read snapshot_date + total_usd,
    // so a minimal "now" snapshot suffices (mirrors the fakeSnapshots cast).
    let twrEnd = 0
    let approximate = false
    if (viewMode === "pnl") {
      const windowSnaps = filterByTimeRange(snapshots, timeRange)
      const nowSnaps = [
        ...windowSnaps,
        {
          snapshot_date: today,
          total_usd: currentValueUsd,
        } as unknown as Snapshot,
      ]
      if (measure === "mwr") {
        // Money-weighted: deposit timing counts, by design. MWR needs no
        // intermediate valuations, so weekly-sampled history is exact — the
        // "approximate" marker stays off.
        const mwr = computeMWRSeries(nowSnaps, transactions, rates)
        twrEnd = mwr.endPct
        approximate = false
        applyPctSeries(chartData, mwr.points, "twrPct")
        // Fair opponent: the same flows, same dates, into the index.
        const whatIf = computeWhatIfIndexMWRSeries(
          nowSnaps,
          transactions,
          rates,
          benchmarkSeries,
        )
        applyPctSeries(chartData, whatIf.points, "benchmarkPct")
      } else {
        const twr = computeTWRSeries(nowSnaps, transactions, rates)
        twrEnd = twr.endPct
        approximate = twr.approximate
        applyPctSeries(chartData, twr.points, "twrPct")
      }
    }

    if (chartData.length > 0) {
      chartData[chartData.length - 1].label = NOW_LABEL
    }

    // Pick one tick per unique label (e.g. "Apr 2026") so the X-axis
    // doesn't repeat the same month/day string for every dense daily
    // snapshot. The last point's label is the "now" label — always include it.
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
    // Period % = ΔValue ÷ the window's starting value. A window with no real
    // starting base (< $1: ALL's synthetic $0 anchor, or a range reaching back
    // before the portfolio existed) gets NO percent (null → hidden) — a Δ
    // against ~$0 has no meaningful base, and the chart already shows the flat
    // run-in. No fallback denominator: peak-invested calculations were removed
    // app-wide (2026-08-28). P&L mode never renders this percent.
    const deltaPct =
      Math.abs(startUsd) >= 1 ? (deltaUsd / Math.abs(startUsd)) * 100 : null

    // In P&L mode the secondary line is always the benchmark (percent);
    // in value mode it's the cost-basis amount (currency). Loading state
    // (P&L mode before the benchmark series arrives) reports percent with
    // a 0 placeholder — a brief 0% blip on first paint, not a wrong unit.
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
      delta: { usd: deltaUsd, try: deltaTry, pct: deltaPct },
      pnlDenom,
      twrEnd,
      benchmarkEnd: end?.benchmarkPct ?? 0,
      gapPts: twrEnd - (end?.benchmarkPct ?? 0),
      approximate,
      lifetimeXirrPct,
    }
  }, [
    snapshots,
    intradaySnapshots,
    transactions,
    rates,
    currentValueUsd,
    currentValueTry,
    viewMode,
    timeRange,
    measure,
    usdTry,
    currentPnlUsd,
    currentPnlTry,
    benchmarkActive,
    benchmarkSeries,
  ])
}
