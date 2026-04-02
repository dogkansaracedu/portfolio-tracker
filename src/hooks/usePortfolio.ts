import { useMemo, useState } from "react"
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

    const totalValue = totalCurrentValueUsd || 1 // avoid division by zero

    return activeAssets.map((asset: AssetWithPlatform): EnrichedAsset => {
      const price: PriceCache | undefined = prices[asset.ticker]
      const priceUsd = price?.price_usd ?? 0
      const priceTry = price?.price_try ?? priceUsd * usdTryRate

      const currentValueUsd = asset.balance * priceUsd
      const currentValueTry = asset.balance * priceTry

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
        currentPriceUsd: priceUsd,
        currentPriceTry: priceTry,
        currentValueUsd,
        currentValueTry,
        costBasisUsd: pnl?.costBasisUsd ?? 0,
        unrealizedPnlUsd: pnl?.unrealizedPnlUsd ?? 0,
        unrealizedPnlPct: pnl?.unrealizedPnlPct ?? 0,
        allocationPct:
          totalCurrentValueUsd > 0
            ? (currentValueUsd / totalValue) * 100
            : 0,
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

      const totalValueUsd = groupAssets.reduce(
        (s, a) => s + a.currentValueUsd,
        0,
      )
      const totalValueTry = groupAssets.reduce(
        (s, a) => s + a.currentValueTry,
        0,
      )
      const totalPnlUsd = groupAssets.reduce(
        (s, a) => s + a.unrealizedPnlUsd,
        0,
      )

      result.push({
        key,
        label,
        color,
        assets: groupAssets,
        totalValueUsd,
        totalValueTry,
        totalPnlUsd,
      })
    }

    // Sort groups by total value descending
    result.sort((a, b) => b.totalValueUsd - a.totalValueUsd)

    return result
  }, [sortedAssets, groupBy])

  const totalValueTry = totalCurrentValueUsd * usdTryRate
  const totalUnrealizedPnlPct =
    totalCostBasisUsd > 0
      ? (totalUnrealizedPnlUsd / totalCostBasisUsd) * 100
      : 0

  return {
    enrichedAssets: sortedAssets,
    groups,
    totalValueUsd: totalCurrentValueUsd,
    totalValueTry,
    totalCostBasisUsd,
    totalUnrealizedPnlUsd,
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
