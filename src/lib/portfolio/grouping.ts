import type BigNumber from "bignumber.js"
import { bn, BN_ZERO, homeDayIso } from "@/lib/config"
import { computeCurrentInvestedUsd } from "@/lib/performance"
import { computeDailyReturn, dailyReturnPct } from "@/lib/pnl/daily"
import type {
  Asset,
  ExchangeRate,
  PriceCache,
  Snapshot,
  Transaction,
} from "@/types/database"
import type { HoldingWithDetails } from "@/lib/queries/holdings"
import type { AssetPnL, HoldingPnL } from "@/lib/pnl/types"
// Type-only import — erased at build, so no runtime cycle with usePortfolio.
import type {
  AssetGroup,
  EnrichedAsset,
  GroupBy,
  SortBy,
} from "@/hooks/usePortfolio"

// ─── Category labels ────────────────────────────────────────────────

export const CATEGORY_LABELS: Record<string, string> = {
  fiat: "Fiat",
  crypto: "Crypto",
  gold: "Gold",
  stock_us: "US Stocks",
  stock_bist: "BIST Stocks",
}

// ─── Snapshot-derived lookups ───────────────────────────────────────

export interface SnapshotLookups {
  /** Per-(ticker, platform) snapshot price, for the group-by-platform view. */
  byTickerPlatform: Map<string, { price_usd: number }>
  /** Per-ticker snapshot price (identical across platforms on a given date). */
  tickerToPriceUsd: Map<string, number>
  /** USD/TRY from the snapshot's recorded rate (never live). */
  fallbackUsdTry: number
}

/**
 * Snapshot-derived price lookups. We read *price-per-unit* from the snapshot
 * and multiply by the *live* balance from `holdings`, so quantity changes after
 * a tx show immediately while the snapshot stays the source of truth for prices
 * (≤5s price-refresh lag is bounded and unnoticeable). Reading the frozen
 * `value_usd` directly would briefly show pre-tx values whenever balance
 * changed. `fallbackUsdTry` comes from the snapshot's recorded rate (never live
 * — that would retro-convert old snapshots at today's rate).
 */
export function buildSnapshotLookups(
  snapshots: Snapshot[],
  usdTryRate: number,
): SnapshotLookups {
  const latest = snapshots[snapshots.length - 1]
  const byTickerPlatform = new Map<string, { price_usd: number }>()
  const tickerToPriceUsd = new Map<string, number>()
  const fallbackUsdTry = latest?.breakdown?.rates?.usd_try ?? usdTryRate
  if (latest?.breakdown?.by_asset) {
    for (const e of latest.breakdown.by_asset) {
      byTickerPlatform.set(`${e.ticker}|${e.platform}`, { price_usd: e.price_usd })
      // Snapshot price_usd is identical across platforms for the same ticker on
      // the same date, so first one wins.
      if (!tickerToPriceUsd.has(e.ticker)) {
        tickerToPriceUsd.set(e.ticker, e.price_usd)
      }
    }
  }
  return { byTickerPlatform, tickerToPriceUsd, fallbackUsdTry }
}

export interface DailyReturnLookups {
  /** False when there's no previous snapshot to diff against. */
  available: boolean
  prevValueByTicker: Map<string, number>
  prevValueByTickerPlatform: Map<string, number>
  investedByAsset: Map<string, number>
  investedByAssetPlatform: Map<string, number>
}

/**
 * The baseline for daily return = the most recent snapshot dated strictly
 * *before* today (home timezone). NOT `snapshots[length-2]`: before today's
 * snapshot is written, the last row is yesterday and `length-2` would silently
 * jump the baseline back a day. Picking by date is robust to that and to gaps
 * (a missed cron day just means the baseline is >1 day old — we still show the
 * delta). Assumes nothing about array order. `undefined` when none predates today.
 */
function pickBaselineSnapshot(
  snapshots: Snapshot[],
  today: string,
): Snapshot | undefined {
  let baseline: Snapshot | undefined
  for (const s of snapshots) {
    if (
      s.snapshot_date < today &&
      (!baseline || s.snapshot_date > baseline.snapshot_date)
    ) {
      baseline = s
    }
  }
  return baseline
}

/**
 * Daily-return inputs derived from the *previous* snapshot. Daily return is
 * ΔP&L over the day = current value − previous-snapshot value − cash deployed
 * since then (`computeCurrentInvestedUsd` over the period's txs) — the canonical
 * money-weighted Total P&L (lib/pnl/totals.ts) applied across one day, so it
 * captures fiat FX too. We read the previous snapshot's *frozen* value_usd: the
 * frozen value IS "yesterday's close," exactly the baseline we want.
 *
 * `today` is the home-local calendar day (homeDayIso()); both the baseline
 * selection and the period-tx cutoff use home-local dates so a tx and a
 * snapshot are bucketed by the same day (a 21:00-UTC tx is "tomorrow" in
 * Istanbul and belongs to the period, not the baseline).
 */
export function buildDailyReturnLookups(
  snapshots: Snapshot[],
  transactions: Transaction[],
  rates: ExchangeRate[],
  today: string,
): DailyReturnLookups {
  const prev = pickBaselineSnapshot(snapshots, today)
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

    // Net cash deployed strictly AFTER the baseline's day — compared in
    // home-local dates so the cutoff matches the (home-local) snapshot_date.
    // Bucket once, then sum net invested per asset and per (asset, platform).
    const prevDate = prev.snapshot_date
    const txByAsset = new Map<string, Transaction[]>()
    const txByAssetPlatform = new Map<string, Transaction[]>()
    for (const tx of transactions) {
      if (homeDayIso(new Date(tx.date)) <= prevDate) continue
      const a = txByAsset.get(tx.asset_id) ?? []
      a.push(tx)
      txByAsset.set(tx.asset_id, a)
      const k = `${tx.asset_id}|${tx.platform_id}`
      const ap = txByAssetPlatform.get(k) ?? []
      ap.push(tx)
      txByAssetPlatform.set(k, ap)
    }
    for (const [id, txs] of txByAsset) {
      investedByAsset.set(id, computeCurrentInvestedUsd(txs, rates))
    }
    for (const [k, txs] of txByAssetPlatform) {
      investedByAssetPlatform.set(k, computeCurrentInvestedUsd(txs, rates))
    }
  }

  return {
    available,
    prevValueByTicker,
    prevValueByTickerPlatform,
    investedByAsset,
    investedByAssetPlatform,
  }
}

// ─── Per-asset enrichment ───────────────────────────────────────────

interface EnrichAssetContext {
  prices: Record<string, PriceCache>
  pnlMap: Map<string, AssetPnL>
  holdingsByAsset: Map<string, HoldingWithDetails[]>
  snapshotLookups: SnapshotLookups
  dailyReturnLookups: DailyReturnLookups
  /** Portfolio total value (BigNumber) — the allocation-% denominator. */
  totalValue: BigNumber
}

/**
 * Build the view-model row for one asset: rolls its per-platform holdings up to
 * an asset-level value (snapshot price × live balance), joins FIFO P&L, and
 * attaches the money-weighted daily return.
 */
export function enrichAsset(
  asset: Asset,
  ctx: EnrichAssetContext,
): EnrichedAsset {
  const {
    prices,
    pnlMap,
    holdingsByAsset,
    snapshotLookups,
    dailyReturnLookups,
    totalValue,
  } = ctx

  const livePrice: PriceCache | undefined = prices[asset.price_id ?? asset.ticker]
  const liveBnPriceUsd = bn(livePrice?.price_usd)

  const assetHoldings = holdingsByAsset.get(asset.id) ?? []
  // Match snapshot semantics (`balance <= 0` skipped) so the platform-grouped
  // view never renders empty positions and rollups stay Dashboard-consistent.
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

  // Prefer the snapshot's per-ticker price, fall back to live for assets the
  // snapshot doesn't yet cover. Value = balance × price tracks live quantity
  // changes while keeping the snapshot authoritative for prices.
  const snapshotPriceUsd = snapshotLookups.tickerToPriceUsd.get(asset.ticker)
  const currentPriceUsd =
    snapshotPriceUsd != null ? bn(snapshotPriceUsd) : liveBnPriceUsd
  const currentPriceTry = currentPriceUsd.times(bn(snapshotLookups.fallbackUsdTry))
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
}

export interface BuildEnrichedAssetsContext {
  holdings: HoldingWithDetails[]
  prices: Record<string, PriceCache>
  assetPnLs: AssetPnL[]
  totalCurrentValueUsd: BigNumber
  snapshotLookups: SnapshotLookups
  dailyReturnLookups: DailyReturnLookups
}

/** Enrich every active asset, dropping zero-balance positions. */
export function buildEnrichedAssets(
  activeAssets: Asset[],
  ctx: BuildEnrichedAssetsContext,
): EnrichedAsset[] {
  const {
    holdings,
    prices,
    assetPnLs,
    totalCurrentValueUsd,
    snapshotLookups,
    dailyReturnLookups,
  } = ctx

  const pnlMap = new Map<string, AssetPnL>()
  for (const pnl of assetPnLs) pnlMap.set(pnl.assetId, pnl)

  const holdingsByAsset = new Map<string, HoldingWithDetails[]>()
  for (const h of holdings) {
    const existing = holdingsByAsset.get(h.asset_id)
    if (existing) existing.push(h)
    else holdingsByAsset.set(h.asset_id, [h])
  }

  const totalValue = bn(totalCurrentValueUsd)

  return activeAssets
    .map((asset) =>
      enrichAsset(asset, {
        prices,
        pnlMap,
        holdingsByAsset,
        snapshotLookups,
        dailyReturnLookups,
        totalValue,
      }),
    )
    .filter((asset) => asset.totalBalance > 0)
}

// ─── Filter / sort ──────────────────────────────────────────────────

export function filterAssetsBySearch(
  assets: EnrichedAsset[],
  search: string,
): EnrichedAsset[] {
  if (!search.trim()) return assets
  const q = search.toLowerCase()
  return assets.filter(
    (a) =>
      a.name.toLowerCase().includes(q) || a.ticker.toLowerCase().includes(q),
  )
}

export function sortAssets(
  assets: EnrichedAsset[],
  sortBy: SortBy,
): EnrichedAsset[] {
  const sorted = [...assets]
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
}

// ─── Grouping ───────────────────────────────────────────────────────

export interface GroupContext {
  snapshotLookups: SnapshotLookups
  dailyReturnLookups: DailyReturnLookups
  totalCurrentValueUsd: BigNumber
}

/**
 * Scope an asset row down to a single platform: each platform's *real* FIFO
 * cost basis / value / unrealized P&L (from usePnL's `holdingPnLs`), not a
 * blended asset-wide average smeared by quantity. `allocationPct` is left at 0
 * here and filled in by the group rollup against the portfolio total.
 */
function scopeAssetToPlatform(
  asset: EnrichedAsset,
  holding: EnrichedAsset["holdings"][number],
  holdingPnLByKey: Map<string, HoldingPnL>,
  snapshotLookups: SnapshotLookups,
  dailyReturnLookups: DailyReturnLookups,
): EnrichedAsset {
  // Fallback (should not happen — same holdings set drives both) values the
  // position at the asset's snapshot price with zero cost basis.
  const hp = holdingPnLByKey.get(`${asset.id}|${holding.platformId}`)
  const platformValueUsdBn = hp
    ? hp.currentValueUsd
    : bn(holding.balance).times(bn(asset.currentPriceUsd))
  const platformCostBasisBn = hp ? hp.costBasisUsd : BN_ZERO
  const platformUnrealizedBn = hp
    ? hp.unrealizedPnlUsd
    : platformValueUsdBn.minus(platformCostBasisBn)
  const platformValueTryBn = platformValueUsdBn.times(
    bn(snapshotLookups.fallbackUsdTry),
  )

  const platformDaily = dailyReturnLookups.available
    ? computeDailyReturn({
        currentValueUsd: platformValueUsdBn,
        prevValueUsd: bn(
          dailyReturnLookups.prevValueByTickerPlatform.get(
            `${asset.ticker}|${holding.platformName}`,
          ) ?? 0,
        ),
        periodInvestedUsd: bn(
          dailyReturnLookups.investedByAssetPlatform.get(
            `${asset.id}|${holding.platformId}`,
          ) ?? 0,
        ),
      })
    : null

  return {
    ...asset,
    totalBalance: holding.balance,
    holdings: [holding],
    currentValueUsd: platformValueUsdBn.toNumber(),
    currentValueTry: platformValueTryBn.toNumber(),
    costBasisUsd: platformCostBasisBn.toNumber(),
    unrealizedPnlUsd: platformUnrealizedBn.toNumber(),
    unrealizedPnlPct: platformCostBasisBn.gt(0)
      ? platformUnrealizedBn.div(platformCostBasisBn).times(100).toNumber()
      : 0,
    allocationPct: 0,
    dailyReturnUsd: platformDaily ? platformDaily.dailyReturnUsd.toNumber() : 0,
    dailyReturnPct:
      platformDaily && platformDaily.dailyReturnPct !== null
        ? platformDaily.dailyReturnPct.toNumber()
        : null,
    dailyDenomUsd: platformDaily ? platformDaily.denomUsd.toNumber() : 0,
  }
}

/**
 * Sum a group's member assets into an `AssetGroup`. Group daily % is taken on
 * the summed denominators (prev value + period invested), matching the
 * money-weighted per-asset definition.
 */
function rollupGroup(opts: {
  key: string
  label: string
  color?: string
  assets: EnrichedAsset[]
  dailyAvailable: boolean
}): AssetGroup {
  const { key, label, color, assets, dailyAvailable } = opts
  let totalValueUsdBn = BN_ZERO
  let totalValueTryBn = BN_ZERO
  let totalPnlUsdBn = BN_ZERO
  let dailyReturnUsdBn = BN_ZERO
  let dailyDenomUsdBn = BN_ZERO
  for (const a of assets) {
    totalValueUsdBn = totalValueUsdBn.plus(bn(a.currentValueUsd))
    totalValueTryBn = totalValueTryBn.plus(bn(a.currentValueTry))
    totalPnlUsdBn = totalPnlUsdBn.plus(bn(a.unrealizedPnlUsd))
    dailyReturnUsdBn = dailyReturnUsdBn.plus(bn(a.dailyReturnUsd))
    dailyDenomUsdBn = dailyDenomUsdBn.plus(bn(a.dailyDenomUsd))
  }
  const groupDailyPct = dailyAvailable
    ? dailyReturnPct(dailyReturnUsdBn, dailyDenomUsdBn)
    : null
  return {
    key,
    label,
    color,
    assets,
    totalValueUsd: totalValueUsdBn.toNumber(),
    totalValueTry: totalValueTryBn.toNumber(),
    totalPnlUsd: totalPnlUsdBn.toNumber(),
    dailyReturnUsd: dailyAvailable ? dailyReturnUsdBn.toNumber() : 0,
    dailyReturnPct: groupDailyPct !== null ? groupDailyPct.toNumber() : null,
  }
}

const byValueDesc = (a: AssetGroup, b: AssetGroup) =>
  b.totalValueUsd - a.totalValueUsd

function groupByPlatform(
  sortedAssets: EnrichedAsset[],
  holdingPnLs: HoldingPnL[],
  ctx: GroupContext,
): AssetGroup[] {
  const { snapshotLookups, dailyReturnLookups, totalCurrentValueUsd } = ctx

  // Real per-(asset, platform) FIFO P&L from usePnL, keyed for O(1) lookup.
  const holdingPnLByKey = new Map<string, HoldingPnL>()
  for (const hp of holdingPnLs) {
    holdingPnLByKey.set(`${hp.assetId}|${hp.platformId}`, hp)
  }

  const map = new Map<string, EnrichedAsset[]>()
  const platformMeta = new Map<string, { name: string; color: string }>()
  for (const asset of sortedAssets) {
    for (const h of asset.holdings) {
      const key = h.platformId
      if (!platformMeta.has(key)) {
        platformMeta.set(key, { name: h.platformName, color: h.platformColor })
      }
      const scoped = scopeAssetToPlatform(
        asset,
        h,
        holdingPnLByKey,
        snapshotLookups,
        dailyReturnLookups,
      )
      const existing = map.get(key) ?? []
      existing.push(scoped)
      map.set(key, existing)
    }
  }

  const totalValue = bn(totalCurrentValueUsd)
  const result: AssetGroup[] = []
  for (const [key, groupAssets] of map) {
    // Platform-scoped rows are fresh objects, so fill in their allocation here.
    for (const a of groupAssets) {
      a.allocationPct = totalValue.isZero()
        ? 0
        : bn(a.currentValueUsd).div(totalValue).times(100).toNumber()
    }
    const meta = platformMeta.get(key)!
    result.push(
      rollupGroup({
        key,
        label: meta.name,
        color: meta.color,
        assets: groupAssets,
        dailyAvailable: dailyReturnLookups.available,
      }),
    )
  }
  return result.sort(byValueDesc)
}

function groupByTag(
  sortedAssets: EnrichedAsset[],
  ctx: GroupContext,
): AssetGroup[] {
  const { dailyReturnLookups } = ctx
  const tagToAssetIds = new Map<string, Set<string>>()
  const assetById = new Map<string, EnrichedAsset>()

  for (const asset of sortedAssets) {
    assetById.set(asset.id, asset)
    const tags = asset.tags.length > 0 ? asset.tags : ["Other"]
    for (const tag of tags) {
      const existing = tagToAssetIds.get(tag) ?? new Set<string>()
      existing.add(asset.id)
      tagToAssetIds.set(tag, existing)
    }
  }

  const result: AssetGroup[] = []
  for (const [key, assetIds] of tagToAssetIds) {
    const groupAssets = [...assetIds]
      .map((id) => assetById.get(id)!)
      .filter(Boolean)
    result.push(
      rollupGroup({
        key,
        label: key,
        assets: groupAssets,
        dailyAvailable: dailyReturnLookups.available,
      }),
    )
  }
  return result.sort(byValueDesc)
}

function groupByCategory(
  sortedAssets: EnrichedAsset[],
  ctx: GroupContext,
): AssetGroup[] {
  const { dailyReturnLookups } = ctx
  const map = new Map<string, EnrichedAsset[]>()
  for (const asset of sortedAssets) {
    const existing = map.get(asset.category) ?? []
    existing.push(asset)
    map.set(asset.category, existing)
  }

  const result: AssetGroup[] = []
  for (const [key, groupAssets] of map) {
    result.push(
      rollupGroup({
        key,
        label: CATEGORY_LABELS[key] ?? key,
        assets: groupAssets,
        dailyAvailable: dailyReturnLookups.available,
      }),
    )
  }
  return result.sort(byValueDesc)
}

/** Group enriched assets by the selected dimension into sorted `AssetGroup`s. */
export function groupAssets(
  groupBy: GroupBy,
  sortedAssets: EnrichedAsset[],
  holdingPnLs: HoldingPnL[],
  ctx: GroupContext,
): AssetGroup[] {
  switch (groupBy) {
    case "platform":
      return groupByPlatform(sortedAssets, holdingPnLs, ctx)
    case "tag":
      return groupByTag(sortedAssets, ctx)
    case "category":
      return groupByCategory(sortedAssets, ctx)
  }
}
