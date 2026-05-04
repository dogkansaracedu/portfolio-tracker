import { useMemo, useState } from "react"
import { bn, BN_ZERO } from "@/lib/config"
import { useAssets } from "@/hooks/useAssets"
import { useHoldings } from "@/hooks/useHoldings"
import { usePrices } from "@/hooks/usePrices"
import { usePnL } from "@/hooks/usePnL"
import type { Asset, PriceCache } from "@/types/database"
import type { HoldingWithDetails } from "@/lib/queries/holdings"
import type { AssetPnL } from "@/lib/pnl/types"

// ─── Types ──────────────────────────────────────────────────────────

export interface EnrichedAsset {
  id: string
  name: string
  ticker: string
  category: string
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
  unrealizedPnlUsd: number
  unrealizedPnlPct: number
  allocationPct: number
}

export interface AssetGroup {
  key: string
  label: string
  color?: string
  assets: EnrichedAsset[]
  totalValueUsd: number
  totalValueTry: number
  totalPnlUsd: number
}

export type GroupBy = "platform" | "category" | "tag"
export type SortBy = "value" | "pnl" | "name"

interface UsePortfolioReturn {
  enrichedAssets: EnrichedAsset[]
  groups: AssetGroup[]
  totalValueUsd: number
  totalValueTry: number
  totalCostBasisUsd: number
  totalUnrealizedPnlUsd: number
  totalUnrealizedPnlPct: number
  totalRealizedPnlUsd: number
  totalPnlUsd: number
  totalPnlPct: number
  activeAssetCount: number
  loading: boolean
  error: string | null
  search: string
  setSearch: (value: string) => void
  groupBy: GroupBy
  setGroupBy: (value: GroupBy) => void
  sortBy: SortBy
  setSortBy: (value: SortBy) => void
  refetch: () => Promise<void>
}

// ─── Category labels ────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  fiat: "Fiat",
  crypto: "Crypto",
  gold: "Gold",
  stock_us: "US Stocks",
  stock_bist: "BIST Stocks",
}

// ─── Hook ───────────────────────────────────────────────────────────

export function usePortfolio(): UsePortfolioReturn {
  const { assets, loading: assetsLoading, error, refetch: refetchAssets } = useAssets()
  const { holdings, loading: holdingsLoading, refetch: refetchHoldings } = useHoldings()
  const { prices, rates, loading: pricesLoading } = usePrices()

  const {
    assetPnLs,
    totalCostBasisUsd,
    totalCurrentValueUsd,
    totalUnrealizedPnlUsd,
    totalRealizedPnlUsd,
    totalInvestedUsd,
    loading: pnlLoading,
  } = usePnL(holdings, prices)

  const [search, setSearch] = useState("")
  const [groupBy, setGroupBy] = useState<GroupBy>("category")
  const [sortBy, setSortBy] = useState<SortBy>("value")

  const loading = assetsLoading || holdingsLoading || pricesLoading || pnlLoading

  const usdTryRate = rates?.usd_try ?? 0

  const activeAssets = useMemo(
    () => assets.filter((a) => a.is_active),
    [assets],
  )

  const enrichedAssets = useMemo(() => {
    const pnlMap = new Map<string, AssetPnL>()
    for (const pnl of assetPnLs) {
      pnlMap.set(pnl.assetId, pnl)
    }

    const holdingsByAsset = new Map<string, HoldingWithDetails[]>()
    for (const h of holdings) {
      const existing = holdingsByAsset.get(h.asset_id)
      if (existing) {
        existing.push(h)
      } else {
        holdingsByAsset.set(h.asset_id, [h])
      }
    }

    const totalValue = bn(totalCurrentValueUsd)

    return activeAssets.map((asset: Asset): EnrichedAsset => {
      const price: PriceCache | undefined = prices[asset.ticker]
      const bnPriceUsd = bn(price?.price_usd)
      const bnPriceTry = price?.price_try
        ? bn(price.price_try)
        : bnPriceUsd.times(bn(usdTryRate))

      const assetHoldings = holdingsByAsset.get(asset.id) ?? []

      const holdingsData = assetHoldings.map((h) => ({
        platformId: h.platform_id,
        platformName: h.platforms.name,
        platformColor: h.platforms.color,
        balance: h.balance,
      }))

      const bnTotalBalance = assetHoldings.reduce(
        (sum, h) => sum.plus(bn(h.balance)),
        BN_ZERO,
      )

      const currentValueUsd = bnTotalBalance.times(bnPriceUsd)
      const currentValueTry = bnTotalBalance.times(bnPriceTry)

      const pnl = pnlMap.get(asset.id)

      return {
        id: asset.id,
        name: asset.name,
        ticker: asset.ticker,
        category: asset.category,
        tags: asset.tags ?? [],
        totalBalance: bnTotalBalance.toNumber(),
        holdings: holdingsData,
        currentPriceUsd: bnPriceUsd.toNumber(),
        currentPriceTry: bnPriceTry.toNumber(),
        currentValueUsd: currentValueUsd.toNumber(),
        currentValueTry: currentValueTry.toNumber(),
        costBasisUsd: bn(pnl?.costBasisUsd).toNumber(),
        unrealizedPnlUsd: bn(pnl?.unrealizedPnlUsd).toNumber(),
        unrealizedPnlPct: bn(pnl?.unrealizedPnlPct).toNumber(),
        allocationPct: totalValue.isZero()
          ? 0
          : currentValueUsd.div(totalValue).times(100).toNumber(),
      }
    })
  }, [activeAssets, holdings, prices, assetPnLs, totalCurrentValueUsd, usdTryRate])

  const filteredAssets = useMemo(() => {
    if (!search.trim()) return enrichedAssets
    const q = search.toLowerCase()
    return enrichedAssets.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.ticker.toLowerCase().includes(q),
    )
  }, [enrichedAssets, search])

  const sortedAssets = useMemo(() => {
    const sorted = [...filteredAssets]
    switch (sortBy) {
      case "value":
        sorted.sort((a, b) => b.currentValueUsd - a.currentValueUsd)
        break
      case "pnl":
        sorted.sort((a, b) => b.unrealizedPnlUsd - a.unrealizedPnlUsd)
        break
      case "name":
        sorted.sort((a, b) => a.name.localeCompare(b.name))
        break
    }
    return sorted
  }, [filteredAssets, sortBy])

  const groups = useMemo((): AssetGroup[] => {
    if (groupBy === "platform") {
      const map = new Map<string, EnrichedAsset[]>()
      const platformMeta = new Map<string, { name: string; color: string }>()

      for (const asset of sortedAssets) {
        for (const h of asset.holdings) {
          const key = h.platformId
          if (!platformMeta.has(key)) {
            platformMeta.set(key, { name: h.platformName, color: h.platformColor })
          }
          const platformBalance = h.balance
          const platformValueUsd = platformBalance * asset.currentPriceUsd
          const platformValueTry = platformBalance * asset.currentPriceTry
          const costPerUnit = asset.totalBalance > 0
            ? asset.costBasisUsd / asset.totalBalance
            : 0
          const platformCostBasis = costPerUnit * platformBalance

          const scoped: EnrichedAsset = {
            ...asset,
            totalBalance: platformBalance,
            holdings: [h],
            currentValueUsd: platformValueUsd,
            currentValueTry: platformValueTry,
            costBasisUsd: platformCostBasis,
            unrealizedPnlUsd: platformValueUsd - platformCostBasis,
            unrealizedPnlPct: platformCostBasis > 0
              ? ((platformValueUsd - platformCostBasis) / platformCostBasis) * 100
              : 0,
            allocationPct: asset.allocationPct > 0 && asset.totalBalance > 0
              ? asset.allocationPct * (platformBalance / (asset.totalBalance + platformBalance - platformBalance))
              : 0,
          }

          const existing = map.get(key) ?? []
          existing.push(scoped)
          map.set(key, existing)
        }
      }

      const totalValue = bn(totalCurrentValueUsd)
      const result: AssetGroup[] = []
      for (const [key, groupAssets] of map) {
        const meta = platformMeta.get(key)!
        let totalValueUsdBn = BN_ZERO
        let totalValueTryBn = BN_ZERO
        let totalPnlUsdBn = BN_ZERO
        for (const a of groupAssets) {
          totalValueUsdBn = totalValueUsdBn.plus(bn(a.currentValueUsd))
          totalValueTryBn = totalValueTryBn.plus(bn(a.currentValueTry))
          totalPnlUsdBn = totalPnlUsdBn.plus(bn(a.unrealizedPnlUsd))
          a.allocationPct = totalValue.isZero()
            ? 0
            : bn(a.currentValueUsd).div(totalValue).times(100).toNumber()
        }

        result.push({
          key,
          label: meta.name,
          color: meta.color,
          assets: groupAssets,
          totalValueUsd: totalValueUsdBn.toNumber(),
          totalValueTry: totalValueTryBn.toNumber(),
          totalPnlUsd: totalPnlUsdBn.toNumber(),
        })
      }

      result.sort((a, b) => b.totalValueUsd - a.totalValueUsd)
      return result
    }

    if (groupBy === "tag") {
      const map = new Map<string, Set<string>>()
      const assetMap = new Map<string, EnrichedAsset>()

      for (const asset of sortedAssets) {
        assetMap.set(asset.id, asset)
        for (const tag of asset.tags) {
          const existing = map.get(tag) ?? new Set()
          existing.add(asset.id)
          map.set(tag, existing)
        }
        if (asset.tags.length === 0) {
          const existing = map.get("Other") ?? new Set()
          existing.add(asset.id)
          map.set("Other", existing)
        }
      }

      const result: AssetGroup[] = []
      for (const [key, assetIds] of map) {
        const groupAssets = [...assetIds].map((id) => assetMap.get(id)!).filter(Boolean)
        let totalValueUsdBn = BN_ZERO
        let totalValueTryBn = BN_ZERO
        let totalPnlUsdBn = BN_ZERO
        for (const a of groupAssets) {
          totalValueUsdBn = totalValueUsdBn.plus(bn(a.currentValueUsd))
          totalValueTryBn = totalValueTryBn.plus(bn(a.currentValueTry))
          totalPnlUsdBn = totalPnlUsdBn.plus(bn(a.unrealizedPnlUsd))
        }

        result.push({
          key,
          label: key,
          assets: groupAssets,
          totalValueUsd: totalValueUsdBn.toNumber(),
          totalValueTry: totalValueTryBn.toNumber(),
          totalPnlUsd: totalPnlUsdBn.toNumber(),
        })
      }

      result.sort((a, b) => b.totalValueUsd - a.totalValueUsd)
      return result
    }

    // Default: group by category
    const map = new Map<string, EnrichedAsset[]>()

    for (const asset of sortedAssets) {
      const key = asset.category
      const existing = map.get(key) ?? []
      existing.push(asset)
      map.set(key, existing)
    }

    const result: AssetGroup[] = []
    for (const [key, groupAssets] of map) {
      const label = CATEGORY_LABELS[key] ?? key

      let totalValueUsdBn = BN_ZERO
      let totalValueTryBn = BN_ZERO
      let totalPnlUsdBn = BN_ZERO
      for (const a of groupAssets) {
        totalValueUsdBn = totalValueUsdBn.plus(bn(a.currentValueUsd))
        totalValueTryBn = totalValueTryBn.plus(bn(a.currentValueTry))
        totalPnlUsdBn = totalPnlUsdBn.plus(bn(a.unrealizedPnlUsd))
      }

      result.push({
        key,
        label,
        assets: groupAssets,
        totalValueUsd: totalValueUsdBn.toNumber(),
        totalValueTry: totalValueTryBn.toNumber(),
        totalPnlUsd: totalPnlUsdBn.toNumber(),
      })
    }

    result.sort((a, b) => b.totalValueUsd - a.totalValueUsd)
    return result
  }, [sortedAssets, groupBy])

  const totalValueTry = totalCurrentValueUsd.times(bn(usdTryRate)).toNumber()
  const totalUnrealizedPnlPct = totalCostBasisUsd.isZero()
    ? 0
    : totalUnrealizedPnlUsd.div(totalCostBasisUsd).times(100).toNumber()

  // Total P&L = unrealized + realized. % uses computeCurrentInvestedUsd as the
  // denominator — same as Dashboard hero — so the headline matches across pages.
  const totalPnlUsdBn = totalUnrealizedPnlUsd.plus(totalRealizedPnlUsd)
  const investedAbs = totalInvestedUsd.abs()
  const totalPnlPct = investedAbs.isZero()
    ? 0
    : totalPnlUsdBn.div(investedAbs).times(100).toNumber()

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
    totalPnlUsd: totalPnlUsdBn.toNumber(),
    totalPnlPct,
    activeAssetCount: activeAssets.length,
    loading,
    error,
    search,
    setSearch,
    groupBy,
    setGroupBy,
    sortBy,
    setSortBy,
    refetch,
  }
}
