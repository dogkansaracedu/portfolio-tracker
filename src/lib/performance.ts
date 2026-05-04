import { bn, BN_ZERO, BN_HUNDRED } from "@/lib/config"
import { normalizeToUsd } from "@/lib/pnl/currency"
import type { Snapshot, Transaction, ExchangeRate } from "@/types/database"

export type TimeRange =
  | "1D"
  | "1W"
  | "1M"
  | "3M"
  | "6M"
  | "YTD"
  | "1Y"
  | "ALL"

export interface PnLPoint {
  date: string
  totalUsd: number
  investedUsd: number
  pnlUsd: number
}

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

function pad2(n: number): string {
  return n.toString().padStart(2, "0")
}

/** Local-date "YYYY-MM-DD" string (avoids timezone drift from toISOString). */
function localIso(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

export function filterByTimeRange(
  snapshots: Snapshot[],
  range: TimeRange,
): Snapshot[] {
  if (range === "ALL" || snapshots.length === 0) return snapshots

  const now = new Date()
  let cutoff: Date

  switch (range) {
    case "1D":
      cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
      break
    case "1W":
      cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7)
      break
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

  const cutoffStr = localIso(cutoff)
  const inRange = snapshots.filter((s) => s.snapshot_date >= cutoffStr)

  // For ranges of 1 month or longer, include the latest snapshot strictly
  // before the cutoff as a "start anchor". This keeps the chart populated
  // when snapshot granularity is monthly (e.g. monthly snapshots and a "1M"
  // window where the closest snapshot is just outside the window). We do
  // NOT do this for 1D / 1W because extending those back to a month-ago
  // snapshot would misrepresent the requested range.
  const supportsAnchor =
    range === "1M" ||
    range === "3M" ||
    range === "6M" ||
    range === "YTD" ||
    range === "1Y"

  if (supportsAnchor) {
    let anchorIdx = -1
    for (let i = 0; i < snapshots.length; i++) {
      if (snapshots[i].snapshot_date < cutoffStr) {
        anchorIdx = i
      } else {
        break
      }
    }
    if (anchorIdx >= 0) {
      return [snapshots[anchorIdx], ...inRange]
    }
  }

  return inRange
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
  if (!endSnapshot.breakdown.by_category) return []

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

/**
 * Apply a single transaction's impact on cumulative net invested capital (USD).
 *
 * Convention used here:
 *   buy            -> +total + fee   (real cash deployed for an asset)
 *   sell           -> -total + fee   (cash returned, fee still consumed)
 *   transfer_in    -> +total         (cost basis carried in — opening
 *                                     balance or platform-to-platform move)
 *   transfer_out   -> -total         (cost basis carried out — symmetric)
 *   dividend       -> -total         (cash returned to the account)
 *   interest       -> -total         (cash returned to the account)
 *   fee            -> +fee || +total (standalone fee — pure cost)
 *
 * For genuine platform-to-platform transfers (a transfer_out paired with a
 * transfer_in of equal cost basis), the two cancel and the net invested
 * stays unchanged. For "loading event" / opening-balance entries (a lone
 * transfer_in with no matching out), the cost basis recorded on the
 * transaction is added to invested capital — so the asset doesn't appear
 * to be "free" relative to its current value.
 */
function applyTxToInvested(
  tx: Transaction,
  rates: ExchangeRate[],
  cum: ReturnType<typeof bn>,
): ReturnType<typeof bn> {
  const totalUsd = normalizeToUsd(
    tx.total_cost ?? 0,
    tx.price_currency,
    tx.date,
    rates,
  )
  const feeUsd = tx.fee
    ? normalizeToUsd(tx.fee, tx.fee_currency ?? tx.price_currency, tx.date, rates)
    : bn(0)

  switch (tx.type) {
    case "buy":
      return cum.plus(totalUsd).plus(feeUsd)
    case "sell":
      return cum.minus(totalUsd).plus(feeUsd)
    case "transfer_in":
      return cum.plus(totalUsd)
    case "transfer_out":
      return cum.minus(totalUsd)
    case "dividend":
    case "interest":
      return cum.minus(totalUsd)
    case "fee":
      return cum.plus(feeUsd.isZero() ? totalUsd : feeUsd)
    default:
      return cum
  }
}

/**
 * Compute a P&L time series from snapshots and transactions.
 *
 * P&L at time T is defined as `total_value(T) - net_invested_capital(T)`.
 * Net invested capital is the cumulative cost basis deployed: buys plus
 * fees minus sells minus dividends/interest received, with `transfer_in`
 * adding and `transfer_out` subtracting the recorded cost basis. Real
 * platform-to-platform transfers cancel out (out + in net to zero);
 * opening-balance entries (lone `transfer_in`s) correctly add their cost
 * basis so the asset isn't treated as zero-cost.
 *
 * Transactions must be sortable by date. Rates are used to normalize
 * non-USD totals to USD.
 */
export function computePnLTimeSeries(
  snapshots: Snapshot[],
  transactions: Transaction[],
  rates: ExchangeRate[],
): PnLPoint[] {
  if (snapshots.length === 0) return []

  const txs = [...transactions].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
  )

  const series: PnLPoint[] = []
  let cumInvested = bn(0)
  let txIdx = 0

  for (const snap of snapshots) {
    const cutoff = snap.snapshot_date

    while (txIdx < txs.length && txs[txIdx].date <= cutoff) {
      cumInvested = applyTxToInvested(txs[txIdx], rates, cumInvested)
      txIdx++
    }

    const totalUsd = bn(snap.total_usd ?? 0)
    const pnl = totalUsd.minus(cumInvested)

    series.push({
      date: snap.snapshot_date,
      totalUsd: totalUsd.toNumber(),
      investedUsd: cumInvested.toNumber(),
      pnlUsd: pnl.toNumber(),
    })
  }

  return series
}

/**
 * Compute the current cumulative net invested capital in USD across all
 * transactions (treats all transactions as "applied" through "now"). Used
 * to anchor the live "now" point in the P&L series.
 */
export function computeCurrentInvestedUsd(
  transactions: Transaction[],
  rates: ExchangeRate[],
): number {
  let cum = bn(0)
  for (const tx of transactions) {
    cum = applyTxToInvested(tx, rates, cum)
  }
  return cum.toNumber()
}
