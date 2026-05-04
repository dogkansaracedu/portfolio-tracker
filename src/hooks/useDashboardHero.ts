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

    // For P&L mode, prepend a synthetic zero-anchor one day before the
    // earliest transaction. This ensures the "ALL" range delta equals
    // lifetime cumulative P&L (instead of "P&L change since first
    // snapshot", which silently drops any unrealized gain that already
    // existed at the moment of the first snapshot — a pre-existing bug
    // that made the headline number disagree with the "Total" subtitle).
    //
    // For shorter ranges (1M/3M/YTD/1Y), filterByTimeRange picks the
    // closest snapshot before the cutoff as anchor, so this 0-point only
    // wins when the requested cutoff is older than the earliest tx —
    // i.e. effectively just for "ALL".
    if (viewMode === "pnl" && transactions.length > 0 && raw.length > 0) {
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

    const start = chartData[0]
    const end = chartData[chartData.length - 1]
    const startUsd = start?.valueUsd ?? 0
    const endUsd = end?.valueUsd ?? 0
    const startTry = start?.valueTry ?? 0
    const endTry = end?.valueTry ?? 0

    let deltaUsd = endUsd - startUsd
    let deltaTry = endTry - startTry
    // Percent denominator:
    //  · Value mode → divide by the period's starting portfolio value
    //    (classic "% return on the value that was sitting there").
    //  · P&L mode   → divide by current invested capital. Dividing by the
    //    starting *P&L* number is meaningless (it produces things like
    //    "+674%" when the period P&L grew from $1,452 → $11,244) and bears
    //    no relation to actual return on investment.
    let pctDenom: number
    if (viewMode === "pnl") {
      const investedNow = computeCurrentInvestedUsd(transactions, rates)
      pctDenom = Math.abs(investedNow) || 1
    } else {
      pctDenom = Math.abs(startUsd) || 1
    }

    // Value-mode "ALL" override: the snapshot-to-snapshot delta misses any
    // unrealized gain that already existed at the time of the first snapshot
    // (e.g. a deposit happened before snapshots started recording, or prices
    // moved between deposit and first snapshot). For lifetime semantics the
    // honest answer is "current value − total invested" = total P&L. Shorter
    // ranges keep snapshot-delta semantics because there "value change for
    // the period" is the right reading (deposits in-period included).
    if (viewMode === "value" && timeRange === "ALL") {
      const investedNow = computeCurrentInvestedUsd(transactions, rates)
      const totalPnlUsd = currentValueUsd - investedNow
      const ratio =
        currentValueUsd > 0 ? currentValueTry / currentValueUsd : usdTry
      deltaUsd = totalPnlUsd
      deltaTry = totalPnlUsd * ratio
      pctDenom = Math.abs(investedNow) || 1
    }
    const deltaPct = pctDenom !== 0 ? (deltaUsd / pctDenom) * 100 : 0

    return {
      chartData,
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
