import { useMemo, useState } from "react"
import { bn, homeDayIso } from "@/lib/config"
import { useAssets } from "@/hooks/useAssets"
import { useHoldings } from "@/hooks/useHoldings"
import { usePrices } from "@/hooks/usePrices"
import { usePnL } from "@/hooks/usePnL"
import { useSnapshots } from "@/hooks/useSnapshots"
import { summarizePnLTotals } from "@/lib/pnl/totals"
import {
  buildSnapshotLookups,
  buildDailyReturnLookups,
  buildEnrichedAssets,
  filterAssetsBySearch,
  sortAssets,
  groupAssets,
} from "@/lib/portfolio/grouping"

// ─── Types ──────────────────────────────────────────────────────────

export interface EnrichedAsset {
  id: string
  name: string
  ticker: string
  category: string
  icon_url: string | null
  tags: string[]
  totalBalance: number
  holdings: {
    platformId: string
    platformName: string
    platformColor: string
    balance: number
  }[]
  currentPriceUsd: number
  currentPriceTry: number
  currentValueUsd: number
  currentValueTry: number
  costBasisUsd: number
  /** Original purchase cost in the asset's own currency (e.g. ₺ for BIST),
   *  or null when the position spans currencies. Paired with `nativeCurrency`. */
  costBasisNative: number | null
  nativeCurrency: string | null
  unrealizedPnlUsd: number
  unrealizedPnlPct: number
  allocationPct: number
  /** Money-weighted daily return in USD (current − prev-snapshot − period cash). */
  dailyReturnUsd: number
  /** Daily return %, or null when there's no sensible base (denom <= 0). */
  dailyReturnPct: number | null
  /** Denominator the daily % is taken on (prev value + period invested); summed
   *  by group rollups. */
  dailyDenomUsd: number
}

export interface AssetGroup {
  key: string
  label: string
  color?: string
  assets: EnrichedAsset[]
  totalValueUsd: number
  totalValueTry: number
  totalPnlUsd: number
  dailyReturnUsd: number
  dailyReturnPct: number | null
}

export type GroupBy = "platform" | "category" | "tag"
export type SortBy = "value" | "pnl" | "name"
export type ReturnMode = "total" | "daily"

interface UsePortfolioReturn {
  enrichedAssets: EnrichedAsset[]
  groups: AssetGroup[]
  totalValueUsd: number
  totalValueTry: number
  totalCostBasisUsd: number
  totalUnrealizedPnlUsd: number
  totalUnrealizedPnlPct: number
  totalRealizedPnlUsd: number
  totalIncomeUsd: number
  totalPnlUsd: number
  totalPnlPct: number | null
  heldAssetCount: number
  loading: boolean
  error: string | null
  search: string
  setSearch: (value: string) => void
  groupBy: GroupBy
  setGroupBy: (value: GroupBy) => void
  sortBy: SortBy
  setSortBy: (value: SortBy) => void
  returnMode: ReturnMode
  setReturnMode: (value: ReturnMode) => void
  /** False when there's no previous snapshot to diff against (daily shows "—"). */
  dailyReturnAvailable: boolean
  refetch: () => Promise<void>
}

// ─── Hook ───────────────────────────────────────────────────────────

/**
 * Portfolio-page view model. A thin orchestrator: it wires data sources and UI
 * state to the pure transforms in `lib/portfolio/grouping` (enrich → filter →
 * sort → group) and the shared money-weighted totals. The number-crunching
 * lives in those pure functions; this hook just memoizes the pipeline.
 */
export function usePortfolio(): UsePortfolioReturn {
  const { assets, loading: assetsLoading, error, refetch: refetchAssets } = useAssets()
  const { holdings, loading: holdingsLoading, refetch: refetchHoldings } = useHoldings()
  const { prices, rates, loading: pricesLoading } = usePrices()
  const { snapshots } = useSnapshots()

  const {
    assetPnLs,
    holdingPnLs,
    totalCostBasisUsd,
    totalCurrentValueUsd,
    totalUnrealizedPnlUsd,
    totalRealizedPnlUsd,
    totalIncomeUsd,
    totalInvestedUsd,
    totalPeakInvestedUsd,
    transactions,
    rates: txRates,
    loading: pnlLoading,
  } = usePnL(holdings, prices)

  const [search, setSearch] = useState("")
  const [groupBy, setGroupBy] = useState<GroupBy>("category")
  const [sortBy, setSortBy] = useState<SortBy>("value")
  const [returnMode, setReturnMode] = useState<ReturnMode>("total")

  const loading = assetsLoading || holdingsLoading || pricesLoading || pnlLoading
  const usdTryRate = rates?.usd_try ?? 0

  const activeAssets = useMemo(
    () => assets.filter((a) => a.is_active),
    [assets],
  )

  const snapshotLookups = useMemo(
    () => buildSnapshotLookups(snapshots, usdTryRate),
    [snapshots, usdTryRate],
  )

  const dailyReturnLookups = useMemo(
    () => buildDailyReturnLookups(snapshots, transactions, txRates, homeDayIso()),
    [snapshots, transactions, txRates],
  )

  const enrichedAssets = useMemo(
    () =>
      buildEnrichedAssets(activeAssets, {
        holdings,
        prices,
        assetPnLs,
        totalCurrentValueUsd,
        snapshotLookups,
        dailyReturnLookups,
      }),
    [
      activeAssets,
      holdings,
      prices,
      assetPnLs,
      totalCurrentValueUsd,
      snapshotLookups,
      dailyReturnLookups,
    ],
  )

  const filteredAssets = useMemo(
    () => filterAssetsBySearch(enrichedAssets, search),
    [enrichedAssets, search],
  )

  const sortedAssets = useMemo(
    () => sortAssets(filteredAssets, sortBy),
    [filteredAssets, sortBy],
  )

  const groups = useMemo(
    () =>
      groupAssets(groupBy, sortedAssets, holdingPnLs, {
        snapshotLookups,
        dailyReturnLookups,
        totalCurrentValueUsd,
      }),
    [
      groupBy,
      sortedAssets,
      holdingPnLs,
      snapshotLookups,
      dailyReturnLookups,
      totalCurrentValueUsd,
    ],
  )

  const totalValueTry = totalCurrentValueUsd.times(bn(usdTryRate)).toNumber()
  const totalUnrealizedPnlPct = totalCostBasisUsd.isZero()
    ? 0
    : totalUnrealizedPnlUsd.div(totalCostBasisUsd).times(100).toNumber()

  // Total P&L = current value − net invested (money-weighted), shared with the
  // Dashboard via summarizePnLTotals so both pages show the identical headline.
  const { totalPnlUsd: totalPnlUsdBn, totalPnlPct: totalPnlPctBn } =
    summarizePnLTotals({
      totalCurrentValueUsd,
      totalInvestedUsd,
      peakInvestedUsd: totalPeakInvestedUsd,
    })

  const refetch = async () => {
    await Promise.all([refetchAssets(), refetchHoldings()])
  }

  return {
    enrichedAssets: sortedAssets,
    groups,
    totalValueUsd: totalCurrentValueUsd.toNumber(),
    totalValueTry,
    totalCostBasisUsd: totalCostBasisUsd.toNumber(),
    totalUnrealizedPnlUsd: totalUnrealizedPnlUsd.toNumber(),
    totalUnrealizedPnlPct,
    totalRealizedPnlUsd: totalRealizedPnlUsd.toNumber(),
    totalIncomeUsd: totalIncomeUsd.toNumber(),
    totalPnlUsd: totalPnlUsdBn.toNumber(),
    totalPnlPct: totalPnlPctBn?.toNumber() ?? null,
    heldAssetCount: enrichedAssets.length,
    loading,
    error,
    search,
    setSearch,
    groupBy,
    setGroupBy,
    sortBy,
    setSortBy,
    returnMode,
    setReturnMode,
    dailyReturnAvailable: dailyReturnLookups.available,
    refetch,
  }
}
