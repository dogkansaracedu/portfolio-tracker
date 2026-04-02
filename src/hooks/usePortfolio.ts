import { useMemo, useState } from "react"
import { bn, BN_ZERO } from "@/lib/config"
import { useAssets } from "@/hooks/useAssets"
import { usePrices } from "@/hooks/usePrices"
import { usePnL } from "@/hooks/usePnL"
import type { AssetWithPlatform } from "@/lib/queries/assets"
import type { AssetPnL } from "@/lib/pnl/types"
import type { PriceCache } from "@/types/database"

// ─── Types ──────────────────────────────────────────────────────────

export interface EnrichedAsset {
  id: string
  name: string
  ticker: string
  category: string
  balance: number
  isActive: boolean
  platformId: string
  platformName: string
  platformColor: string
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

export type GroupBy = "platform" | "category"
export type SortBy = "value" | "pnl" | "name"

interface UsePortfolioReturn {
  enrichedAssets: EnrichedAsset[]
  groups: AssetGroup[]
  totalValueUsd: number
  totalValueTry: number
  totalCostBasisUsd: number
  totalUnrealizedPnlUsd: number
  totalUnrealizedPnlPct: number
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
  crypto: "Crypto",
  stock_us: "US Stocks",
  stock_bist: "BIST Stocks",
  commodity: "Commodities",
  fiat: "Fiat",
}

// ─── Hook ───────────────────────────────────────────────────────────

export function usePortfolio(): UsePortfolioReturn {
  const { assets, loading: assetsLoading, error, refetch } = useAssets()
  const { prices, rates, loading: pricesLoading } = usePrices()

  const activeAssets = useMemo(
    () => assets.filter((a) => a.is_active),
    [assets],
  )

  const {
    assetPnLs,
    totalCostBasisUsd,
    totalCurrentValueUsd,
    totalUnrealizedPnlUsd,
    loading: pnlLoading,
  } = usePnL(activeAssets, prices)

  const [search, setSearch] = useState("")
  const [groupBy, setGroupBy] = useState<GroupBy>("platform")
  const [sortBy, setSortBy] = useState<SortBy>("value")

  const loading = assetsLoading || pricesLoading || pnlLoading

  const usdTryRate = rates?.usd_try ?? 0

  // Build enriched assets
  const enrichedAssets = useMemo(() => {
    const pnlMap = new Map<string, AssetPnL>()
    for (const pnl of assetPnLs) {
      pnlMap.set(pnl.assetId, pnl)
    }

    const totalValue = bn(totalCurrentValueUsd)

    return activeAssets.map((asset: AssetWithPlatform): EnrichedAsset => {
      const price: PriceCache | undefined = prices[asset.ticker]
      const bnPriceUsd = bn(price?.price_usd)
      const bnPriceTry = price?.price_try
        ? bn(price.price_try)
        : bnPriceUsd.times(bn(usdTryRate))

      const bnBalance = bn(asset.balance)
      const currentValueUsd = bnBalance.times(bnPriceUsd)
      const currentValueTry = bnBalance.times(bnPriceTry)

      const pnl = pnlMap.get(asset.id)

      return {
        id: asset.id,
        name: asset.name,
        ticker: asset.ticker,
        category: asset.category,
        balance: asset.balance,
        isActive: asset.is_active,
        platformId: asset.platform_id,
        platformName: asset.platforms.name,
        platformColor: asset.platforms.color,
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
  }, [activeAssets, prices, assetPnLs, totalCurrentValueUsd, usdTryRate])

  // Filter by search
  const filteredAssets = useMemo(() => {
    if (!search.trim()) return enrichedAssets
    const q = search.toLowerCase()
    return enrichedAssets.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.ticker.toLowerCase().includes(q),
    )
  }, [enrichedAssets, search])

  // Sort
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

  // Group
  const groups = useMemo((): AssetGroup[] => {
    const map = new Map<string, EnrichedAsset[]>()

    for (const asset of sortedAssets) {
      const key = groupBy === "platform" ? asset.platformId : asset.category
      const existing = map.get(key)
      if (existing) {
        existing.push(asset)
      } else {
        map.set(key, [asset])
      }
    }

    const result: AssetGroup[] = []
    for (const [key, groupAssets] of map) {
      const first = groupAssets[0]
      const label =
        groupBy === "platform"
          ? first.platformName
          : CATEGORY_LABELS[key] ?? key
      const color = groupBy === "platform" ? first.platformColor : undefined

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
        color,
        assets: groupAssets,
        totalValueUsd: totalValueUsdBn.toNumber(),
        totalValueTry: totalValueTryBn.toNumber(),
        totalPnlUsd: totalPnlUsdBn.toNumber(),
      })
    }

    // Sort groups by total value descending
    result.sort((a, b) => b.totalValueUsd - a.totalValueUsd)

    return result
  }, [sortedAssets, groupBy])

  const totalValueTry = totalCurrentValueUsd.times(bn(usdTryRate)).toNumber()
  const totalUnrealizedPnlPct = totalCostBasisUsd.isZero()
    ? 0
    : totalUnrealizedPnlUsd.div(totalCostBasisUsd).times(100).toNumber()

  return {
    enrichedAssets: sortedAssets,
    groups,
    totalValueUsd: totalCurrentValueUsd.toNumber(),
    totalValueTry,
    totalCostBasisUsd: totalCostBasisUsd.toNumber(),
    totalUnrealizedPnlUsd: totalUnrealizedPnlUsd.toNumber(),
    totalUnrealizedPnlPct,
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
