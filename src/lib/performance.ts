import { bn, BN_ZERO, BN_HUNDRED } from "@/lib/config"
import type { Snapshot } from "@/types/database"

export type TimeRange = "1M" | "3M" | "6M" | "YTD" | "1Y" | "ALL"

export interface MonthlyReturn {
  month: string // "2026-03"
  label: string // "Mar 2026"
  returnPct: number
  returnUsd: number
}

export interface PerformanceMetrics {
  monthlyReturns: MonthlyReturn[]
  ytdReturnPct: number | null
  allTimeReturnPct: number | null
  cagr: number | null
  maxDrawdownPct: number
  bestMonth: MonthlyReturn | null
  worstMonth: MonthlyReturn | null
  drawdownSeries: { date: string; drawdownPct: number }[]
}

const monthLabels = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
]

function formatMonthLabel(dateStr: string): string {
  const d = new Date(dateStr)
  return `${monthLabels[d.getMonth()]} ${d.getFullYear()}`
}

export function filterByTimeRange(
  snapshots: Snapshot[],
  range: TimeRange,
): Snapshot[] {
  if (range === "ALL" || snapshots.length === 0) return snapshots

  const now = new Date()
  let cutoff: Date

  switch (range) {
    case "1M":
      cutoff = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate())
      break
    case "3M":
      cutoff = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate())
      break
    case "6M":
      cutoff = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate())
      break
    case "YTD":
      cutoff = new Date(now.getFullYear(), 0, 1)
      break
    case "1Y":
      cutoff = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate())
      break
  }

  const cutoffStr = cutoff.toISOString().slice(0, 10)
  return snapshots.filter((s) => s.snapshot_date >= cutoffStr)
}

export function computeMonthlyReturns(snapshots: Snapshot[]): MonthlyReturn[] {
  const returns: MonthlyReturn[] = []

  for (let i = 1; i < snapshots.length; i++) {
    const prev = bn(snapshots[i - 1].total_usd)
    const curr = bn(snapshots[i].total_usd)

    if (prev.isZero()) continue

    const returnPct = curr.minus(prev).div(prev).times(BN_HUNDRED).toNumber()
    const returnUsd = curr.minus(prev).toNumber()

    returns.push({
      month: snapshots[i].snapshot_date.slice(0, 7),
      label: formatMonthLabel(snapshots[i].snapshot_date),
      returnPct,
      returnUsd,
    })
  }

  return returns
}

export function computeYTDReturn(snapshots: Snapshot[]): number | null {
  if (snapshots.length < 2) return null

  const year = new Date().getFullYear()
  const janSnapshot = snapshots.find(
    (s) => s.snapshot_date.startsWith(`${year}-01`),
  )
  const latest = snapshots[snapshots.length - 1]

  if (!janSnapshot || !latest) return null

  const start = bn(janSnapshot.total_usd)
  if (start.isZero()) return null

  return bn(latest.total_usd).minus(start).div(start).times(BN_HUNDRED).toNumber()
}

export function computeAllTimeReturn(snapshots: Snapshot[]): number | null {
  if (snapshots.length < 2) return null

  const earliest = bn(snapshots[0].total_usd)
  const latest = bn(snapshots[snapshots.length - 1].total_usd)

  if (earliest.isZero()) return null
  return latest.minus(earliest).div(earliest).times(BN_HUNDRED).toNumber()
}

export function computeCAGR(snapshots: Snapshot[]): number | null {
  if (snapshots.length < 2) return null

  const earliest = snapshots[0]
  const latest = snapshots[snapshots.length - 1]

  const startVal = bn(earliest.total_usd)
  const endVal = bn(latest.total_usd)

  if (startVal.isLessThanOrEqualTo(0)) return null

  const startDate = new Date(earliest.snapshot_date)
  const endDate = new Date(latest.snapshot_date)
  const years =
    (endDate.getTime() - startDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000)

  if (years < 0.08) return null // Less than ~1 month

  const ratio = endVal.div(startVal).toNumber()
  return (Math.pow(ratio, 1 / years) - 1) * 100
}

export function computeDrawdown(
  snapshots: Snapshot[],
): { date: string; drawdownPct: number }[] {
  const series: { date: string; drawdownPct: number }[] = []
  let peak = BN_ZERO

  for (const snap of snapshots) {
    const val = bn(snap.total_usd)
    if (val.isGreaterThan(peak)) peak = val

    const drawdownPct = peak.isGreaterThan(0)
      ? val.minus(peak).div(peak).times(BN_HUNDRED).toNumber()
      : 0
    series.push({ date: snap.snapshot_date, drawdownPct })
  }

  return series
}

export function computeCategoryAttribution(
  startSnapshot: Snapshot | undefined,
  endSnapshot: Snapshot | undefined,
): { category: string; startUsd: number; endUsd: number; changeUsd: number; contributionPct: number }[] {
  if (!startSnapshot?.breakdown || !endSnapshot?.breakdown) return []

  const startTotal = bn(startSnapshot.total_usd)
  if (startTotal.isZero()) return []

  const categories = Object.keys(endSnapshot.breakdown.by_category)
  return categories.map((cat) => {
    const startUsd = bn(startSnapshot.breakdown?.by_category[cat as keyof typeof startSnapshot.breakdown.by_category]?.usd)
    const endUsd = bn(endSnapshot.breakdown?.by_category[cat as keyof typeof endSnapshot.breakdown.by_category]?.usd)
    const changeUsd = endUsd.minus(startUsd)

    return {
      category: cat,
      startUsd: startUsd.toNumber(),
      endUsd: endUsd.toNumber(),
      changeUsd: changeUsd.toNumber(),
      contributionPct: changeUsd.div(startTotal).times(BN_HUNDRED).toNumber(),
    }
  }).sort((a, b) => Math.abs(b.contributionPct) - Math.abs(a.contributionPct))
}

export function computePerformanceMetrics(
  snapshots: Snapshot[],
): PerformanceMetrics {
  const monthlyReturns = computeMonthlyReturns(snapshots)
  const ytdReturnPct = computeYTDReturn(snapshots)
  const allTimeReturnPct = computeAllTimeReturn(snapshots)
  const cagr = computeCAGR(snapshots)
  const drawdownSeries = computeDrawdown(snapshots)
  const maxDrawdownPct =
    drawdownSeries.length > 0
      ? Math.min(...drawdownSeries.map((d) => d.drawdownPct))
      : 0

  const bestMonth =
    monthlyReturns.length > 0
      ? monthlyReturns.reduce((a, b) =>
          a.returnPct > b.returnPct ? a : b,
        )
      : null

  const worstMonth =
    monthlyReturns.length > 0
      ? monthlyReturns.reduce((a, b) =>
          a.returnPct < b.returnPct ? a : b,
        )
      : null

  return {
    monthlyReturns,
    ytdReturnPct,
    allTimeReturnPct,
    cagr,
    maxDrawdownPct,
    bestMonth,
    worstMonth,
    drawdownSeries,
  }
}
