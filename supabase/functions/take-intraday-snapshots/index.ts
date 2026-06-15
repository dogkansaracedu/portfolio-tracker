import { getServiceClient } from "../_shared/client.ts"
import { corsHeaders } from "../_shared/cors.ts"
import { valueHoldings, type HoldingRow, type PriceRow } from "../_shared/valuation.ts"

const WINDOW_MS = 24 * 60 * 60 * 1000

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
      headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    })
  }

  const supabase = getServiceClient()
  const nowMs = Date.now()
  const capturedAt = new Date(nowMs).toISOString()
  const errors: string[] = []

  // ── Load shared data once ──────────────────────────────────────────
  const { data: priceRows, error: priceErr } = await supabase
    .from("price_cache")
    .select("ticker, price_usd, price_try, updated_at")
  if (priceErr) {
    return new Response(
      JSON.stringify({ error: `price_cache: ${priceErr.message}` }),
      { status: 500, headers: { ...corsHeaders(origin), "Content-Type": "application/json" } },
    )
  }
  const prices: Record<string, PriceRow> = {}
  for (const p of (priceRows ?? []) as PriceRow[]) prices[p.ticker] = p

  const { data: rateRow } = await supabase
    .from("exchange_rates")
    .select("usd_try, eur_try, gold_gram_try")
    .order("date", { ascending: false })
    .limit(1)
    .maybeSingle()
  const r = (rateRow as { usd_try: number | null; eur_try: number | null; gold_gram_try: number | null } | null)
  const rates = {
    usdTry: r?.usd_try ?? 1,
    eurTry: r?.eur_try ?? 0,
    goldGramTry: r?.gold_gram_try ?? 0,
  }

  const { data: holdingRows, error: holdingsErr } = await supabase
    .from("holdings")
    .select(
      "user_id, balance, assets(ticker, price_id, name, category, tags, is_active), platforms(name, color)",
    )
    .neq("balance", 0)
  if (holdingsErr) {
    return new Response(
      JSON.stringify({ error: `holdings: ${holdingsErr.message}` }),
      { status: 500, headers: { ...corsHeaders(origin), "Content-Type": "application/json" } },
    )
  }

  const holdings = (holdingRows ?? []) as unknown as HoldingRow[]
  const byUser = new Map<string, HoldingRow[]>()
  for (const h of holdings) {
    if (!h.assets || !h.platforms) continue
    if (!h.assets.is_active) continue
    if (h.balance <= 0) continue
    const arr = byUser.get(h.user_id) ?? []
    arr.push(h)
    byUser.set(h.user_id, arr)
  }

  // ── Value each user, totals only ───────────────────────────────────
  const inserts: Array<{
    user_id: string
    captured_at: string
    total_usd: number
    total_try: number
  }> = []
  for (const [userId, userHoldings] of byUser) {
    const v = valueHoldings(userHoldings, prices, rates, nowMs)
    // Softer than the daily writer: skip just THIS hour's row, never a date.
    // A missing intraday point is harmless for a 24h sparkline.
    if (v.unpriced.length > 0) {
      errors.push(
        `user ${userId}: skipped hour — unpriced/stale: ${v.unpriced
          .map((a) => a.ticker)
          .join(", ")}`,
      )
      continue
    }
    inserts.push({
      user_id: userId,
      captured_at: capturedAt,
      total_usd: v.totalUsd,
      total_try: v.totalTry,
    })
  }

  let written = 0
  if (inserts.length > 0) {
    const { data, error: insertErr } = await supabase
      .from("intraday_snapshots")
      .insert(inserts)
      .select("id")
    if (insertErr) errors.push(`intraday insert: ${insertErr.message}`)
    else written = data?.length ?? 0
  }

  // ── Prune the rolling 24h window ───────────────────────────────────
  const cutoff = new Date(nowMs - WINDOW_MS).toISOString()
  let pruned = 0
  const { error: pruneErr, count } = await supabase
    .from("intraday_snapshots")
    .delete({ count: "exact" })
    .lt("captured_at", cutoff)
  if (pruneErr) errors.push(`intraday prune: ${pruneErr.message}`)
  else pruned = count ?? 0

  return new Response(
    JSON.stringify({
      captured_at: capturedAt,
      written,
      pruned,
      errors: errors.length > 0 ? errors : undefined,
      timestamp: new Date().toISOString(),
    }),
    { headers: { ...corsHeaders(origin), "Content-Type": "application/json" } },
  )
})
