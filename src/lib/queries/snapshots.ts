import BigNumber from "bignumber.js"
import { bn, BN_ZERO, BN_HUNDRED, homeDayIso } from "@/lib/config"
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
  // Stamp the snapshot in the portfolio's home timezone (not UTC) so its
  // calendar day matches the user's local day and the dashboard/performance
  // local-date logic — otherwise an early-Turkey-morning snapshot books a day
  // behind. Matches the edge function (take-snapshots).
  const today = homeDayIso()

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
  const platformTotals: Record<
    string,
    { usd: BigNumber; try_val: BigNumber; color: string }
  > = {}
  const tagTotals: Record<string, { usd: BigNumber; try_val: BigNumber }> = {}
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
      value_try: valueTry.toNumber(),
    })

    // Category aggregation (mutually exclusive)
    const cat = h.assets.category
    if (!categoryTotals[cat]) categoryTotals[cat] = { usd: BN_ZERO, try_val: BN_ZERO }
    categoryTotals[cat].usd = categoryTotals[cat].usd.plus(valueUsd)
    categoryTotals[cat].try_val = categoryTotals[cat].try_val.plus(valueTry)

    // Platform aggregation
    const plat = h.platforms.name
    if (!platformTotals[plat]) {
      platformTotals[plat] = {
        usd: BN_ZERO,
        try_val: BN_ZERO,
        color: h.platforms.color,
      }
    }
    platformTotals[plat].usd = platformTotals[plat].usd.plus(valueUsd)
    platformTotals[plat].try_val = platformTotals[plat].try_val.plus(valueTry)

    // Tag aggregation (allows overlap)
    for (const tag of (h.assets.tags ?? [])) {
      if (!tagTotals[tag]) tagTotals[tag] = { usd: BN_ZERO, try_val: BN_ZERO }
      tagTotals[tag].usd = tagTotals[tag].usd.plus(valueUsd)
      tagTotals[tag].try_val = tagTotals[tag].try_val.plus(valueTry)
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
      try: vals.try_val.toNumber(),
      color: vals.color,
      pct: totalUsd.isGreaterThan(0)
        ? vals.usd.div(totalUsd).times(BN_HUNDRED).toNumber()
        : 0,
    }
  }

  const byTag: SnapshotBreakdown["by_tag"] = {}
  for (const [name, vals] of Object.entries(tagTotals)) {
    byTag[name] = {
      usd: vals.usd.toNumber(),
      try: vals.try_val.toNumber(),
      pct: totalUsd.isGreaterThan(0)
        ? vals.usd.div(totalUsd).times(BN_HUNDRED).toNumber()
        : 0,
    }
  }

  // Refuse to write a snapshot when any held asset is unpriced. Since the
  // dashboard now reads exclusively from the latest snapshot, a partial
  // write here silently shows a smaller portfolio total — the same shape
  // of bug that produced the 2026-04-09 orphan. Better to surface the
  // failure to the caller; the auto-refresh path catches the throw and
  // logs, the manual "Take Snapshot" button toasts.
  const unpriced = byAsset.filter(
    (a) => a.amount > 0 && (!Number.isFinite(a.price_usd) || a.price_usd <= 0),
  )
  if (unpriced.length > 0) {
    throw new Error(
      `Snapshot skipped — ${unpriced.length} unpriced holding(s): ${unpriced
        .map((a) => a.ticker)
        .join(", ")}. Refresh prices and try again.`,
    )
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

  // Top-level numeric columns are written as strings (BigNumber.toFixed)
  // so the Postgres `numeric` type retains full precision. JSONB breakdown
  // values stay as JS Number — JSON has no lossless numeric type, and
  // aggregate USD/TRY values fit comfortably in double precision.
  const insert: SnapshotInsert = {
    user_id: userId,
    snapshot_date: today,
    total_usd: totalUsd.toFixed(),
    total_try: totalTry.toFixed(),
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

// ─── Backfill Edge Function ─────────────────────────────────────────

export type BackfillGranularity = "monthly" | "tx_dates"

export interface BackfillOptions {
  granularity: BackfillGranularity
  overwrite: boolean
}

export interface BackfillResult {
  target_dates: string[]
  target_count: number
  snapshots_written: number
  tickers_priced: string[]
  sample: Array<{ date: string; total_usd: number; total_try: number }>
  errors?: string[]
  timestamp: string
}

/**
 * Trigger the `backfill-snapshots` Edge Function. Generates one snapshot
 * per target date (every month-start since the earliest transaction, or
 * one per transaction date) by replaying transactions and pulling
 * historical prices from CoinGecko / Yahoo Finance.
 *
 * Long-running: typically 30–90 seconds depending on the number of
 * unique tickers. Optionally overwrites existing snapshots in the
 * targeted (user, date) range.
 */
export async function triggerBackfillSnapshots(
  opts: BackfillOptions,
): Promise<BackfillResult> {
  const { data, error } = await supabase.functions.invoke<BackfillResult>(
    "backfill-snapshots",
    { body: opts },
  )
  if (error) {
    // FunctionsHttpError carries the Response in error.context. Surface its
    // body so we don't leave the user staring at "non-2xx status code" with
    // no clue what actually broke.
    const ctx = (error as { context?: Response }).context
    if (ctx && typeof ctx.text === "function") {
      try {
        const body = await ctx.text()
        if (body) {
          let parsed = body
          try {
            const json = JSON.parse(body)
            parsed = json.error ?? json.message ?? body
          } catch {
            // body wasn't JSON — use raw text
          }
          throw new Error(`${error.message}: ${parsed}`)
        }
      } catch (extractErr) {
        if (extractErr instanceof Error && extractErr.message !== error.message) {
          throw extractErr
        }
      }
    }
    throw error
  }
  if (!data) throw new Error("backfill-snapshots returned no data")
  return data
}
