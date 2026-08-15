import { bn, BN_ZERO, homeDayIso } from "@/lib/config"
import { computeFIFOLots } from "@/lib/pnl/fifo"
import type { ExchangeRate, Snapshot, Transaction } from "@/types/database"
import type { TimeRange } from "@/lib/performance"

/** One charted point of an asset's history, read from a snapshot's per-asset
 *  breakdown (platform slices summed; `priceUsd` is per-unit, identical across
 *  a ticker's slices on a given date). */
export interface AssetHistoryPoint {
  date: string
  valueUsd: number
  valueTry: number
  priceUsd: number
  amount: number
  /** The snapshot's own frozen USD/TRY rate — used to render USD-anchored
   *  overlays (cost basis) on the TRY value axis without retro-converting
   *  history at today's rate. */
  usdTry: number
  /** FIFO cost basis of the lots still held on this date, USD. Attached by
   *  {@link attachCostBasis}; absent until then. */
  costBasisUsd?: number
}

/**
 * The asset's frozen history: for each snapshot that covers the ticker, sum its
 * `by_asset` slices (one per platform) into a single point. Snapshots that lack
 * the ticker produce no point — the chart never fabricates values. Matching is
 * by ticker (the snapshot key), not asset id; safe because the catalog is
 * global one-row-per-ticker. Returned ascending by date.
 */
export function buildAssetHistory(
  snapshots: Snapshot[],
  ticker: string,
): AssetHistoryPoint[] {
  const points: AssetHistoryPoint[] = []
  for (const s of snapshots) {
    const entries = s.breakdown?.by_asset?.filter((e) => e.ticker === ticker)
    if (!entries || entries.length === 0) continue
    let valueUsd = BN_ZERO
    let valueTry = BN_ZERO
    let amount = BN_ZERO
    for (const e of entries) {
      valueUsd = valueUsd.plus(bn(e.value_usd))
      valueTry = valueTry.plus(bn(e.value_try))
      amount = amount.plus(bn(e.amount))
    }
    points.push({
      date: s.snapshot_date,
      valueUsd: valueUsd.toNumber(),
      valueTry: valueTry.toNumber(),
      priceUsd: entries[0].price_usd,
      amount: amount.toNumber(),
      usdTry: s.breakdown?.rates?.usd_try ?? 0,
    })
  }
  return points.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
}

/**
 * Attach the FIFO cost basis held on each point's date: the asset's
 * transactions up to that home-local day are replayed through the engine's
 * `computeFIFOLots` — per (asset, platform), the same composite key the P&L
 * engine uses, so transfers carry basis across platforms identically — and the
 * remaining lots' USD cost is summed. No new P&L math, just the engine
 * evaluated at historical cutoffs.
 */
export function attachCostBasis(
  points: AssetHistoryPoint[],
  transactions: Transaction[],
  rates: ExchangeRate[],
): AssetHistoryPoint[] {
  if (points.length === 0) return points
  // FIFO consumes lots in date order — sort once, bucket by home-local day so
  // a tx and a snapshot land on the same calendar day (same rule as the daily
  // return lookups).
  const sorted = [...transactions]
    .map((tx) => ({ tx, day: homeDayIso(new Date(tx.date)) }))
    .sort((a, b) => (a.tx.date < b.tx.date ? -1 : a.tx.date > b.tx.date ? 1 : 0))

  return points.map((p) => {
    const byPlatform = new Map<string, Transaction[]>()
    for (const { tx, day } of sorted) {
      if (day > p.date) continue
      const list = byPlatform.get(tx.platform_id) ?? []
      list.push(tx)
      byPlatform.set(tx.platform_id, list)
    }
    let cost = BN_ZERO
    for (const txs of byPlatform.values()) {
      const { lots } = computeFIFOLots(txs, rates)
      for (const lot of lots) {
        cost = cost.plus(lot.amount.times(lot.unitPriceUsd))
      }
    }
    return { ...p, costBasisUsd: cost.toNumber() }
  })
}

function pad2(n: number): string {
  return n.toString().padStart(2, "0")
}

function localIso(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

/**
 * Range-filter history points. Mirrors `filterByTimeRange` in
 * `lib/performance.ts` (typed to Snapshot[], hence not imported): same cutoff
 * per range, and for month-or-longer ranges the latest point strictly before
 * the cutoff is kept as a start anchor so sparse (weekly) history still draws
 * a populated left edge. Keep the two cutoff rules in sync.
 */
export function filterHistoryByRange(
  points: AssetHistoryPoint[],
  range: TimeRange,
): AssetHistoryPoint[] {
  if (range === "ALL" || points.length === 0) return points

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
    case "2Y":
      cutoff = new Date(now.getFullYear() - 2, now.getMonth(), now.getDate())
      break
  }

  const cutoffStr = localIso(cutoff)
  const inRange = points.filter((p) => p.date >= cutoffStr)

  const supportsAnchor = range !== "1D" && range !== "1W"
  if (supportsAnchor) {
    let anchor: AssetHistoryPoint | undefined
    for (const p of points) {
      if (p.date < cutoffStr) anchor = p
      else break
    }
    if (anchor) return [anchor, ...inRange]
  }
  return inRange
}
