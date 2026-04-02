import { useMemo } from "react"
import { useAssets } from "@/hooks/useAssets"
import { usePrices } from "@/hooks/usePrices"
import { usePnL } from "@/hooks/usePnL"
import type { AssetCategory, PriceCache } from "@/types/database"
import type { AssetWithPlatform } from "@/lib/queries/assets"
import type { AssetPnL } from "@/lib/pnl/types"

export interface CategoryAllocation {
  category: AssetCategory
  valueUsd: number
  valueTry: number
  percentage: number
}

export interface PlatformAllocation {
  platformName: string
  color: string
  valueUsd: number
  valueTry: number
  percentage: number
}

export interface TopMover {
  assetId: string
  ticker: string
  name: string
  platformName: string
  unrealizedPnlUsd: number
  unrealizedPnlPct: number
  currentValueUsd: number
}

export interface DashboardData {
  totalValueUsd: number
  totalValueTry: number
  byCategory: CategoryAllocation[]
  byPlatform: PlatformAllocation[]
  topMovers: TopMover[]
  loading: boolean
}

function computeAssetValue(
  asset: AssetWithPlatform,
  prices: Record<string, PriceCache>,
): { usd: number; try_: number } {
  const price = prices[asset.ticker]
  const usd = asset.balance * (price?.price_usd ?? 0)
  const try_ = asset.balance * (price?.price_try ?? 0)
  return { usd, try_ }
}

export function useDashboard(): DashboardData {
  const { assets, loading: assetsLoading } = useAssets()
  const { prices, loading: pricesLoading } = usePrices()
  const { assetPnLs, loading: pnlLoading } = usePnL(assets, prices)

  const loading = assetsLoading || pricesLoading || pnlLoading

  const result = useMemo(() => {
    const activeAssets = assets.filter((a) => a.is_active)

    // Total values
    let totalValueUsd = 0
    let totalValueTry = 0

    for (const asset of activeAssets) {
      const { usd, try_ } = computeAssetValue(asset, prices)
      totalValueUsd += usd
      totalValueTry += try_
    }

    // By category
    const categoryMap = new Map<
      AssetCategory,
      { valueUsd: number; valueTry: number }
    >()

    for (const asset of activeAssets) {
      const { usd, try_ } = computeAssetValue(asset, prices)
      const existing = categoryMap.get(asset.category) ?? {
        valueUsd: 0,
        valueTry: 0,
      }
      categoryMap.set(asset.category, {
        valueUsd: existing.valueUsd + usd,
        valueTry: existing.valueTry + try_,
      })
    }

    const byCategory: CategoryAllocation[] = Array.from(
      categoryMap.entries(),
    )
      .map(([category, { valueUsd, valueTry }]) => ({
        category,
        valueUsd,
        valueTry,
        percentage: totalValueUsd > 0 ? (valueUsd / totalValueUsd) * 100 : 0,
      }))
      .sort((a, b) => b.valueUsd - a.valueUsd)

    // By platform
    const platformMap = new Map<
      string,
      { color: string; valueUsd: number; valueTry: number }
    >()

    for (const asset of activeAssets) {
      const { usd, try_ } = computeAssetValue(asset, prices)
      const key = asset.platforms.name
      const existing = platformMap.get(key) ?? {
        color: asset.platforms.color,
        valueUsd: 0,
        valueTry: 0,
      }
      platformMap.set(key, {
        color: existing.color,
        valueUsd: existing.valueUsd + usd,
        valueTry: existing.valueTry + try_,
      })
    }

    const byPlatform: PlatformAllocation[] = Array.from(
      platformMap.entries(),
    )
      .map(([platformName, { color, valueUsd, valueTry }]) => ({
        platformName,
        color,
        valueUsd,
        valueTry,
        percentage: totalValueUsd > 0 ? (valueUsd / totalValueUsd) * 100 : 0,
      }))
      .sort((a, b) => b.valueUsd - a.valueUsd)

    // Top movers: top 5 by absolute unrealized P&L USD
    // Build a lookup from assetId -> asset for name/platform
    const assetLookup = new Map<string, AssetWithPlatform>()
    for (const asset of activeAssets) {
      assetLookup.set(asset.id, asset)
    }

    const topMovers: TopMover[] = assetPnLs
      .filter((p: AssetPnL) => p.category !== "fiat")
      .sort(
        (a: AssetPnL, b: AssetPnL) =>
          Math.abs(b.unrealizedPnlUsd) - Math.abs(a.unrealizedPnlUsd),
      )
      .slice(0, 5)
      .map((p: AssetPnL) => {
        const asset = assetLookup.get(p.assetId)
        return {
          assetId: p.assetId,
          ticker: p.ticker,
          name: asset?.name ?? p.ticker,
          platformName: asset?.platforms.name ?? "",
          unrealizedPnlUsd: p.unrealizedPnlUsd,
          unrealizedPnlPct: p.unrealizedPnlPct,
          currentValueUsd: p.currentValueUsd,
        }
      })

    return {
      totalValueUsd,
      totalValueTry,
      byCategory,
      byPlatform,
      topMovers,
    }
  }, [assets, prices, assetPnLs])

  return { ...result, loading }
}
