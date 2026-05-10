import { useMemo } from "react"
import { bn, BN_ZERO } from "@/lib/config"
import { useTransactionData } from "@/contexts/TransactionDataContext"
import { useSnapshots } from "@/hooks/useSnapshots"
import { computeFIFOLots } from "@/lib/pnl/fifo"
import { computeUnrealizedPnL } from "@/lib/pnl/unrealized"
import { computeCurrentInvestedUsd } from "@/lib/performance"
import type { Transaction, PriceCache } from "@/types/database"
import type { AssetPnL, PortfolioPnL } from "@/lib/pnl/types"
import type { HoldingWithDetails } from "@/lib/queries/holdings"

// ─── Helpers ────────────────────────────────────────────────────────

/**
 * Group transactions by composite key `asset_id|platform_id`.
 */
function groupByAssetPlatform(
  transactions: Transaction[],
): Record<string, Transaction[]> {
  const groups: Record<string, Transaction[]> = {}
  for (const tx of transactions) {
    const key = `${tx.asset_id}|${tx.platform_id}`
    if (!groups[key]) groups[key] = []
    groups[key].push(tx)
  }
  return groups
}

// ─── Hook ───────────────────────────────────────────────────────────

/**
 * Compute P&L from holdings (which carry asset + platform details) and current prices.
 *
 * `currentValueUsd` for each (asset, platform) prefers the latest snapshot's
 * per-(ticker, platform) value when available, falling back to
 * `balance × live price` otherwise. This keeps the portfolio page and
 * dashboard agreeing on "current value" — both read from the snapshot —
 * without dragging FIFO cost basis into the snapshot path. Cost basis stays
 * a pure function of `transactions` because it has no second source to
 * drift against.
 *
 * FIFO runs per (asset, platform) pair. Results are then aggregated to the
 * asset level so callers get one `AssetPnL` per unique asset (summed across
 * platforms).
 */
export function usePnL(
  holdings: HoldingWithDetails[],
  prices: Record<string, PriceCache>,
) {
  const { transactions, rates, loading } = useTransactionData()
  const { snapshots } = useSnapshots()

  const result: PortfolioPnL = useMemo(() => {
    if (loading || holdings.length === 0) {
      return {
        assetPnLs: [],
        totalCostBasisUsd: BN_ZERO,
        totalCurrentValueUsd: BN_ZERO,
        totalUnrealizedPnlUsd: BN_ZERO,
        totalRealizedPnlUsd: BN_ZERO,
        totalInvestedUsd: BN_ZERO,
      }
    }

    // Build (ticker, platform_name) → snapshot price_usd lookup. We read
    // *price-per-unit* from the snapshot, not the frozen value_usd. The
    // snapshot's value_usd is `amount × price` captured at write time;
    // after a tx adds/removes shares it describes yesterday's portfolio
    // at today's display. Reading price-per-unit and multiplying by the
    // *live* balance keeps the Value column correct on quantity changes
    // (immediate) while still treating the snapshot as the source of
    // truth for prices (≤5s lag on price refreshes is bounded and fine).
    // Falls through to live price for any holding not yet captured in the
    // latest snapshot (new platform, fresh asset before next auto-refresh).
    const latest = snapshots[snapshots.length - 1]
    const snapshotPriceByTickerPlatform = new Map<string, number>()
    if (latest?.breakdown?.by_asset) {
      for (const entry of latest.breakdown.by_asset) {
        const key = `${entry.ticker}|${entry.platform}`
        snapshotPriceByTickerPlatform.set(key, entry.price_usd)
      }
    }

    const grouped = groupByAssetPlatform(transactions)

    // ── Per-(asset, platform) P&L ──────────────────────────────────

    interface HoldingPnL {
      assetId: string
      ticker: string
      category: string
      costBasisUsd: ReturnType<typeof bn>
      currentValueUsd: ReturnType<typeof bn>
      unrealizedPnlUsd: ReturnType<typeof bn>
      realizedPnlUsd: ReturnType<typeof bn>
    }

    const holdingPnLs: HoldingPnL[] = []

    for (const h of holdings) {
      const ticker = h.assets.ticker
      const category = h.assets.category
      const platformName = h.platforms.name
      const livePrice = prices[ticker]?.price_usd ?? 0
      const key = `${h.asset_id}|${h.platform_id}`
      const snapshotKey = `${ticker}|${platformName}`
      const snapshotPriceUsd =
        snapshotPriceByTickerPlatform.get(snapshotKey) ?? livePrice
      const liveBalanceBn = bn(h.balance)

      if (category === "fiat") {
        // Fiat: value = balance × snapshot-or-live price; cost basis
        // matches value (no realized P&L from price changes).
        const currentValueUsd = liveBalanceBn.times(bn(snapshotPriceUsd))
        holdingPnLs.push({
          assetId: h.asset_id,
          ticker,
          category,
          costBasisUsd: currentValueUsd,
          currentValueUsd,
          unrealizedPnlUsd: BN_ZERO,
          realizedPnlUsd: BN_ZERO,
        })
        continue
      }

      const holdingTxs = grouped[key] ?? []
      const { lots, realized } = computeFIFOLots(holdingTxs, rates)

      const unrealized = computeUnrealizedPnL(
        lots,
        snapshotPriceUsd,
        h.balance,
      )

      const totalRealized = realized.reduce(
        (sum, r) => sum.plus(r.realizedPnlUsd),
        BN_ZERO,
      )

      holdingPnLs.push({
        assetId: h.asset_id,
        ticker,
        category,
        costBasisUsd: unrealized.costBasisUsd,
        currentValueUsd: unrealized.currentValueUsd,
        unrealizedPnlUsd: unrealized.unrealizedPnlUsd,
        realizedPnlUsd: totalRealized,
      })
    }

    // ── Aggregate to asset level ───────────────────────────────────

    const assetMap = new Map<
      string,
      {
        ticker: string
        category: string
        costBasisUsd: ReturnType<typeof bn>
        currentValueUsd: ReturnType<typeof bn>
        unrealizedPnlUsd: ReturnType<typeof bn>
        realizedPnlUsd: ReturnType<typeof bn>
      }
    >()

    for (const hp of holdingPnLs) {
      const existing = assetMap.get(hp.assetId)
      if (existing) {
        existing.costBasisUsd = existing.costBasisUsd.plus(hp.costBasisUsd)
        existing.currentValueUsd = existing.currentValueUsd.plus(hp.currentValueUsd)
        existing.unrealizedPnlUsd = existing.unrealizedPnlUsd.plus(hp.unrealizedPnlUsd)
        existing.realizedPnlUsd = existing.realizedPnlUsd.plus(hp.realizedPnlUsd)
      } else {
        assetMap.set(hp.assetId, {
          ticker: hp.ticker,
          category: hp.category,
          costBasisUsd: hp.costBasisUsd,
          currentValueUsd: hp.currentValueUsd,
          unrealizedPnlUsd: hp.unrealizedPnlUsd,
          realizedPnlUsd: hp.realizedPnlUsd,
        })
      }
    }

    const assetPnLs: AssetPnL[] = []
    for (const [assetId, data] of assetMap) {
      const unrealizedPnlPct = data.costBasisUsd.isZero()
        ? BN_ZERO
        : data.unrealizedPnlUsd.div(data.costBasisUsd).times(100)

      assetPnLs.push({
        assetId,
        ticker: data.ticker,
        category: data.category,
        costBasisUsd: data.costBasisUsd,
        currentValueUsd: data.currentValueUsd,
        unrealizedPnlUsd: data.unrealizedPnlUsd,
        unrealizedPnlPct,
        realizedPnlUsd: data.realizedPnlUsd,
        lots: [], // lots are per-platform; aggregated view omits them
      })
    }

    const totalCostBasisUsd = assetPnLs.reduce(
      (s, a) => s.plus(a.costBasisUsd),
      BN_ZERO,
    )
    const totalCurrentValueUsd = assetPnLs.reduce(
      (s, a) => s.plus(a.currentValueUsd),
      BN_ZERO,
    )
    const totalUnrealizedPnlUsd = assetPnLs.reduce(
      (s, a) => s.plus(a.unrealizedPnlUsd),
      BN_ZERO,
    )
    const totalRealizedPnlUsd = assetPnLs.reduce(
      (s, a) => s.plus(a.realizedPnlUsd),
      BN_ZERO,
    )
    const totalInvestedUsd = bn(computeCurrentInvestedUsd(transactions, rates))

    return {
      assetPnLs,
      totalCostBasisUsd,
      totalCurrentValueUsd,
      totalUnrealizedPnlUsd,
      totalRealizedPnlUsd,
      totalInvestedUsd,
    }
  }, [transactions, rates, holdings, prices, loading, snapshots])

  return { ...result, transactions, rates, loading }
}
