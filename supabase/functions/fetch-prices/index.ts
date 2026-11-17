import { getServiceClient } from "../_shared/client.ts"
import { authorizeRequest, unauthorizedResponse } from "../_shared/auth.ts"
import { corsHeaders } from "../_shared/cors.ts"
import { fetchYahooQuote } from "../_shared/yahoo.ts"
import { splitPrice } from "../_shared/currency.ts"
import { HOME_TIMEZONE, TROY_OZ_GRAMS } from "../_shared/constants.ts"
import {
  createFetchers,
  type PriceTarget,
  resolvePrices,
  SOURCE_LABEL,
  type SourceRow,
} from "../_shared/price-sources/index.ts"

// ──────────────────────────────────────────────────────────────────────
// Refresh cadences. The frontend pings this function on a fixed interval
// while a tab is visible (see PRICE_POLL in src/lib/config.ts), but a ping
// does NOT mean "refetch everything" — each asset is only refetched once it
// is older than its cadence, and BIST symbols only during market hours. A
// `force` call (the daily cron, with a valid X-Cron-Token) bypasses all of
// this and refetches everything.
// ──────────────────────────────────────────────────────────────────────

/** A non-forced call arriving within this window of the last fetch no-ops —
 *  collapses concurrent pings (multiple tabs / phone + laptop) into one fetch. */
const FETCH_GUARD_MS = 20_000

/** Crypto + tokenized gold trade 24/7 and their sources report in real time. */
const CRYPTO_CADENCE_MS = 30_000

/** Equities (BIST + US). BIST is additionally gated on market hours below. */
const STOCK_CADENCE_MS = 60_000

/** FX/gold come from TCMB, which publishes ~once a day — no point re-pulling
 *  the XML every ping. */
const FX_CADENCE_MS = 15 * 60 * 1000

/** Turkish funds (TEFAS) publish their NAV ~once a business day, so polling
 *  more often is wasted; the daily cron force-refresh still captures EOD. */
const FUND_CADENCE_MS = 6 * 60 * 60 * 1000

const TCMB_TODAY_URL = "https://www.tcmb.gov.tr/kurlar/today.xml"

type ServiceClient = ReturnType<typeof getServiceClient>

/** Snapshot of every cached price's age, keyed by ticker (== price_cache key
 *  == fetch key). Drives both the global guard and the per-asset due-check. */
interface Freshness {
  updatedAtMs: Map<string, number>
  /** Most recent fetch of anything; 0 if the cache is empty. */
  maxUpdatedMs: number
}

// ──────────────────────────────────────────────────────────────────────
// Step helpers — each is one self-contained stage of a refresh.
// ──────────────────────────────────────────────────────────────────────

/** Load current freshness from price_cache in one read. */
async function loadFreshness(supabase: ServiceClient): Promise<Freshness> {
  const updatedAtMs = new Map<string, number>()
  let maxUpdatedMs = 0

  const { data: rows } = await supabase
    .from("price_cache")
    .select("ticker, updated_at")

  for (const r of (rows ?? []) as { ticker: string; updated_at: string | null }[]) {
    if (!r.updated_at) continue
    const t = new Date(r.updated_at).getTime()
    updatedAtMs.set(r.ticker, t)
    if (t > maxUpdatedMs) maxUpdatedMs = t
  }
  return { updatedAtMs, maxUpdatedMs }
}

/** BIST continuous session is 10:00–18:00 local; the closing auction runs to
 *  ~18:10. Outside that (and on weekends) `.IS` prices can't move, so we skip
 *  them. Turkish public holidays aren't handled — Yahoo just returns the last
 *  close on those, a handful of harmless wasted pings a year. */
function isBistOpen(at: Date): boolean {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: HOME_TIMEZONE,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(at)

  const weekday = parts.find((p) => p.type === "weekday")?.value
  const hour = Number(parts.find((p) => p.type === "hour")?.value)
  const minute = Number(parts.find((p) => p.type === "minute")?.value)

  if (weekday === "Sat" || weekday === "Sun") return false
  const minutes = hour * 60 + minute
  return minutes >= 10 * 60 && minutes <= 18 * 60 + 10
}

/** Whether a non-fund price key is due for a refetch this run. */
function isSymbolDue(
  category: string,
  lastUpdatedMs: number,
  nowMs: number,
): boolean {
  const cadence =
    category === "crypto" || category === "gold"
      ? CRYPTO_CADENCE_MS
      : STOCK_CADENCE_MS
  const ageDue = !lastUpdatedMs || nowMs - lastUpdatedMs > cadence
  const marketOpen =
    category === "stock_bist" ? isBistOpen(new Date(nowMs)) : true
  return ageDue && marketOpen
}

/** Gram-gold in USD via the shared Yahoo client (GC=F gold futures, USD/oz).
 *  Fallback for when TCMB's XAU line is absent (it usually is now). The shared
 *  client never throws — failures surface as a `{ status, quote: null }`. */
async function fetchGoldGramUsd(): Promise<{ value: number | null; error?: string }> {
  const { status, quote } = await fetchYahooQuote("GC=F")
  if (!quote) {
    return {
      value: null,
      error: `Yahoo GC=F: ${status === null ? "request failed" : `HTTP ${status}`}`,
    }
  }
  if (quote.price == null || quote.price <= 0) {
    return { value: null, error: "Yahoo GC=F: missing regularMarketPrice" }
  }
  return { value: quote.price / TROY_OZ_GRAMS }
}

interface FxResult {
  /** USD/TRY and EUR/USD, needed to convert TRY/EUR-quoted source prices. */
  usdTry: number | null
  eurUsd: number | null
  updated: number
  errors: string[]
}

/** Step 1 — TCMB exchange rates (+ gram gold). Runs only when `fxDue`; pulls
 *  the daily XML, upserts `exchange_rates` and the USD/EUR/TRY/XAU_GRAM rows of
 *  `price_cache`, and returns the rates the price-source step needs for conversions. */
async function refreshFxRates(
  supabase: ServiceClient,
  opts: { fxDue: boolean; nowIso: string },
): Promise<FxResult> {
  if (!opts.fxDue) return { usdTry: null, eurUsd: null, updated: 0, errors: [] }

  const { nowIso } = opts
  const errors: string[] = []
  let usdTry: number | null = null
  let eurTry: number | null = null
  let eurUsd: number | null = null
  let updated = 0

  try {
    const res = await fetch(TCMB_TODAY_URL)
    if (!res.ok) throw new Error(`TCMB HTTP ${res.status}`)
    const xml = await res.text()

    const usdMatch = xml.match(
      /<Currency[^>]*CurrencyCode="USD"[^>]*>[\s\S]*?<ForexBuying>([\d.]+)<\/ForexBuying>/
    )
    usdTry = usdMatch ? parseFloat(usdMatch[1]) : null

    const eurMatch = xml.match(
      /<Currency[^>]*CurrencyCode="EUR"[^>]*>[\s\S]*?<ForexBuying>([\d.]+)<\/ForexBuying>/
    )
    eurTry = eurMatch ? parseFloat(eurMatch[1]) : null

    // TCMB used to publish XAU (gold) in today.xml but dropped it; try the
    // regex first as a no-cost path, then fall back to Yahoo GC=F.
    const xauMatch = xml.match(
      /<Currency[^>]*CurrencyCode="XAU"[^>]*>[\s\S]*?<ForexBuying>([\d.]+)<\/ForexBuying>/
    )
    let goldGramUsd: number | null = xauMatch
      ? parseFloat(xauMatch[1]) / TROY_OZ_GRAMS
      : null
    if (goldGramUsd == null) {
      const gold = await fetchGoldGramUsd()
      goldGramUsd = gold.value
      if (gold.error) errors.push(gold.error)
    }

    if (usdTry && eurTry) {
      eurUsd = eurTry / usdTry
      const today = new Date().toISOString().split("T")[0]
      const goldGramTry = goldGramUsd != null ? goldGramUsd * usdTry : null

      await supabase.from("exchange_rates").upsert(
        {
          date: today,
          source: "tcmb",
          usd_try: usdTry,
          eur_try: eurTry,
          eur_usd: eurUsd,
          gold_gram_try: goldGramTry,
        },
        { onConflict: "date,source" }
      )

      const priceRows = [
        { ticker: "USD", price_usd: 1, price_try: usdTry, source: "tcmb", updated_at: nowIso },
        { ticker: "EUR", price_usd: eurUsd, price_try: eurTry, source: "tcmb", updated_at: nowIso },
        { ticker: "TRY", price_usd: 1 / usdTry, price_try: 1, source: "tcmb", updated_at: nowIso },
      ]
      if (goldGramUsd != null) {
        priceRows.push({
          ticker: "XAU_GRAM",
          price_usd: goldGramUsd,
          price_try: goldGramUsd * usdTry,
          source: xauMatch ? "tcmb" : "yahoo",
          updated_at: nowIso,
        })
      }

      await supabase.from("price_cache").upsert(priceRows, { onConflict: "ticker" })
      updated += priceRows.length
    } else {
      errors.push("TCMB: could not parse USD/TRY or EUR/TRY")
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown TCMB error"
    errors.push(`TCMB: ${msg}`)
  }

  return { usdTry, eurUsd, updated, errors }
}

/** When the FX step is skipped (cadence) or failed, load the last known
 *  usdTry / eurUsd from `exchange_rates` so source conversions still work. */
async function ensureConversionRates(
  supabase: ServiceClient,
  fx: { usdTry: number | null; eurUsd: number | null },
): Promise<{ usdTry: number | null; eurUsd: number | null }> {
  let { usdTry, eurUsd } = fx
  if (!usdTry) {
    const { data: rateRow } = await supabase
      .from("exchange_rates")
      .select("usd_try, eur_usd")
      .order("date", { ascending: false })
      .limit(1)
      .single()
    usdTry = rateRow?.usd_try ?? null
    if (eurUsd == null) eurUsd = rateRow?.eur_usd ?? null
  }
  return { usdTry, eurUsd }
}

/** One price_cache key to refresh and the sources to try for it. */
interface KeyPlan extends PriceTarget {
  category: string
  priceSource: string | null
}

type SourceRowJoined = SourceRow & {
  asset_id: string
  assets: { ticker: string; price_id: string | null; category: string; price_source: string | null } | null
}

/** Every price_cache key that has price sources, with its ordered source rows.
 *  Keyed by `price_id ?? ticker` (the cache key readers use). If two assets
 *  ever share a key, the first asset (by id) supplies the sources and the
 *  category; the key is still fetched once. */
async function loadSourcePlans(supabase: ServiceClient): Promise<KeyPlan[]> {
  const { data, error } = await supabase
    .from("asset_price_sources")
    .select("id, asset_id, priority, source, symbol, assets(ticker, price_id, category, price_source)")
    .order("asset_id")
    .order("priority")
  if (error) throw new Error(error.message)

  const plans = new Map<string, KeyPlan & { assetId: string }>()
  for (const r of (data ?? []) as unknown as SourceRowJoined[]) {
    if (!r.assets) continue
    const key = r.assets.price_id ?? r.assets.ticker
    let plan = plans.get(key)
    if (!plan) {
      plan = {
        key,
        sources: [],
        category: r.assets.category,
        priceSource: r.assets.price_source,
        assetId: r.asset_id,
      }
      plans.set(key, plan)
    }
    if (plan.assetId !== r.asset_id) continue
    plan.sources.push({ id: r.id, priority: r.priority, source: r.source, symbol: r.symbol })
  }
  return [...plans.values()]
}

/** Whether a key is due this run: funds (TEFAS NAV, daily) on the fund
 *  cadence, everything else per `isSymbolDue` (incl. the BIST hours gate). */
function isKeyDue(plan: KeyPlan, lastUpdatedMs: number, nowMs: number): boolean {
  if (plan.category === "fund" || plan.priceSource === "tefas") {
    return !lastUpdatedMs || nowMs - lastUpdatedMs >= FUND_CADENCE_MS
  }
  return isSymbolDue(plan.category, lastUpdatedMs, nowMs)
}

/** Longest `last_error` kept on a source row. */
const MAX_ERROR_LENGTH = 200

/** Step 2 — every asset with price sources (Paribu / Yahoo / TEFAS). For each
 *  due key, sources are tried in priority order and the first price wins (see
 *  `_shared/price-sources/resolve.ts`). The winner's row gets `last_ok_at`, the
 *  ones that failed before it `last_error(_at)`; later rows are untouched.
 *  Response `errors` list only keys that no source could price. */
async function refreshSourcePrices(
  supabase: ServiceClient,
  opts: {
    force: boolean
    usdTry: number | null
    eurUsd: number | null
    updatedAtMs: Map<string, number>
    nowMs: number
    nowIso: string
  },
): Promise<{ updated: number; errors: string[] }> {
  const { force, usdTry, eurUsd, updatedAtMs, nowMs, nowIso } = opts

  let plans: KeyPlan[]
  try {
    plans = await loadSourcePlans(supabase)
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    return { updated: 0, errors: [`Price sources: ${msg}`] }
  }
  const due = plans.filter((p) => force || isKeyDue(p, updatedAtMs.get(p.key) ?? 0, nowMs))
  if (due.length === 0) return { updated: 0, errors: [] }

  // Paribu crypto is TL; US stocks USD; BIST/TEFAS TRY; Yahoo per meta.currency.
  const { priced, failures, unpriced } = await resolvePrices(due, createFetchers(), (quote) =>
    splitPrice(quote.price, quote.currency, { usdTry, eurUsd }) ??
      `unsupported currency ${quote.currency}`
  )

  const errors: string[] = []
  const unpricedSet = new Set(unpriced)
  for (const f of failures) {
    if (unpricedSet.has(f.key)) errors.push(`${SOURCE_LABEL[f.row.source]} ${f.row.symbol}: ${f.error}`)
  }

  let updated = 0
  if (priced.size > 0) {
    const rows = [...priced].map(([key, { value, row }]) => ({
      ticker: key,
      price_usd: value.price_usd,
      price_try: value.price_try,
      source: row.source,
      updated_at: nowIso,
    }))
    const { error } = await supabase.from("price_cache").upsert(rows, { onConflict: "ticker" })
    if (error) errors.push(`price_cache: ${error.message}`)
    else updated = rows.length
  }

  // Health, batched: one update for every winner, one per distinct error text.
  const okIds = [...priced.values()].map((p) => p.row.id)
  const byError = new Map<string, string[]>()
  for (const f of failures) {
    const msg = f.error.slice(0, MAX_ERROR_LENGTH)
    byError.set(msg, [...(byError.get(msg) ?? []), f.row.id])
  }
  const writes = [
    ...(okIds.length > 0
      ? [supabase.from("asset_price_sources").update({ last_ok_at: nowIso }).in("id", okIds)]
      : []),
    ...[...byError].map(([msg, ids]) =>
      supabase
        .from("asset_price_sources")
        .update({ last_error: msg, last_error_at: nowIso })
        .in("id", ids)
    ),
  ]
  for (const { error } of await Promise.all(writes)) {
    if (error) errors.push(`source health: ${error.message}`)
  }

  return { updated, errors }
}

/** Step 3 (cron only) — chain a server-side snapshot function now that prices
 *  are fresh. Fire-and-forget. Must forward X-Cron-Token: the chained function
 *  authorizes on that, not the JWT. */
function triggerChainedFunction(fnName: string, cronToken: string): void {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  fetch(`${supabaseUrl}/functions/v1/${fnName}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
      "X-Cron-Token": cronToken,
    },
    body: "{}",
  }).catch((err) => {
    console.error(`${fnName} invoke failed:`, err)
  })
}

// ──────────────────────────────────────────────────────────────────────
// Orchestrator
// ──────────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const origin = req.headers.get("origin")

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(origin) })
  }

  // Two callers: the cron (X-Cron-Token) and a signed-in user (the app's live
  // poll, the widget feed). Anyone else gets 401. Only the cron may bypass the
  // cadence/guard or chain a snapshot; user pings only ever trigger a normal,
  // throttled refresh.
  const caller = await authorizeRequest(req, { allowCron: true })
  if (caller.kind === "denied") return unauthorizedResponse(corsHeaders(origin))
  const cronToken = Deno.env.get("CRON_TOKEN")
  const isCron = caller.kind === "cron"

  let body: { force?: boolean; snapshot?: boolean; intraday?: boolean } = {}
  try {
    body = await req.json()
  } catch {
    // No/!JSON body — a plain frontend ping. Defaults stand.
  }
  const force = isCron && body.force === true
  const doSnapshot = isCron && body.snapshot === true
  const doIntraday = isCron && body.intraday === true

  const supabase = getServiceClient()
  const nowMs = Date.now()
  const nowIso = new Date(nowMs).toISOString()

  const { updatedAtMs, maxUpdatedMs } = await loadFreshness(supabase)

  // Global guard: bail out cheaply if anything was fetched moments ago.
  if (!force && maxUpdatedMs && nowMs - maxUpdatedMs < FETCH_GUARD_MS) {
    return new Response(
      JSON.stringify({ updated: 0, skipped: "guard", timestamp: nowIso }),
      { headers: { ...corsHeaders(origin), "Content-Type": "application/json" } },
    )
  }

  const errors: string[] = []
  let updated = 0

  // Step 1 — FX (only when due / forced).
  const usdUpdated = updatedAtMs.get("USD") ?? 0
  const fxDue = force || !usdUpdated || nowMs - usdUpdated > FX_CADENCE_MS
  const fx = await refreshFxRates(supabase, { fxDue, nowIso })
  errors.push(...fx.errors)
  updated += fx.updated

  const rates = await ensureConversionRates(supabase, fx)

  // Step 2 — price sources (per-key cadence / market hours, priority + fallback).
  const sourced = await refreshSourcePrices(supabase, {
    force,
    usdTry: rates.usdTry,
    eurUsd: rates.eurUsd,
    updatedAtMs,
    nowMs,
    nowIso,
  })
  errors.push(...sourced.errors)
  updated += sourced.updated

  // Step 3 — daily EOD snapshot (cron only).
  if (doSnapshot) {
    try {
      triggerChainedFunction("take-snapshots", cronToken!)
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown snapshot error"
      errors.push(`take-snapshots: ${msg}`)
    }
  }

  // Step 3.5 — hourly intraday snapshot (cron only).
  if (doIntraday) {
    try {
      triggerChainedFunction("take-intraday-snapshots", cronToken!)
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown intraday error"
      errors.push(`take-intraday-snapshots: ${msg}`)
    }
  }

  return new Response(
    JSON.stringify({
      updated,
      errors: errors.length > 0 ? errors : undefined,
      timestamp: new Date().toISOString(),
    }),
    { headers: { ...corsHeaders(origin), "Content-Type": "application/json" } },
  )
})
