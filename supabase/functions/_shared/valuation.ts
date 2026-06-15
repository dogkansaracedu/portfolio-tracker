import { STALE_PRICE_MS } from "./constants.ts"

export interface HoldingRow {
  user_id: string
  balance: number
  assets: {
    ticker: string
    price_id: string | null
    name: string
    category: string
    tags: string[] | null
    is_active: boolean
  } | null
  platforms: { name: string; color: string } | null
}

export interface PriceRow {
  ticker: string
  price_usd: number | null
  price_try: number | null
  updated_at: string | null
}

export interface Rates {
  usdTry: number
  eurTry: number
  goldGramTry: number
}

export interface AssetEntry {
  ticker: string
  name: string
  platform: string
  amount: number
  price_usd: number
  value_usd: number
  value_try: number
  /** True when the price_cache row existed but was older than STALE_PRICE_MS,
   *  so it was treated as unpriced. Used only to label the skip message. */
  stale: boolean
}

export interface ValuationResult {
  totalUsd: number
  totalTry: number
  byAsset: AssetEntry[]
  byCategory: Record<string, { usd: number; try: number; pct: number }>
  byPlatform: Record<string, { usd: number; try: number; color: string; pct: number }>
  byTag: Record<string, { usd: number; try: number; pct: number }>
  /** Held assets (amount > 0) with a non-positive/stale price. Callers decide
   *  whether to skip the whole snapshot (daily) or just this hour (intraday). */
  unpriced: AssetEntry[]
}

/**
 * Value one user's holdings against the current prices/rates. Pure (no IO).
 * Shared by take-snapshots (uses the full breakdown) and take-intraday-snapshots
 * (uses only the totals) so the per-user aggregation lives in exactly one place.
 * A stale price_cache row (older than STALE_PRICE_MS) is zeroed so it trips the
 * `unpriced` filter rather than booking an old price as today's value.
 */
export function valueHoldings(
  userHoldings: HoldingRow[],
  prices: Record<string, PriceRow>,
  rates: Rates,
  nowMs: number,
): ValuationResult {
  const byAsset: AssetEntry[] = []
  const categoryTotals: Record<string, { usd: number; try_val: number }> = {}
  const platformTotals: Record<string, { usd: number; try_val: number; color: string }> = {}
  const tagTotals: Record<string, { usd: number; try_val: number }> = {}
  let totalUsd = 0
  let totalTry = 0

  for (const h of userHoldings) {
    const asset = h.assets!
    const platform = h.platforms!
    // price_cache is keyed by price_id (the fetch key); fall back to ticker
    // until rows are backfilled.
    const price = prices[asset.price_id ?? asset.ticker]
    const updatedAt = price?.updated_at
    const stale =
      updatedAt != null && nowMs - new Date(updatedAt).getTime() > STALE_PRICE_MS
    const priceUsd = stale ? 0 : price?.price_usd ?? 0
    const priceTry = stale ? 0 : price?.price_try ?? priceUsd * rates.usdTry

    const valueUsd = h.balance * priceUsd
    const valueTry = h.balance * priceTry

    totalUsd += valueUsd
    totalTry += valueTry

    byAsset.push({
      ticker: asset.ticker,
      name: asset.name,
      platform: platform.name,
      amount: h.balance,
      price_usd: priceUsd,
      value_usd: valueUsd,
      value_try: valueTry,
      stale,
    })

    const cat = asset.category
    if (!categoryTotals[cat]) categoryTotals[cat] = { usd: 0, try_val: 0 }
    categoryTotals[cat].usd += valueUsd
    categoryTotals[cat].try_val += valueTry

    const plat = platform.name
    if (!platformTotals[plat]) {
      platformTotals[plat] = { usd: 0, try_val: 0, color: platform.color }
    }
    platformTotals[plat].usd += valueUsd
    platformTotals[plat].try_val += valueTry

    for (const tag of asset.tags ?? []) {
      if (!tagTotals[tag]) tagTotals[tag] = { usd: 0, try_val: 0 }
      tagTotals[tag].usd += valueUsd
      tagTotals[tag].try_val += valueTry
    }
  }

  const safeDiv = (n: number) => (totalUsd > 0 ? (n / totalUsd) * 100 : 0)

  const byCategory: Record<string, { usd: number; try: number; pct: number }> = {}
  for (const [k, v] of Object.entries(categoryTotals)) {
    byCategory[k] = { usd: v.usd, try: v.try_val, pct: safeDiv(v.usd) }
  }
  const byPlatform: Record<string, { usd: number; try: number; color: string; pct: number }> = {}
  for (const [k, v] of Object.entries(platformTotals)) {
    byPlatform[k] = { usd: v.usd, try: v.try_val, color: v.color, pct: safeDiv(v.usd) }
  }
  const byTag: Record<string, { usd: number; try: number; pct: number }> = {}
  for (const [k, v] of Object.entries(tagTotals)) {
    byTag[k] = { usd: v.usd, try: v.try_val, pct: safeDiv(v.usd) }
  }

  const unpriced = byAsset.filter((a) => a.amount > 0 && a.price_usd <= 0)

  return { totalUsd, totalTry, byAsset, byCategory, byPlatform, byTag, unpriced }
}
