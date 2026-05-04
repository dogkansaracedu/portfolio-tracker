import { useMemo } from "react"
import BigNumber from "bignumber.js"
import { bn, BN_ZERO } from "@/lib/config"
import { useHoldings } from "@/hooks/useHoldings"
import { usePrices } from "@/hooks/usePrices"
import { usePnL } from "@/hooks/usePnL"
import { useSnapshots } from "@/hooks/useSnapshots"
import type { PriceCache } from "@/types/database"
import type { HoldingWithDetails } from "@/lib/queries/holdings"
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

function computeHoldingValue(
  h: HoldingWithDetails,
  prices: Record<string, PriceCache>,
): { usd: BigNumber; try_: BigNumber } {
  const price = prices[h.assets.ticker]
  const usd = bn(h.balance).times(bn(price?.price_usd))
  const try_ = bn(h.balance).times(bn(price?.price_try))
  return { usd, try_ }
}

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

    for (const h of holdings) {
      const { usd, try_ } = computeHoldingValue(h, prices)
      totalValueUsd = totalValueUsd.plus(usd)
      totalValueTry = totalValueTry.plus(try_)
    }

    // ── By category (mutually exclusive) ─────────────────────────
    const categoryMap = new Map<
      string,
      { valueUsd: BigNumber; valueTry: BigNumber }
    >()

    for (const h of holdings) {
      const { usd, try_ } = computeHoldingValue(h, prices)
      const cat = h.assets.category
      const existing = categoryMap.get(cat) ?? {
        valueUsd: BN_ZERO,
        valueTry: BN_ZERO,
      }
      categoryMap.set(cat, {
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

    // ── By platform ──────────────────────────────────────────────
    const platformMap = new Map<
      string,
      { color: string; valueUsd: BigNumber; valueTry: BigNumber }
    >()

    for (const h of holdings) {
      const { usd, try_ } = computeHoldingValue(h, prices)
      const key = h.platforms.name
      const existing = platformMap.get(key) ?? {
        color: h.platforms.color,
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

    // ── By tag (cross-cutting, allows overlap) ───────────────────
    const tagMap = new Map<
      string,
      { valueUsd: BigNumber; valueTry: BigNumber; quantity: BigNumber }
    >()

    for (const h of holdings) {
      for (const tag of (h.assets.tags ?? [])) {
        const { usd, try_ } = computeHoldingValue(h, prices)

        const rawBalance = bn(h.balance)
        const quantity = GOLD_OZ_TICKERS.has(h.assets.ticker)
          ? rawBalance.times(OZ_TO_GRAMS)
          : rawBalance

        const existing = tagMap.get(tag) ?? {
          valueUsd: BN_ZERO,
          valueTry: BN_ZERO,
          quantity: BN_ZERO,
        }
        tagMap.set(tag, {
          valueUsd: existing.valueUsd.plus(usd),
          valueTry: existing.valueTry.plus(try_),
          quantity: existing.quantity.plus(quantity),
        })
      }
    }

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
