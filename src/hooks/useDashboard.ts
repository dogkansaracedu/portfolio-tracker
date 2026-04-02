import { useMemo } from "react"
import BigNumber from "bignumber.js"
import { bn, BN_ZERO } from "@/lib/config"
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
): { usd: BigNumber; try_: BigNumber } {
  const price = prices[asset.ticker]
  const usd = bn(asset.balance).times(bn(price?.price_usd))
  const try_ = bn(asset.balance).times(bn(price?.price_try))
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
    let totalValueUsd = BN_ZERO
    let totalValueTry = BN_ZERO

    for (const asset of activeAssets) {
      const { usd, try_ } = computeAssetValue(asset, prices)
      totalValueUsd = totalValueUsd.plus(usd)
      totalValueTry = totalValueTry.plus(try_)
    }

    // By category
    const categoryMap = new Map<
      AssetCategory,
      { valueUsd: BigNumber; valueTry: BigNumber }
    >()

    for (const asset of activeAssets) {
      const { usd, try_ } = computeAssetValue(asset, prices)
      const existing = categoryMap.get(asset.category) ?? {
        valueUsd: BN_ZERO,
        valueTry: BN_ZERO,
      }
      categoryMap.set(asset.category, {
        valueUsd: existing.valueUsd.plus(usd),
        valueTry: existing.valueTry.plus(try_),
      })
    }

    const byCategory: CategoryAllocation[] = Array.from(
      categoryMap.entries(),
    )
      .map(([category, { valueUsd, valueTry }]) => ({
        category,
        valueUsd: valueUsd.toNumber(),
        valueTry: valueTry.toNumber(),
        percentage: totalValueUsd.isZero()
          ? 0
          : valueUsd.div(totalValueUsd).times(100).toNumber(),
      }))
      .sort((a, b) => b.valueUsd - a.valueUsd)

    // By platform
    const platformMap = new Map<
      string,
      { color: string; valueUsd: BigNumber; valueTry: BigNumber }
    >()

    for (const asset of activeAssets) {
      const { usd, try_ } = computeAssetValue(asset, prices)
      const key = asset.platforms.name
      const existing = platformMap.get(key) ?? {
        color: asset.platforms.color,
        valueUsd: BN_ZERO,
        valueTry: BN_ZERO,
      }
      platformMap.set(key, {
        color: existing.color,
        valueUsd: existing.valueUsd.plus(usd),
        valueTry: existing.valueTry.plus(try_),
      })
    }

    const byPlatform: PlatformAllocation[] = Array.from(
      platformMap.entries(),
    )
      .map(([platformName, { color, valueUsd, valueTry }]) => ({
        platformName,
        color,
        valueUsd: valueUsd.toNumber(),
        valueTry: valueTry.toNumber(),
        percentage: totalValueUsd.isZero()
          ? 0
          : valueUsd.div(totalValueUsd).times(100).toNumber(),
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
          bn(b.unrealizedPnlUsd).abs().comparedTo(bn(a.unrealizedPnlUsd).abs()) ?? 0,
      )
      .slice(0, 5)
      .map((p: AssetPnL) => {
        const asset = assetLookup.get(p.assetId)
        return {
          assetId: p.assetId,
          ticker: p.ticker,
          name: asset?.name ?? p.ticker,
          platformName: asset?.platforms.name ?? "",
          unrealizedPnlUsd: bn(p.unrealizedPnlUsd).toNumber(),
          unrealizedPnlPct: bn(p.unrealizedPnlPct).toNumber(),
          currentValueUsd: bn(p.currentValueUsd).toNumber(),
        }
      })

    return {
      totalValueUsd: totalValueUsd.toNumber(),
      totalValueTry: totalValueTry.toNumber(),
      byCategory,
      byPlatform,
      topMovers,
    }
  }, [assets, prices, assetPnLs])

  return { ...result, loading }
}
