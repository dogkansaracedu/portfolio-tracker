import { supabase } from "@/lib/supabase"
import type {
  Snapshot,
  SnapshotInsert,
  SnapshotBreakdown,
  Asset,
  PriceCache,
  ExchangeRate,
  AssetCategory,
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

interface AssetWithPlatform extends Asset {
  platforms: { name: string; color: string }
}

/**
 * Generate and save a snapshot of the current portfolio state.
 */
export async function createSnapshot(
  userId: string,
  assets: AssetWithPlatform[],
  prices: Record<string, PriceCache>,
  latestRates: ExchangeRate | null,
): Promise<Snapshot> {
  const today = new Date().toISOString().slice(0, 10) // "YYYY-MM-DD"

  const usdTry = latestRates?.usd_try ?? 1
  const eurTry = latestRates?.eur_try ?? 1
  const goldGramTry = latestRates?.gold_gram_try ?? 0

  // Compute per-asset values
  const byAsset: SnapshotBreakdown["by_asset"] = []
  const categoryTotals: Record<string, { usd: number; try_val: number }> = {}
  const platformTotals: Record<string, { usd: number }> = {}
  let totalUsd = 0
  let totalTry = 0

  for (const asset of assets) {
    if (!asset.is_active || asset.balance <= 0) continue

    const price = prices[asset.ticker]
    const priceUsd = price?.price_usd ?? 0
    const priceTry = price?.price_try ?? priceUsd * usdTry

    const valueUsd = asset.balance * priceUsd
    const valueTry = asset.balance * priceTry

    totalUsd += valueUsd
    totalTry += valueTry

    byAsset.push({
      ticker: asset.ticker,
      name: asset.name,
      platform: asset.platforms.name,
      amount: asset.balance,
      price_usd: priceUsd,
      value_usd: valueUsd,
    })

    // Category aggregation
    const cat = asset.category
    if (!categoryTotals[cat]) categoryTotals[cat] = { usd: 0, try_val: 0 }
    categoryTotals[cat].usd += valueUsd
    categoryTotals[cat].try_val += valueTry

    // Platform aggregation
    const plat = asset.platforms.name
    if (!platformTotals[plat]) platformTotals[plat] = { usd: 0 }
    platformTotals[plat].usd += valueUsd
  }

  // Build breakdown
  const allCategories: AssetCategory[] = [
    "fiat",
    "crypto",
    "stock_bist",
    "stock_us",
    "commodity",
  ]
  const byCategory: SnapshotBreakdown["by_category"] = {} as SnapshotBreakdown["by_category"]
  for (const cat of allCategories) {
    const vals = categoryTotals[cat] ?? { usd: 0, try_val: 0 }
    byCategory[cat] = {
      usd: vals.usd,
      try: vals.try_val,
      pct: totalUsd > 0 ? (vals.usd / totalUsd) * 100 : 0,
    }
  }

  const byPlatform: SnapshotBreakdown["by_platform"] = {}
  for (const [name, vals] of Object.entries(platformTotals)) {
    byPlatform[name] = {
      usd: vals.usd,
      pct: totalUsd > 0 ? (vals.usd / totalUsd) * 100 : 0,
    }
  }

  const breakdown: SnapshotBreakdown = {
    rates: {
      usd_try: usdTry,
      eur_try: eurTry,
      gold_gram_try: goldGramTry,
    },
    by_category: byCategory,
    by_platform: byPlatform,
    by_asset: byAsset,
  }

  const insert: SnapshotInsert = {
    user_id: userId,
    snapshot_date: today,
    total_usd: totalUsd,
    total_try: totalTry,
    breakdown,
  }

  // Upsert (idempotent per date)
  const { data, error } = await supabase
    .from("snapshots")
    .upsert(insert, { onConflict: "user_id,snapshot_date" })
    .select()
    .single()

  if (error) throw error
  return data
}
