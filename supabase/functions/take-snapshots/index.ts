import { getServiceClient } from "../_shared/client.ts"
import { corsHeaders } from "../_shared/cors.ts"

interface HoldingRow {
  user_id: string
  balance: number
  assets: {
    ticker: string
    name: string
    category: string
    tags: string[] | null
    is_active: boolean
  } | null
  platforms: { name: string; color: string } | null
}

interface PriceRow {
  ticker: string
  price_usd: number | null
  price_try: number | null
}

interface RateRow {
  usd_try: number | null
  eur_try: number | null
  gold_gram_try: number | null
}

interface CategoryAgg {
  usd: number
  try_val: number
}

interface PlatformAgg {
  usd: number
  try_val: number
  color: string
}

interface TagAgg {
  usd: number
  try_val: number
}

interface AssetEntry {
  ticker: string
  name: string
  platform: string
  amount: number
  price_usd: number
  value_usd: number
  value_try: number
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin")

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(origin) })
  }

  const expectedToken = Deno.env.get("CRON_TOKEN")
  const providedToken = req.headers.get("X-Cron-Token")

  if (!expectedToken || providedToken !== expectedToken) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: {
        ...corsHeaders(origin),
        "Content-Type": "application/json",
      },
    })
  }

  const supabase = getServiceClient()

  const today = new Date().toISOString().slice(0, 10)
  const errors: string[] = []
  let usersProcessed = 0
  let snapshotsWritten = 0

  // ── Load shared data once ──────────────────────────────────────────
  const { data: priceRows, error: priceErr } = await supabase
    .from("price_cache")
    .select("ticker, price_usd, price_try")

  if (priceErr) {
    return new Response(
      JSON.stringify({ error: `price_cache: ${priceErr.message}` }),
      { status: 500, headers: { ...corsHeaders(origin), "Content-Type": "application/json" } }
    )
  }

  const prices: Record<string, PriceRow> = {}
  for (const p of (priceRows ?? []) as PriceRow[]) {
    prices[p.ticker] = p
  }

  const { data: rateRow } = await supabase
    .from("exchange_rates")
    .select("usd_try, eur_try, gold_gram_try")
    .order("date", { ascending: false })
    .limit(1)
    .maybeSingle()

  const rates: RateRow = (rateRow as RateRow | null) ?? {
    usd_try: null,
    eur_try: null,
    gold_gram_try: null,
  }
  const usdTry = rates.usd_try ?? 1
  const eurTry = rates.eur_try ?? 0
  const goldGramTry = rates.gold_gram_try ?? 0

  // ── Load all holdings across all users in one shot ─────────────────
  const { data: holdingRows, error: holdingsErr } = await supabase
    .from("holdings")
    .select(
      "user_id, balance, assets(ticker, name, category, tags, is_active), platforms(name, color)"
    )
    .neq("balance", 0)

  if (holdingsErr) {
    return new Response(
      JSON.stringify({ error: `holdings: ${holdingsErr.message}` }),
      { status: 500, headers: { ...corsHeaders(origin), "Content-Type": "application/json" } }
    )
  }

  const holdings = (holdingRows ?? []) as unknown as HoldingRow[]

  // Group by user_id
  const byUser = new Map<string, HoldingRow[]>()
  for (const h of holdings) {
    if (!h.assets || !h.platforms) continue
    if (!h.assets.is_active) continue
    if (h.balance <= 0) continue
    const arr = byUser.get(h.user_id) ?? []
    arr.push(h)
    byUser.set(h.user_id, arr)
  }

  // ── Build & upsert one snapshot per user ───────────────────────────
  const snapshotInserts: Array<{
    user_id: string
    snapshot_date: string
    total_usd: number
    total_try: number
    breakdown: unknown
  }> = []

  for (const [userId, userHoldings] of byUser) {
    const byAsset: AssetEntry[] = []
    const categoryTotals: Record<string, CategoryAgg> = {}
    const platformTotals: Record<string, PlatformAgg> = {}
    const tagTotals: Record<string, TagAgg> = {}
    let totalUsd = 0
    let totalTry = 0

    for (const h of userHoldings) {
      const asset = h.assets!
      const platform = h.platforms!
      const price = prices[asset.ticker]
      const priceUsd = price?.price_usd ?? 0
      const priceTry = price?.price_try ?? priceUsd * usdTry

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

    const byPlatform: Record<
      string,
      { usd: number; try: number; color: string; pct: number }
    > = {}
    for (const [k, v] of Object.entries(platformTotals)) {
      byPlatform[k] = {
        usd: v.usd,
        try: v.try_val,
        color: v.color,
        pct: safeDiv(v.usd),
      }
    }

    const byTag: Record<string, { usd: number; try: number; pct: number }> = {}
    for (const [k, v] of Object.entries(tagTotals)) {
      byTag[k] = { usd: v.usd, try: v.try_val, pct: safeDiv(v.usd) }
    }

    // Skip the snapshot if any held asset is unpriced. The cron writes once
    // per day; without this guard a stale price_cache (e.g. an upstream API
    // 4xx during the 23:55 UTC run) silently encodes a wrong total that the
    // dashboard then trusts indefinitely. This is exactly how the
    // 2026-04-09 orphan was created — the cash holding had no price-cache
    // entry yet so it dropped out of the totals. Honest answer: skip.
    const unpriced = byAsset.filter((a) => a.amount > 0 && a.price_usd <= 0)
    if (unpriced.length > 0) {
      errors.push(
        `user ${userId}: skipped — ${unpriced.length} unpriced holding(s): ${unpriced
          .map((a) => a.ticker)
          .join(", ")}`,
      )
      continue
    }

    snapshotInserts.push({
      user_id: userId,
      snapshot_date: today,
      total_usd: totalUsd,
      total_try: totalTry,
      breakdown: {
        rates: { usd_try: usdTry, eur_try: eurTry, gold_gram_try: goldGramTry },
        by_category: byCategory,
        by_platform: byPlatform,
        by_tag: byTag,
        by_asset: byAsset,
      },
    })
    usersProcessed++
  }

  if (snapshotInserts.length > 0) {
    const { error: upsertErr, data: upserted } = await supabase
      .from("snapshots")
      .upsert(snapshotInserts, { onConflict: "user_id,snapshot_date" })
      .select("id")

    if (upsertErr) {
      errors.push(`snapshots upsert: ${upsertErr.message}`)
    } else {
      snapshotsWritten = upserted?.length ?? 0
    }
  }

  return new Response(
    JSON.stringify({
      date: today,
      users: usersProcessed,
      snapshots: snapshotsWritten,
      errors: errors.length > 0 ? errors : undefined,
      timestamp: new Date().toISOString(),
    }),
    { headers: { ...corsHeaders(origin), "Content-Type": "application/json" } }
  )
})
