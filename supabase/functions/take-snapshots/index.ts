import { getServiceClient } from "../_shared/client.ts"
import { corsHeaders } from "../_shared/cors.ts"
import { HOME_TIMEZONE } from "../_shared/constants.ts"
import { valueHoldings, type HoldingRow, type PriceRow } from "../_shared/valuation.ts"

interface RateRow {
  usd_try: number | null
  eur_try: number | null
  gold_gram_try: number | null
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

  // Stamp snapshot_date in the portfolio's home timezone (not UTC) so the day
  // matches the user's local calendar and the dashboard's local-date logic.
  // HOME_TIMEZONE is shared via _shared/constants.ts (mirror of homeDayIso()
  // in src/lib/config.ts, which is a separate runtime).
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: HOME_TIMEZONE,
  }).format(new Date())
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

  const nowMs = Date.now()

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
      "user_id, balance, assets(ticker, price_id, name, category, tags, is_active), platforms(name, color)"
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
    const v = valueHoldings(
      userHoldings,
      prices,
      { usdTry, eurTry, goldGramTry },
      nowMs,
    )

    // Skip the snapshot if any held asset is unpriced OR stale. The cron writes
    // once per day; a missing/stale entry would silently encode a wrong total
    // the dashboard then trusts indefinitely (the 2026-04-09 orphan). Honest
    // answer: skip the whole date.
    if (v.unpriced.length > 0) {
      errors.push(
        `user ${userId}: skipped — ${v.unpriced.length} unpriced/stale holding(s): ${v.unpriced
          .map((a) => (a.stale ? `${a.ticker} (stale)` : a.ticker))
          .join(", ")}`,
      )
      continue
    }

    snapshotInserts.push({
      user_id: userId,
      snapshot_date: today,
      total_usd: v.totalUsd,
      total_try: v.totalTry,
      breakdown: {
        rates: { usd_try: usdTry, eur_try: eurTry, gold_gram_try: goldGramTry },
        by_category: v.byCategory,
        by_platform: v.byPlatform,
        by_tag: v.byTag,
        by_asset: v.byAsset,
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
