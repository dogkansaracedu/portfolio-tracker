import { useEffect, useMemo, useState } from "react"
import { useAuth } from "@/hooks/useAuth"
import {
  fetchTransactionsForAllAssets,
  fetchAllExchangeRates,
} from "@/lib/queries/pnl"
import {
  filterByTimeRange,
  computePnLTimeSeries,
  computeCurrentInvestedUsd,
  type TimeRange,
} from "@/lib/performance"
import type { Snapshot, Transaction, ExchangeRate } from "@/types/database"

export type HeroViewMode = "value" | "pnl"

export interface HeroPoint {
  date: string
  label: string
  /** Underlying value in USD (raw — value mode) or P&L in USD (pnl mode). */
  valueUsd: number
  valueTry: number
}

export interface DashboardHeroData {
  chartData: HeroPoint[]
  /** Date strings (matching `chartData[i].date`) chosen as X-axis tick
   *  positions: at most one per visible bucket (month for ≥1M ranges,
   *  day for shorter), plus the final "now" anchor. Prevents the same
   *  month label rendering 8× when daily snapshots cluster. */
  xTicks: string[]
  current: { usd: number; try: number }
  rangeStart: { usd: number; try: number; date: string | null }
  delta: { usd: number; try: number; pct: number }
  loading: boolean
}

interface UseDashboardHeroArgs {
  snapshots: Snapshot[]
  currentValueUsd: number
  currentValueTry: number
  viewMode: HeroViewMode
  timeRange: TimeRange
  usdTry: number
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
}: UseDashboardHeroArgs): DashboardHeroData {
  const { user } = useAuth()
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [rates, setRates] = useState<ExchangeRate[]>([])
  const [pnlLoading, setPnlLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    let cancelled = false
    setPnlLoading(true)
    Promise.all([
      fetchTransactionsForAllAssets(user.id),
      fetchAllExchangeRates(),
    ])
      .then(([txs, rs]) => {
        if (!cancelled) {
          setTransactions(txs)
          setRates(rs)
        }
      })
      .catch((err) => console.error("Failed to load hero data:", err))
      .finally(() => {
        if (!cancelled) setPnlLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [user])

  return useMemo<DashboardHeroData>(() => {
    if (snapshots.length === 0 && currentValueUsd === 0 && currentValueTry === 0) {
      return {
        chartData: [],
        xTicks: [],
        current: { usd: 0, try: 0 },
        rangeStart: { usd: 0, try: 0, date: null },
        delta: { usd: 0, try: 0, pct: 0 },
        loading: pnlLoading,
      }
    }

    type RawPoint = { date: string; usd: number; try: number }
    let raw: RawPoint[] = []

    if (viewMode === "value") {
      raw = snapshots.map((s) => ({
        date: s.snapshot_date,
        usd: s.total_usd ?? 0,
        try: s.total_try ?? 0,
      }))
    } else {
      // P&L: compute true money-weighted P&L per snapshot, then convert
      // to TRY using each snapshot's effective rate (try / usd ratio).
      const pnlSeries = computePnLTimeSeries(snapshots, transactions, rates)
      raw = pnlSeries.map((p, i) => {
        const snap = snapshots[i]
        const snapTotalUsd = snap?.total_usd ?? 0
        const snapTotalTry = snap?.total_try ?? 0
        const ratio = snapTotalUsd > 0 ? snapTotalTry / snapTotalUsd : usdTry
        return { date: p.date, usd: p.pnlUsd, try: p.pnlUsd * ratio }
      })
    }

    // Append the live "now" point so the chart always anchors on today.
    const today = todayLocalIso()
    if (viewMode === "value") {
      raw.push({ date: today, usd: currentValueUsd, try: currentValueTry })
    } else {
      const investedNow = computeCurrentInvestedUsd(transactions, rates)
      const pnlNowUsd = currentValueUsd - investedNow
      const ratio =
        currentValueUsd > 0 ? currentValueTry / currentValueUsd : usdTry
      raw.push({ date: today, usd: pnlNowUsd, try: pnlNowUsd * ratio })
    }

    // For the "ALL" range only, prepend a synthetic zero-anchor one day
    // before the earliest transaction. This makes ΔValue(ALL) =
    // currentValue and ΔP&L(ALL) = total cumulative P&L — i.e. "since
    // money first entered the portfolio", not "since the first snapshot
    // we happened to record". Shorter ranges keep snapshot-anchored
    // semantics (handled by filterByTimeRange's anchor logic).
    if (timeRange === "ALL" && transactions.length > 0 && raw.length > 0) {
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
        raw.unshift({ date: anchorStr, usd: 0, try: 0 })
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
    const fakeSnapshots = raw.map(
      (p) =>
        ({
          snapshot_date: p.date,
          total_usd: p.usd,
          total_try: p.try,
        }) as unknown as Snapshot,
    )
    const filtered = filterByTimeRange(fakeSnapshots, timeRange)

    const chartData: HeroPoint[] = filtered.map((s) => ({
      date: s.snapshot_date,
      label: formatLabel(s.snapshot_date, timeRange),
      valueUsd: s.total_usd ?? 0,
      valueTry: s.total_try ?? 0,
    }))

    if (chartData.length > 0) {
      chartData[chartData.length - 1].label = "Şimdi"
    }

    // Pick one tick per unique label (e.g. "Nis 2026") so the X-axis
    // doesn't repeat the same month/day string for every dense daily
    // snapshot. The last point's label is "Şimdi" — always include it.
    const seen = new Set<string>()
    const xTicks: string[] = []
    for (const p of chartData) {
      if (!seen.has(p.label)) {
        seen.add(p.label)
        xTicks.push(p.date)
      }
    }
    if (
      chartData.length > 0 &&
      xTicks[xTicks.length - 1] !== chartData[chartData.length - 1].date
    ) {
      xTicks.push(chartData[chartData.length - 1].date)
    }

    const start = chartData[0]
    const end = chartData[chartData.length - 1]
    const startUsd = start?.valueUsd ?? 0
    const endUsd = end?.valueUsd ?? 0
    const startTry = start?.valueTry ?? 0
    const endTry = end?.valueTry ?? 0

    const deltaUsd = endUsd - startUsd
    const deltaTry = endTry - startTry
    // Percent denominator:
    //  · Value mode → divide by the period's starting portfolio value
    //    (classic "% return on the value that was sitting there").
    //  · P&L mode   → divide by current invested capital. Dividing by the
    //    starting *P&L* number is meaningless (it produces things like
    //    "+674%" when the period P&L grew from $1,452 → $11,244) and bears
    //    no relation to actual return on investment.
    let pctDenom: number
    let pctNumer: number = deltaUsd
    if (viewMode === "pnl") {
      const investedNow = computeCurrentInvestedUsd(transactions, rates)
      pctDenom = Math.abs(investedNow) || 1
    } else if (timeRange === "ALL" || Math.abs(startUsd) < 1) {
      // ΔValue / startUsd is meaningless when startUsd is ~$0 — either we
      // synthesized a $0 anchor (ALL range) or the period began before the
      // portfolio had any pricable holdings (e.g. crypto bought before
      // CoinGecko's 365-day free window). Falling back to delta/1 prints
      // millions-of-percent. Use lifetime return (totalPnL / invested)
      // instead so the % stays meaningful and matches the P&L subtitle.
      const investedNow = computeCurrentInvestedUsd(transactions, rates)
      pctDenom = Math.abs(investedNow) || 1
      pctNumer = currentValueUsd - investedNow
    } else {
      pctDenom = Math.abs(startUsd) || 1
    }

    const deltaPct = pctDenom !== 0 ? (pctNumer / pctDenom) * 100 : 0

    return {
      chartData,
      xTicks,
      current: { usd: endUsd, try: endTry },
      rangeStart: { usd: startUsd, try: startTry, date: start?.date ?? null },
      delta: { usd: deltaUsd, try: deltaTry, pct: deltaPct },
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
    pnlLoading,
  ])
}
