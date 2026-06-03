import { useMemo, useState } from "react"
import { bn, BN_ZERO } from "@/lib/config"
import { useAssets } from "@/hooks/useAssets"
import { useHoldings } from "@/hooks/useHoldings"
import { usePrices } from "@/hooks/usePrices"
import { usePnL } from "@/hooks/usePnL"
import { useSnapshots } from "@/hooks/useSnapshots"
import { summarizePnLTotals } from "@/lib/pnl/totals"
import { computeCurrentInvestedUsd } from "@/lib/performance"
import { computeDailyReturn, dailyReturnPct } from "@/lib/pnl/daily"
import type { Asset, PriceCache, Transaction } from "@/types/database"
import type { HoldingWithDetails } from "@/lib/queries/holdings"
import type { AssetPnL } from "@/lib/pnl/types"

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
  totalPnlUsd: number
  totalPnlPct: number
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
  const { snapshots } = useSnapshots()

  const {
    assetPnLs,
    totalCostBasisUsd,
    totalCurrentValueUsd,
    totalUnrealizedPnlUsd,
    totalRealizedPnlUsd,
    totalInvestedUsd,
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

  // Snapshot-derived price lookups. We read *price-per-unit* from the
  // snapshot and multiply by the *live* balance from `holdings`. This
  // keeps quantity changes (after a tx) reflected immediately while
  // treating the snapshot as the source of truth for prices (≤5s lag on
  // a price refresh is bounded and unnoticeable). Reading the frozen
  // value_usd directly would briefly show pre-tx values whenever the
  // balance changed — a real UX regression for a tracker the user
  // stares at while editing.
  //
  // tickerToPriceUsd is the per-asset rollup price; byTickerPlatform
  // carries the same per-(ticker, platform) for the "group by platform"
  // breakdown. fallbackUsdTry comes from the snapshot's recorded rate
  // (never live — that would retro-convert old snapshots at today's rate).
  const snapshotLookups = useMemo(() => {
    const latest = snapshots[snapshots.length - 1]
    const byTickerPlatform = new Map<string, { price_usd: number }>()
    const tickerToPriceUsd = new Map<string, number>()
    const fallbackUsdTry = latest?.breakdown?.rates?.usd_try ?? usdTryRate
    if (latest?.breakdown?.by_asset) {
      for (const e of latest.breakdown.by_asset) {
        byTickerPlatform.set(`${e.ticker}|${e.platform}`, {
          price_usd: e.price_usd,
        })
        // Snapshot price_usd is identical across platforms for the same
        // ticker on the same date, so first one wins.
        if (!tickerToPriceUsd.has(e.ticker)) {
          tickerToPriceUsd.set(e.ticker, e.price_usd)
        }
      }
    }
    return {
      byTickerPlatform,
      tickerToPriceUsd,
      fallbackUsdTry,
    }
  }, [snapshots, usdTryRate])

  // Daily-return inputs derived from the *previous* snapshot. Daily return is
  // ΔP&L over the day = current value − previous-snapshot value − cash deployed
  // since then (computeCurrentInvestedUsd over the period's txs) — the canonical
  // money-weighted Total P&L (lib/pnl/totals.ts) applied across one day, so it
  // captures fiat FX too. We read the previous snapshot's *frozen* value_usd
  // (unlike the latest snapshot, where we use price × live balance): the frozen
  // value IS "yesterday's close," which is exactly the baseline we want.
  const dailyReturnLookups = useMemo(() => {
    const prev = snapshots[snapshots.length - 2]
    const available = !!prev?.breakdown?.by_asset
    const prevValueByTicker = new Map<string, number>()
    const prevValueByTickerPlatform = new Map<string, number>()
    const investedByAsset = new Map<string, number>()
    const investedByAssetPlatform = new Map<string, number>()

    if (available && prev?.breakdown?.by_asset) {
      for (const e of prev.breakdown.by_asset) {
        prevValueByTicker.set(
          e.ticker,
          (prevValueByTicker.get(e.ticker) ?? 0) + e.value_usd,
        )
        prevValueByTickerPlatform.set(`${e.ticker}|${e.platform}`, e.value_usd)
      }

      // Net cash deployed strictly AFTER the previous snapshot's date — same
      // date-slice cutoff computePnLTimeSeries uses (performance.ts:605-607).
      // Bucket once, then sum net invested per asset and per (asset, platform).
      const prevDate = prev.snapshot_date
      const txByAsset = new Map<string, Transaction[]>()
      const txByAssetPlatform = new Map<string, Transaction[]>()
      for (const tx of transactions) {
        if (tx.date.slice(0, 10) <= prevDate) continue
        const a = txByAsset.get(tx.asset_id) ?? []
        a.push(tx)
        txByAsset.set(tx.asset_id, a)
        const k = `${tx.asset_id}|${tx.platform_id}`
        const ap = txByAssetPlatform.get(k) ?? []
        ap.push(tx)
        txByAssetPlatform.set(k, ap)
      }
      for (const [id, txs] of txByAsset) {
        investedByAsset.set(id, computeCurrentInvestedUsd(txs, txRates))
      }
      for (const [k, txs] of txByAssetPlatform) {
        investedByAssetPlatform.set(k, computeCurrentInvestedUsd(txs, txRates))
      }
    }

    return {
      available,
      prevValueByTicker,
      prevValueByTickerPlatform,
      investedByAsset,
      investedByAssetPlatform,
    }
  }, [snapshots, transactions, txRates])

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
      const livePrice: PriceCache | undefined = prices[asset.price_id ?? asset.ticker]
      const liveBnPriceUsd = bn(livePrice?.price_usd)

      const assetHoldings = holdingsByAsset.get(asset.id) ?? []
      // Match snapshot semantics (snapshots.ts:70 — `h.balance <= 0` skipped)
      // so the platform-grouped view never renders empty positions and
      // rollups stay consistent with the Dashboard.
      const heldHoldings = assetHoldings.filter((h) => h.balance > 0)

      const holdingsData = heldHoldings.map((h) => ({
        platformId: h.platform_id,
        platformName: h.platforms.name,
        platformColor: h.platforms.color,
        balance: h.balance,
      }))

      const bnTotalBalance = heldHoldings.reduce(
        (sum, h) => sum.plus(bn(h.balance)),
        BN_ZERO,
      )

      // Snapshot-priced. Prefer the snapshot's price_usd for the ticker
      // (same across platforms on the same date), fall back to live for
      // assets the snapshot doesn't yet cover. Value = balance × price
      // ensures the Value column tracks live quantity changes from
      // transactions while still treating the snapshot as the source of
      // truth for prices.
      const snapshotPriceUsd = snapshotLookups.tickerToPriceUsd.get(asset.ticker)
      const currentPriceUsd =
        snapshotPriceUsd != null ? bn(snapshotPriceUsd) : liveBnPriceUsd
      const currentPriceTry = currentPriceUsd.times(
        bn(snapshotLookups.fallbackUsdTry),
      )
      const currentValueUsd = bnTotalBalance.times(currentPriceUsd)
      const currentValueTry = bnTotalBalance.times(currentPriceTry)

      const pnl = pnlMap.get(asset.id)

      const daily = dailyReturnLookups.available
        ? computeDailyReturn({
            currentValueUsd,
            prevValueUsd: bn(
              dailyReturnLookups.prevValueByTicker.get(asset.ticker) ?? 0,
            ),
            periodInvestedUsd: bn(
              dailyReturnLookups.investedByAsset.get(asset.id) ?? 0,
            ),
          })
        : null

      return {
        id: asset.id,
        name: asset.name,
        ticker: asset.ticker,
        category: asset.category,
        icon_url: asset.icon_url,
        tags: asset.tags ?? [],
        totalBalance: bnTotalBalance.toNumber(),
        holdings: holdingsData,
        currentPriceUsd: currentPriceUsd.toNumber(),
        currentPriceTry: currentPriceTry.toNumber(),
        currentValueUsd: currentValueUsd.toNumber(),
        currentValueTry: currentValueTry.toNumber(),
        costBasisUsd: bn(pnl?.costBasisUsd).toNumber(),
        costBasisNative:
          pnl?.costBasisNative != null ? pnl.costBasisNative.toNumber() : null,
        nativeCurrency: pnl?.nativeCurrency ?? null,
        unrealizedPnlUsd: bn(pnl?.unrealizedPnlUsd).toNumber(),
        unrealizedPnlPct: bn(pnl?.unrealizedPnlPct).toNumber(),
        allocationPct: totalValue.isZero()
          ? 0
          : currentValueUsd.div(totalValue).times(100).toNumber(),
        dailyReturnUsd: daily ? daily.dailyReturnUsd.toNumber() : 0,
        dailyReturnPct:
          daily && daily.dailyReturnPct !== null
            ? daily.dailyReturnPct.toNumber()
            : null,
        dailyDenomUsd: daily ? daily.denomUsd.toNumber() : 0,
      }
    }).filter((asset) => asset.totalBalance > 0)
  }, [
    activeAssets,
    holdings,
    prices,
    assetPnLs,
    totalCurrentValueUsd,
    usdTryRate,
    snapshotLookups,
    dailyReturnLookups,
  ])

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
          // platformValue = live balance × snapshot-priced per-unit.
          // Per-(ticker, platform) snapshot entry overrides the asset
          // rollup's price; falls back to asset.currentPriceUsd (which
          // itself prefers snapshot) when no entry exists.
          const snapshotPlatformEntry =
            snapshotLookups.byTickerPlatform.get(`${asset.ticker}|${h.platformName}`)
          const platformPriceUsd = snapshotPlatformEntry
            ? snapshotPlatformEntry.price_usd
            : asset.currentPriceUsd
          const platformPriceTry =
            platformPriceUsd * snapshotLookups.fallbackUsdTry
          const platformValueUsd = platformBalance * platformPriceUsd
          const platformValueTry = platformBalance * platformPriceTry
          const costPerUnit = asset.totalBalance > 0
            ? asset.costBasisUsd / asset.totalBalance
            : 0
          const platformCostBasis = costPerUnit * platformBalance

          const platformDaily = dailyReturnLookups.available
            ? computeDailyReturn({
                currentValueUsd: bn(platformValueUsd),
                prevValueUsd: bn(
                  dailyReturnLookups.prevValueByTickerPlatform.get(
                    `${asset.ticker}|${h.platformName}`,
                  ) ?? 0,
                ),
                periodInvestedUsd: bn(
                  dailyReturnLookups.investedByAssetPlatform.get(
                    `${asset.id}|${h.platformId}`,
                  ) ?? 0,
                ),
              })
            : null

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
            dailyReturnUsd: platformDaily ? platformDaily.dailyReturnUsd.toNumber() : 0,
            dailyReturnPct:
              platformDaily && platformDaily.dailyReturnPct !== null
                ? platformDaily.dailyReturnPct.toNumber()
                : null,
            dailyDenomUsd: platformDaily ? platformDaily.denomUsd.toNumber() : 0,
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
        let dailyReturnUsdBn = BN_ZERO
        let dailyDenomUsdBn = BN_ZERO
        for (const a of groupAssets) {
          totalValueUsdBn = totalValueUsdBn.plus(bn(a.currentValueUsd))
          totalValueTryBn = totalValueTryBn.plus(bn(a.currentValueTry))
          totalPnlUsdBn = totalPnlUsdBn.plus(bn(a.unrealizedPnlUsd))
          dailyReturnUsdBn = dailyReturnUsdBn.plus(bn(a.dailyReturnUsd))
          dailyDenomUsdBn = dailyDenomUsdBn.plus(bn(a.dailyDenomUsd))
          a.allocationPct = totalValue.isZero()
            ? 0
            : bn(a.currentValueUsd).div(totalValue).times(100).toNumber()
        }
        const groupDailyPct = dailyReturnLookups.available
          ? dailyReturnPct(dailyReturnUsdBn, dailyDenomUsdBn)
          : null

        result.push({
          key,
          label: meta.name,
          color: meta.color,
          assets: groupAssets,
          totalValueUsd: totalValueUsdBn.toNumber(),
          totalValueTry: totalValueTryBn.toNumber(),
          totalPnlUsd: totalPnlUsdBn.toNumber(),
          dailyReturnUsd: dailyReturnLookups.available
            ? dailyReturnUsdBn.toNumber()
            : 0,
          dailyReturnPct: groupDailyPct !== null ? groupDailyPct.toNumber() : null,
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
        let dailyReturnUsdBn = BN_ZERO
        let dailyDenomUsdBn = BN_ZERO
        for (const a of groupAssets) {
          totalValueUsdBn = totalValueUsdBn.plus(bn(a.currentValueUsd))
          totalValueTryBn = totalValueTryBn.plus(bn(a.currentValueTry))
          totalPnlUsdBn = totalPnlUsdBn.plus(bn(a.unrealizedPnlUsd))
          dailyReturnUsdBn = dailyReturnUsdBn.plus(bn(a.dailyReturnUsd))
          dailyDenomUsdBn = dailyDenomUsdBn.plus(bn(a.dailyDenomUsd))
        }
        const groupDailyPct = dailyReturnLookups.available
          ? dailyReturnPct(dailyReturnUsdBn, dailyDenomUsdBn)
          : null

        result.push({
          key,
          label: key,
          assets: groupAssets,
          totalValueUsd: totalValueUsdBn.toNumber(),
          totalValueTry: totalValueTryBn.toNumber(),
          totalPnlUsd: totalPnlUsdBn.toNumber(),
          dailyReturnUsd: dailyReturnLookups.available
            ? dailyReturnUsdBn.toNumber()
            : 0,
          dailyReturnPct: groupDailyPct !== null ? groupDailyPct.toNumber() : null,
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
      let dailyReturnUsdBn = BN_ZERO
      let dailyDenomUsdBn = BN_ZERO
      for (const a of groupAssets) {
        totalValueUsdBn = totalValueUsdBn.plus(bn(a.currentValueUsd))
        totalValueTryBn = totalValueTryBn.plus(bn(a.currentValueTry))
        totalPnlUsdBn = totalPnlUsdBn.plus(bn(a.unrealizedPnlUsd))
        dailyReturnUsdBn = dailyReturnUsdBn.plus(bn(a.dailyReturnUsd))
        dailyDenomUsdBn = dailyDenomUsdBn.plus(bn(a.dailyDenomUsd))
      }
      const groupDailyPct = dailyReturnLookups.available
        ? dailyReturnPct(dailyReturnUsdBn, dailyDenomUsdBn)
        : null

      result.push({
        key,
        label,
        assets: groupAssets,
        totalValueUsd: totalValueUsdBn.toNumber(),
        totalValueTry: totalValueTryBn.toNumber(),
        totalPnlUsd: totalPnlUsdBn.toNumber(),
        dailyReturnUsd: dailyReturnLookups.available
          ? dailyReturnUsdBn.toNumber()
          : 0,
        dailyReturnPct: groupDailyPct !== null ? groupDailyPct.toNumber() : null,
      })
    }

    result.sort((a, b) => b.totalValueUsd - a.totalValueUsd)
    return result
  }, [sortedAssets, groupBy, snapshotLookups, totalCurrentValueUsd, dailyReturnLookups])

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
    })
  const totalPnlPct = totalPnlPctBn.toNumber()

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
