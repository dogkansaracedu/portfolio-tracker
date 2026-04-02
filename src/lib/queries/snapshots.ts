import BigNumber from "bignumber.js"
import { bn, BN_ZERO, BN_HUNDRED } from "@/lib/config"
import { supabase } from "@/lib/supabase"
import type {
  Snapshot,
  SnapshotInsert,
  SnapshotBreakdown,
  Holding,
  PriceCache,
  ExchangeRate,
} from "@/types/database"

export async function fetchSnapshots(userId: string): Promise<Snapshot[]> {
  const { data, error } = await supabase
    .from("snapshots")
    .select("*")
    .eq("user_id", userId)
    .order("snapshot_date", { ascending: true })

  if (error) throw error
  return data ?? []
}

export async function deleteSnapshot(id: string): Promise<void> {
  const { error } = await supabase.from("snapshots").delete().eq("id", id)
  if (error) throw error
}

interface HoldingWithJoins extends Holding {
  assets: { name: string; ticker: string; category: string; tags: string[]; is_active: boolean }
  platforms: { name: string; color: string }
}

/**
 * Generate and save a snapshot of the current portfolio state.
 * Reads from holdings + assets + platforms instead of a flat asset list.
 */
export async function createSnapshot(
  userId: string,
  prices: Record<string, PriceCache>,
  latestRates: ExchangeRate | null,
): Promise<Snapshot> {
  const today = new Date().toISOString().slice(0, 10)

  const { data: holdings, error: holdingsError } = await supabase
    .from("holdings")
    .select("*, assets(name, ticker, category, tags, is_active), platforms(name, color)")
    .eq("user_id", userId)
    .neq("balance", 0)

  if (holdingsError) throw holdingsError

  const rows = (holdings ?? []) as unknown as HoldingWithJoins[]

  const usdTry = bn(latestRates?.usd_try ?? 1)
  const eurTry = bn(latestRates?.eur_try ?? 1)
  const goldGramTry = bn(latestRates?.gold_gram_try ?? 0)

  const byAsset: SnapshotBreakdown["by_asset"] = []
  const categoryTotals: Record<string, { usd: BigNumber; try_val: BigNumber }> = {}
  const platformTotals: Record<string, { usd: BigNumber }> = {}
  const tagTotals: Record<string, { usd: BigNumber }> = {}
  let totalUsd = BN_ZERO
  let totalTry = BN_ZERO

  for (const h of rows) {
    if (!h.assets.is_active || h.balance <= 0) continue

    const price = prices[h.assets.ticker]
    const priceUsd = bn(price?.price_usd)
    const priceTry = price?.price_try != null
      ? bn(price.price_try)
      : priceUsd.times(usdTry)

    const valueUsd = bn(h.balance).times(priceUsd)
    const valueTry = bn(h.balance).times(priceTry)

    totalUsd = totalUsd.plus(valueUsd)
    totalTry = totalTry.plus(valueTry)

    byAsset.push({
      ticker: h.assets.ticker,
      name: h.assets.name,
      platform: h.platforms.name,
      amount: h.balance,
      price_usd: priceUsd.toNumber(),
      value_usd: valueUsd.toNumber(),
    })

    // Category aggregation (mutually exclusive)
    const cat = h.assets.category
    if (!categoryTotals[cat]) categoryTotals[cat] = { usd: BN_ZERO, try_val: BN_ZERO }
    categoryTotals[cat].usd = categoryTotals[cat].usd.plus(valueUsd)
    categoryTotals[cat].try_val = categoryTotals[cat].try_val.plus(valueTry)

    // Platform aggregation
    const plat = h.platforms.name
    if (!platformTotals[plat]) platformTotals[plat] = { usd: BN_ZERO }
    platformTotals[plat].usd = platformTotals[plat].usd.plus(valueUsd)

    // Tag aggregation (allows overlap)
    for (const tag of (h.assets.tags ?? [])) {
      if (!tagTotals[tag]) tagTotals[tag] = { usd: BN_ZERO }
      tagTotals[tag].usd = tagTotals[tag].usd.plus(valueUsd)
    }
  }

  const byCategory: SnapshotBreakdown["by_category"] = {}
  for (const [cat, vals] of Object.entries(categoryTotals)) {
    byCategory[cat] = {
      usd: vals.usd.toNumber(),
      try: vals.try_val.toNumber(),
      pct: totalUsd.isGreaterThan(0)
        ? vals.usd.div(totalUsd).times(BN_HUNDRED).toNumber()
        : 0,
    }
  }

  const byPlatform: SnapshotBreakdown["by_platform"] = {}
  for (const [name, vals] of Object.entries(platformTotals)) {
    byPlatform[name] = {
      usd: vals.usd.toNumber(),
      pct: totalUsd.isGreaterThan(0)
        ? vals.usd.div(totalUsd).times(BN_HUNDRED).toNumber()
        : 0,
    }
  }

  const byTag: SnapshotBreakdown["by_tag"] = {}
  for (const [name, vals] of Object.entries(tagTotals)) {
    byTag[name] = {
      usd: vals.usd.toNumber(),
      pct: totalUsd.isGreaterThan(0)
        ? vals.usd.div(totalUsd).times(BN_HUNDRED).toNumber()
        : 0,
    }
  }

  const breakdown: SnapshotBreakdown = {
    rates: {
      usd_try: usdTry.toNumber(),
      eur_try: eurTry.toNumber(),
      gold_gram_try: goldGramTry.toNumber(),
    },
    by_category: byCategory,
    by_platform: byPlatform,
    by_tag: byTag,
    by_asset: byAsset,
  }

  const insert: SnapshotInsert = {
    user_id: userId,
    snapshot_date: today,
    total_usd: totalUsd.toNumber(),
    total_try: totalTry.toNumber(),
    breakdown,
  }

  const { data, error } = await supabase
    .from("snapshots")
    .upsert(insert, { onConflict: "user_id,snapshot_date" })
    .select()
    .single()

  if (error) throw error
  return data
}
