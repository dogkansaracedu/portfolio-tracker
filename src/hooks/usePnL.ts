import { useMemo } from "react"
import { bn, BN_ZERO } from "@/lib/config"
import { useTransactionData } from "@/contexts/TransactionDataContext"
import { useSnapshots } from "@/hooks/useSnapshots"
import { computeFIFOLots } from "@/lib/pnl/fifo"
import { buildRealizedByTx } from "@/lib/pnl/realized"
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
      costBasisNative: ReturnType<typeof bn> | null
      nativeCurrency: string | null
      currentValueUsd: ReturnType<typeof bn>
      unrealizedPnlUsd: ReturnType<typeof bn>
      realizedPnlUsd: ReturnType<typeof bn>
    }

    const holdingPnLs: HoldingPnL[] = []

    for (const h of holdings) {
      const ticker = h.assets.ticker
      const category = h.assets.category
      const platformName = h.platforms.name
      // price_cache is keyed by price_id; ticker is display-only. The joined
      // `assets` projection in HoldingWithDetails carries `price_id`
      // (added to src/lib/queries/holdings.ts's select + type); coalesces to
      // ticker for rows whose price_id is still null (pre-backfill behaviour).
      const priceKey = h.assets.price_id ?? ticker
      const livePrice = prices[priceKey]?.price_usd ?? 0
      const key = `${h.asset_id}|${h.platform_id}`
      const snapshotKey = `${ticker}|${platformName}`
      const snapshotPriceUsd =
        snapshotPriceByTickerPlatform.get(snapshotKey) ?? livePrice
      const liveBalanceBn = bn(h.balance)

      if (h.assets.is_currency) {
        // Fiat: value = balance × snapshot-or-live price; cost basis
        // matches value (no realized P&L from price changes).
        const currentValueUsd = liveBalanceBn.times(bn(snapshotPriceUsd))
        holdingPnLs.push({
          assetId: h.asset_id,
          ticker,
          category,
          costBasisUsd: currentValueUsd,
          // A fiat balance is worth 1 unit of itself; its native cost is the
          // balance, in its own currency (ticker).
          costBasisNative: liveBalanceBn,
          nativeCurrency: ticker,
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

      // Native cost of the remaining lots (sum of amount × original unit price).
      // Valid only while every open lot shares one currency — otherwise the
      // sum would mix currencies, so we drop to null and let the UI fall back
      // to the USD figure.
      const nativeCurrency: string | null = lots[0]?.priceCurrency ?? null
      const nativeConsistent =
        lots.length > 0 && lots.every((l) => l.priceCurrency === nativeCurrency)
      const costBasisNative = nativeConsistent
        ? lots.reduce(
            (sum: ReturnType<typeof bn>, lot) =>
              sum.plus(lot.amount.times(lot.unitPriceOriginal)),
            BN_ZERO,
          )
        : null

      const totalRealized = realized.reduce(
        (sum, r) => sum.plus(r.realizedPnlUsd),
        BN_ZERO,
      )

      holdingPnLs.push({
        assetId: h.asset_id,
        ticker,
        category,
        costBasisUsd: unrealized.costBasisUsd,
        costBasisNative,
        nativeCurrency: nativeConsistent ? nativeCurrency : null,
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
        costBasisNative: ReturnType<typeof bn> | null
        nativeCurrency: string | null
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
        // Combine native cost only when both sides are present and in the same
        // currency; otherwise this asset spans currencies → no native figure.
        if (
          existing.costBasisNative !== null &&
          hp.costBasisNative !== null &&
          existing.nativeCurrency === hp.nativeCurrency
        ) {
          existing.costBasisNative = existing.costBasisNative.plus(hp.costBasisNative)
        } else {
          existing.costBasisNative = null
          existing.nativeCurrency = null
        }
      } else {
        assetMap.set(hp.assetId, {
          ticker: hp.ticker,
          category: hp.category,
          costBasisUsd: hp.costBasisUsd,
          costBasisNative: hp.costBasisNative,
          nativeCurrency: hp.nativeCurrency,
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
        costBasisNative: data.costBasisNative,
        nativeCurrency: data.nativeCurrency,
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

  // Realized P&L over the FULL history (incl. sold-out positions, which have no
  // `holdings` row — summing only held positions was the Portfolio/Dashboard
  // mismatch bug). Price-independent, so its own [transactions, rates] memo
  // keeps the full-history FIFO replay off the price-refresh path.
  const totalRealizedPnlUsd: ReturnType<typeof bn> = useMemo(() => {
    if (loading) return BN_ZERO
    let sum = BN_ZERO
    for (const entry of buildRealizedByTx(transactions, rates).values()) {
      sum = sum.plus(entry.realizedPnlUsd)
    }
    return sum
  }, [transactions, rates, loading])

  return { ...result, totalRealizedPnlUsd, transactions, rates, loading }
}
