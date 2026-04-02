import { useState, useEffect, useMemo } from "react"
import { bn, BN_ZERO } from "@/lib/config"
import { useAuth } from "@/hooks/useAuth"
import {
  fetchTransactionsForPnL,
  fetchTransactionsForAllAssets,
  fetchAllExchangeRates,
} from "@/lib/queries/pnl"
import { computeFIFOLots } from "@/lib/pnl/fifo"
import { computeUnrealizedPnL } from "@/lib/pnl/unrealized"
import type { Transaction, ExchangeRate, Asset, PriceCache } from "@/types/database"
import type { AssetPnL, PortfolioPnL } from "@/lib/pnl/types"

/**
 * Group transactions by asset_id.
 */
function groupByAsset(
  transactions: Transaction[],
): Record<string, Transaction[]> {
  const groups: Record<string, Transaction[]> = {}
  for (const tx of transactions) {
    if (!groups[tx.asset_id]) groups[tx.asset_id] = []
    groups[tx.asset_id].push(tx)
  }
  return groups
}

/**
 * Compute P&L for a single asset or the full portfolio.
 *
 * @param assets - Active assets (with balance, ticker, category)
 * @param prices - Price cache map (ticker -> PriceCache)
 * @param assetId - If provided, compute for one asset only
 */
export function usePnL(
  assets: Asset[],
  prices: Record<string, PriceCache>,
  assetId?: string,
) {
  const { user } = useAuth()
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [rates, setRates] = useState<ExchangeRate[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return

    const load = async () => {
      setLoading(true)
      try {
        const [txs, exchangeRates] = await Promise.all([
          assetId
            ? fetchTransactionsForPnL(assetId)
            : fetchTransactionsForAllAssets(user.id),
          fetchAllExchangeRates(),
        ])
        setTransactions(txs)
        setRates(exchangeRates)
      } catch (err) {
        console.error("Failed to load P&L data:", err)
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [user, assetId])

  const result: PortfolioPnL = useMemo(() => {
    if (loading || assets.length === 0) {
      return {
        assetPnLs: [],
        totalCostBasisUsd: BN_ZERO,
        totalCurrentValueUsd: BN_ZERO,
        totalUnrealizedPnlUsd: BN_ZERO,
        totalRealizedPnlUsd: BN_ZERO,
      }
    }

    const grouped = groupByAsset(transactions)
    const assetPnLs: AssetPnL[] = []

    const targetAssets = assetId
      ? assets.filter((a) => a.id === assetId)
      : assets

    for (const asset of targetAssets) {
      // Skip fiat — no meaningful P&L
      if (asset.category === "fiat") {
        const price = prices[asset.ticker]
        const currentValueUsd = bn(asset.balance).times(bn(price?.price_usd))
        assetPnLs.push({
          assetId: asset.id,
          ticker: asset.ticker,
          category: asset.category,
          costBasisUsd: currentValueUsd, // fiat cost = current value
          currentValueUsd,
          unrealizedPnlUsd: BN_ZERO,
          unrealizedPnlPct: BN_ZERO,
          realizedPnlUsd: BN_ZERO,
          lots: [],
        })
        continue
      }

      const assetTxs = grouped[asset.id] ?? []
      const { lots, realized } = computeFIFOLots(assetTxs, rates)

      const price = prices[asset.ticker]
      const currentPriceUsd = price?.price_usd ?? 0

      const unrealized = computeUnrealizedPnL(
        lots,
        currentPriceUsd,
        asset.balance,
      )

      const totalRealized = realized.reduce(
        (sum, r) => sum.plus(r.realizedPnlUsd),
        BN_ZERO,
      )

      assetPnLs.push({
        assetId: asset.id,
        ticker: asset.ticker,
        category: asset.category,
        costBasisUsd: unrealized.costBasisUsd,
        currentValueUsd: unrealized.currentValueUsd,
        unrealizedPnlUsd: unrealized.unrealizedPnlUsd,
        unrealizedPnlPct: unrealized.unrealizedPnlPct,
        realizedPnlUsd: totalRealized,
        lots,
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

    return {
      assetPnLs,
      totalCostBasisUsd,
      totalCurrentValueUsd,
      totalUnrealizedPnlUsd,
      totalRealizedPnlUsd,
    }
  }, [transactions, rates, assets, prices, loading, assetId])

  return { ...result, loading }
}
