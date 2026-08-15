import { useMemo } from "react"
import { bn, homeDayIso } from "@/lib/config"
import { useAssets } from "@/hooks/useAssets"
import { useHoldings } from "@/hooks/useHoldings"
import { usePrices } from "@/hooks/usePrices"
import { usePnL } from "@/hooks/usePnL"
import { useSnapshots } from "@/hooks/useSnapshots"
import { useRealizedPnL } from "@/hooks/useRealizedPnL"
import {
  buildSnapshotLookups,
  buildDailyReturnLookups,
  enrichAsset,
} from "@/lib/portfolio/grouping"
import {
  attachCostBasis,
  buildAssetHistory,
  type AssetHistoryPoint,
} from "@/lib/portfolio/assetHistory"
import { computeIncomeUsd } from "@/lib/pnl/income"
import { computeAssetCostsUsd } from "@/lib/pnl/assetCosts"
import { computeAssetReturnRates } from "@/lib/pnl/assetReturns"
import type { Asset, Transaction } from "@/types/database"
import type { AssetPnL } from "@/lib/pnl/types"
import type { HoldingWithDetails } from "@/lib/queries/holdings"
import type { EnrichedAsset } from "@/hooks/usePortfolio"

export interface AssetPlatformSlice {
  platformId: string
  platformName: string
  platformColor: string
  balance: number
  costBasisUsd: number
  currentValueUsd: number
  unrealizedPnlUsd: number
  unrealizedPnlPct: number | null
  taxAccrualUsd: number
}

interface UseAssetDetailReturn {
  loading: boolean
  /** True (once loaded) when the id isn't in the catalog, or the user never
   *  touched the asset (no transactions and no holding). */
  notFound: boolean
  asset: Asset | null
  /** The same view-model row the Portfolio page builds — value/price/daily
   *  return/allocation figures can't drift from it. Null until loaded. */
  enriched: EnrichedAsset | null
  /** False for a sold-out (zero-balance) position. */
  held: boolean
  realizedPnlUsd: number
  /** Realized P&L ÷ the FIFO cost basis of the lots actually sold — null when
   *  nothing was realized (or the consumed basis is 0). */
  realizedPnlPct: number | null
  /** Lifetime money-weighted total for the asset: value − net invested. */
  totalReturnUsd: number
  /** Total % over the asset's peak net invested — null when peak ≤ 0. */
  totalReturnPct: number | null
  /** Cumulative money-weighted (XIRR) % over the asset's lifespan; any age. */
  mwrCumulativePct: number | null
  /** Annualized %/yr of the same solve; null under 1 year of history. */
  mwrAnnualizedPct: number | null
  incomeUsd: number
  taxesUsd: number
  feesUsd: number
  history: AssetHistoryPoint[]
  platformSlices: AssetPlatformSlice[]
  dailyReturnAvailable: boolean
}

/**
 * Asset-detail view model. Composes the same shared data sources and pure
 * transforms as the Portfolio page (enrichAsset + snapshot/daily lookups), plus
 * per-asset sums (income, taxes, fees, realized) and the snapshot-sourced
 * history series. No new P&L math.
 */
export function useAssetDetail(assetId: string | undefined): UseAssetDetailReturn {
  const { assets, loading: assetsLoading } = useAssets()
  const { holdings, loading: holdingsLoading } = useHoldings()
  const { prices, rates, loading: pricesLoading } = usePrices()
  const { snapshots } = useSnapshots()
  const realizedByTx = useRealizedPnL()

  const {
    assetPnLs,
    holdingPnLs,
    totalCurrentValueUsd,
    transactions,
    rates: txRates,
    loading: pnlLoading,
  } = usePnL(holdings, prices)

  const loading = assetsLoading || holdingsLoading || pricesLoading || pnlLoading

  const asset = useMemo(
    () => assets.find((a) => a.id === assetId) ?? null,
    [assets, assetId],
  )

  const assetTxs = useMemo(
    () => transactions.filter((tx: Transaction) => tx.asset_id === assetId),
    [transactions, assetId],
  )

  const assetHoldings = useMemo(
    () => holdings.filter((h: HoldingWithDetails) => h.asset_id === assetId),
    [holdings, assetId],
  )

  const notFound =
    !loading && (!asset || (assetTxs.length === 0 && assetHoldings.length === 0))

  const usdTryRate = rates?.usd_try ?? 0

  const snapshotLookups = useMemo(
    () => buildSnapshotLookups(snapshots, usdTryRate),
    [snapshots, usdTryRate],
  )

  const dailyReturnLookups = useMemo(
    () => buildDailyReturnLookups(snapshots, transactions, txRates, homeDayIso()),
    [snapshots, transactions, txRates],
  )

  const assetPnL = useMemo(
    () => assetPnLs.find((p: AssetPnL) => p.assetId === assetId) ?? null,
    [assetPnLs, assetId],
  )

  const enriched = useMemo(() => {
    if (!asset) return null
    const pnlMap = new Map<string, AssetPnL>()
    if (assetPnL) pnlMap.set(assetPnL.assetId, assetPnL)
    const holdingsByAsset = new Map<string, HoldingWithDetails[]>()
    holdingsByAsset.set(asset.id, assetHoldings)
    return enrichAsset(asset, {
      prices,
      pnlMap,
      holdingsByAsset,
      snapshotLookups,
      dailyReturnLookups,
      totalValue: bn(totalCurrentValueUsd),
    })
  }, [
    asset,
    assetPnL,
    assetHoldings,
    prices,
    snapshotLookups,
    dailyReturnLookups,
    totalCurrentValueUsd,
  ])

  // Realized over the full history — covers sold-out assets, whose AssetPnL row
  // may be absent. The per-tx map is the same FIFO the engine books.
  const realizedPnlUsd = useMemo(() => {
    if (assetPnL) return assetPnL.realizedPnlUsd.toNumber()
    let sum = bn(0)
    for (const tx of assetTxs) {
      const entry = realizedByTx.get(tx.id)
      if (entry) sum = sum.plus(entry.realizedPnlUsd)
    }
    return sum.toNumber()
  }, [assetPnL, assetTxs, realizedByTx])

  // Realized % = realized ÷ the consumed lots' cost basis ("on what I exited").
  const realizedPnlPct = useMemo(() => {
    let soldCost = bn(0)
    for (const tx of assetTxs) {
      const entry = realizedByTx.get(tx.id)
      if (entry) soldCost = soldCost.plus(entry.costBasisUsd)
    }
    if (soldCost.lte(0)) return null
    return bn(realizedPnlUsd).div(soldCost).times(100).toNumber()
  }, [assetTxs, realizedByTx, realizedPnlUsd])

  const returnRates = useMemo(() => {
    if (!enriched) return null
    return computeAssetReturnRates(
      assetTxs,
      txRates,
      bn(enriched.currentValueUsd),
      homeDayIso(),
    )
  }, [enriched, assetTxs, txRates])

  const incomeUsd = useMemo(
    () => computeIncomeUsd(assetTxs, txRates).toNumber(),
    [assetTxs, txRates],
  )

  const { taxesUsd, feesUsd } = useMemo(() => {
    const costs = computeAssetCostsUsd(assetTxs, txRates)
    return { taxesUsd: costs.taxesUsd.toNumber(), feesUsd: costs.feesUsd.toNumber() }
  }, [assetTxs, txRates])

  const held = (enriched?.totalBalance ?? 0) > 0

  // Frozen snapshot history (with the per-date FIFO cost basis attached) + a
  // live "now" point (held positions only — a sold-out position's history
  // simply ends at its exit).
  const history = useMemo(() => {
    if (!asset) return []
    const points = attachCostBasis(
      buildAssetHistory(snapshots, asset.ticker),
      assetTxs,
      txRates,
    )
    if (!enriched || enriched.totalBalance <= 0) return points
    const today = homeDayIso()
    const nowPoint = {
      date: today,
      valueUsd: enriched.currentValueUsd,
      valueTry: enriched.currentValueTry,
      priceUsd: enriched.currentPriceUsd,
      amount: enriched.totalBalance,
      usdTry: snapshotLookups.fallbackUsdTry,
      costBasisUsd: enriched.costBasisUsd,
    }
    const last = points[points.length - 1]
    if (last && last.date === today) return [...points.slice(0, -1), nowPoint]
    return [...points, nowPoint]
  }, [asset, snapshots, enriched, assetTxs, txRates, snapshotLookups])

  const platformSlices = useMemo(() => {
    if (!asset) return []
    const slices: AssetPlatformSlice[] = []
    for (const h of assetHoldings) {
      if (h.balance <= 0) continue
      const hp = holdingPnLs.find(
        (p) => p.assetId === asset.id && p.platformId === h.platform_id,
      )
      const valueUsd = hp
        ? hp.currentValueUsd
        : bn(h.balance).times(bn(enriched?.currentPriceUsd ?? 0))
      const costBasisUsd = hp ? hp.costBasisUsd : bn(0)
      const unrealizedUsd = hp
        ? hp.unrealizedPnlUsd
        : valueUsd.minus(costBasisUsd)
      slices.push({
        platformId: h.platform_id,
        platformName: h.platforms.name,
        platformColor: h.platforms.color,
        balance: h.balance,
        costBasisUsd: costBasisUsd.toNumber(),
        currentValueUsd: valueUsd.toNumber(),
        unrealizedPnlUsd: unrealizedUsd.toNumber(),
        unrealizedPnlPct: costBasisUsd.gt(0)
          ? unrealizedUsd.div(costBasisUsd).times(100).toNumber()
          : null,
        taxAccrualUsd: hp ? hp.taxAccrualUsd.toNumber() : 0,
      })
    }
    return slices.sort((a, b) => b.currentValueUsd - a.currentValueUsd)
  }, [asset, assetHoldings, holdingPnLs, enriched])

  return {
    loading,
    notFound,
    asset,
    enriched,
    held,
    realizedPnlUsd,
    realizedPnlPct,
    totalReturnUsd: returnRates?.totalPnlUsd.toNumber() ?? 0,
    totalReturnPct: returnRates?.totalPnlPct?.toNumber() ?? null,
    mwrCumulativePct: returnRates?.mwrCumulativePct?.toNumber() ?? null,
    mwrAnnualizedPct: returnRates?.mwrAnnualizedPct?.toNumber() ?? null,
    incomeUsd,
    taxesUsd,
    feesUsd,
    history,
    platformSlices,
    dailyReturnAvailable: dailyReturnLookups.available,
  }
}
