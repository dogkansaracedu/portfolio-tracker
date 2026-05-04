import { useMemo } from "react"
import BigNumber from "bignumber.js"
import { bn, BN_ZERO } from "@/lib/config"
import { useHoldings } from "@/hooks/useHoldings"
import { usePrices } from "@/hooks/usePrices"
import { usePnL } from "@/hooks/usePnL"
import { useSnapshots } from "@/hooks/useSnapshots"
import type { AssetPnL } from "@/lib/pnl/types"

// ─── Types ──────────────────────────────────────────────────────────

export interface CategoryAllocation {
  category: string
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

export interface TagAllocation {
  tag: string
  valueUsd: number
  valueTry: number
  percentage: number
  quantity: number
}

export interface TopMover {
  assetId: string
  ticker: string
  name: string
  unrealizedPnlUsd: number
  unrealizedPnlPct: number
  currentValueUsd: number
}

export interface InvestmentPnL {
  totalCostBasisUsd: number
  totalUnrealizedPnlUsd: number
  totalRealizedPnlUsd: number
  totalPnlUsd: number
  totalPnlPct: number
}

export interface DashboardData {
  totalValueUsd: number
  totalValueTry: number
  byCategory: CategoryAllocation[]
  byPlatform: PlatformAllocation[]
  byTag: TagAllocation[]
  topMovers: TopMover[]
  snapshots: import("@/types/database").Snapshot[]
  /** Latest USD/TRY rate, or 1 if unavailable. */
  usdTry: number
  /** FIFO-based current cumulative P&L. */
  investmentPnL: InvestmentPnL
  loading: boolean
}

// ─── Helpers ────────────────────────────────────────────────────────

/** Troy ounce to grams conversion factor. */
const OZ_TO_GRAMS = 31.1035

/** Tickers whose balance should be converted from oz to grams for display. */
const GOLD_OZ_TICKERS = new Set(["paxgold", "tether-gold"])

// ─── Hook ───────────────────────────────────────────────────────────

export function useDashboard(): DashboardData {
  const { holdings, loading: holdingsLoading } = useHoldings()
  const { prices, rates, loading: pricesLoading } = usePrices()
  const {
    assetPnLs,
    totalCostBasisUsd,
    totalUnrealizedPnlUsd,
    totalRealizedPnlUsd,
    loading: pnlLoading,
  } = usePnL(holdings, prices)
  const { snapshots, loading: snapshotsLoading } = useSnapshots()

  const loading = holdingsLoading || pricesLoading || pnlLoading || snapshotsLoading
  const usdTry = rates?.usd_try ?? 1

  const investmentPnL: InvestmentPnL = useMemo(() => {
    const cost = bn(totalCostBasisUsd)
    const unreal = bn(totalUnrealizedPnlUsd)
    const real = bn(totalRealizedPnlUsd)
    const total = unreal.plus(real)
    return {
      totalCostBasisUsd: cost.toNumber(),
      totalUnrealizedPnlUsd: unreal.toNumber(),
      totalRealizedPnlUsd: real.toNumber(),
      totalPnlUsd: total.toNumber(),
      totalPnlPct: cost.isZero() ? 0 : total.div(cost).times(100).toNumber(),
    }
  }, [totalCostBasisUsd, totalUnrealizedPnlUsd, totalRealizedPnlUsd])

  const result = useMemo(() => {
    let totalValueUsd = BN_ZERO
    let totalValueTry = BN_ZERO

    const categoryMap = new Map<string, { valueUsd: BigNumber; valueTry: BigNumber }>()
    const platformMap = new Map<string, { color: string; valueUsd: BigNumber; valueTry: BigNumber }>()
    const tagMap = new Map<string, { valueUsd: BigNumber; valueTry: BigNumber; quantity: BigNumber }>()

    // Single pass: compute per-holding value once, then accumulate into
    // totals and the category / platform / tag buckets.
    for (const h of holdings) {
      const price = prices[h.assets.ticker]
      const balance = bn(h.balance)
      const usd = balance.times(bn(price?.price_usd))
      const try_ = balance.times(bn(price?.price_try))

      totalValueUsd = totalValueUsd.plus(usd)
      totalValueTry = totalValueTry.plus(try_)

      const cat = h.assets.category
      const catExisting = categoryMap.get(cat)
      if (catExisting) {
        catExisting.valueUsd = catExisting.valueUsd.plus(usd)
        catExisting.valueTry = catExisting.valueTry.plus(try_)
      } else {
        categoryMap.set(cat, { valueUsd: usd, valueTry: try_ })
      }

      const platKey = h.platforms.name
      const platExisting = platformMap.get(platKey)
      if (platExisting) {
        platExisting.valueUsd = platExisting.valueUsd.plus(usd)
        platExisting.valueTry = platExisting.valueTry.plus(try_)
      } else {
        platformMap.set(platKey, { color: h.platforms.color, valueUsd: usd, valueTry: try_ })
      }

      const tags = h.assets.tags ?? []
      if (tags.length > 0) {
        const quantity = GOLD_OZ_TICKERS.has(h.assets.ticker)
          ? balance.times(OZ_TO_GRAMS)
          : balance
        for (const tag of tags) {
          const tagExisting = tagMap.get(tag)
          if (tagExisting) {
            tagExisting.valueUsd = tagExisting.valueUsd.plus(usd)
            tagExisting.valueTry = tagExisting.valueTry.plus(try_)
            tagExisting.quantity = tagExisting.quantity.plus(quantity)
          } else {
            tagMap.set(tag, { valueUsd: usd, valueTry: try_, quantity })
          }
        }
      }
    }

    const byCategory: CategoryAllocation[] = Array.from(categoryMap.entries())
      .map(([category, { valueUsd, valueTry }]) => ({
        category,
        valueUsd: valueUsd.toNumber(),
        valueTry: valueTry.toNumber(),
        percentage: totalValueUsd.isZero()
          ? 0
          : valueUsd.div(totalValueUsd).times(100).toNumber(),
      }))
      .sort((a, b) => b.valueUsd - a.valueUsd)

    const byPlatform: PlatformAllocation[] = Array.from(platformMap.entries())
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

    const byTag: TagAllocation[] = Array.from(
      tagMap.entries(),
    )
      .map(([tag, { valueUsd, valueTry, quantity }]) => ({
        tag,
        valueUsd: valueUsd.toNumber(),
        valueTry: valueTry.toNumber(),
        percentage: totalValueUsd.isZero()
          ? 0
          : valueUsd.div(totalValueUsd).times(100).toNumber(),
        quantity: quantity.toNumber(),
      }))
      .sort((a, b) => b.valueUsd - a.valueUsd)

    // ── Top movers ───────────────────────────────────────────────
    const topMovers: TopMover[] = assetPnLs
      .filter((p: AssetPnL) => p.category !== "fiat")
      .sort(
        (a: AssetPnL, b: AssetPnL) =>
          bn(b.unrealizedPnlUsd).abs().comparedTo(bn(a.unrealizedPnlUsd).abs()) ?? 0,
      )
      .slice(0, 5)
      .map((p: AssetPnL) => {
        const holding = holdings.find((h) => h.asset_id === p.assetId)
        return {
          assetId: p.assetId,
          ticker: p.ticker,
          name: holding?.assets.name ?? p.ticker,
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
      byTag,
      topMovers,
      snapshots,
    }
  }, [holdings, prices, assetPnLs, snapshots])

  return { ...result, usdTry, investmentPnL, loading }
}
