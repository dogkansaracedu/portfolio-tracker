import { getServiceClient } from "../_shared/client.ts"
import { corsHeaders } from "../_shared/cors.ts"
import { fetchYahooQuote } from "../_shared/yahoo.ts"
import { fetchTefasQuote } from "../_shared/tefas.ts"
import { splitPrice } from "../_shared/currency.ts"
import { HOME_TIMEZONE, TROY_OZ_GRAMS } from "../_shared/constants.ts"

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

/** Crypto + tokenized gold trade 24/7 and Yahoo reports them in real time. */
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

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

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

/** Whether a single Yahoo symbol is due for a refetch this run. */
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
  /** USD/TRY and EUR/USD, needed to convert TRY/EUR-quoted Yahoo assets. */
  usdTry: number | null
  eurUsd: number | null
  updated: number
  errors: string[]
}

/** Step 1 — TCMB exchange rates (+ gram gold). Runs only when `fxDue`; pulls
 *  the daily XML, upserts `exchange_rates` and the USD/EUR/TRY/XAU_GRAM rows of
 *  `price_cache`, and returns the rates the Yahoo step needs for conversions. */
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
 *  usdTry / eurUsd from `exchange_rates` so Yahoo conversions still work. */
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

/** Step 2 — Yahoo Finance (stocks, crypto, tokenized gold). Refetches only the
 *  symbols that are due (per `isSymbolDue`, or all when `force`), 1s apart. */
async function refreshYahooPrices(
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
  const errors: string[] = []

  let assets: { ticker: string; price_id: string | null; category: string }[]
  try {
    const { data } = await supabase
      .from("assets")
      .select("ticker, price_id, category")
      .eq("price_source", "yahoo")
    assets = (data ?? []) as typeof assets
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown Yahoo error"
    return { updated: 0, errors: [`Yahoo: ${msg}`] }
  }
  if (assets.length === 0) return { updated: 0, errors }

  // Fetch key is price_id (Yahoo symbol, e.g. BTC-USD); fall back to ticker
  // until rows are backfilled. Dedupe on symbol, keeping its first category.
  const symbolCategory = new Map<string, string>()
  for (const a of assets) {
    const symbol = a.price_id ?? a.ticker
    if (!symbolCategory.has(symbol)) symbolCategory.set(symbol, a.category)
  }

  let updated = 0
  let fetchedAny = false

  for (const [symbol, category] of symbolCategory) {
    if (!force && !isSymbolDue(category, updatedAtMs.get(symbol) ?? 0, nowMs)) {
      continue
    }

    // Be gentle on Yahoo: 1s between actual fetches (skipped symbols don't
    // count, so a quiet run that only refreshes crypto stays fast).
    if (fetchedAny) await sleep(1000)
    fetchedAny = true

    try {
      const { status, quote } = await fetchYahooQuote(symbol)

      if (!quote) {
        errors.push(
          `Yahoo ${symbol}: ${status === null ? "request failed" : `HTTP ${status}`}`
        )
        continue
      }
      if (quote.price == null) {
        errors.push(`Yahoo ${symbol}: no price in response`)
        continue
      }

      // Currency comes from the source (meta.currency), not the suffix.
      const split = splitPrice(quote.price, quote.currency, { usdTry, eurUsd })
      if (!split) {
        errors.push(`Yahoo ${symbol}: unsupported currency ${quote.currency}`)
        continue
      }

      await supabase.from("price_cache").upsert(
        {
          ticker: symbol,
          price_usd: split.price_usd,
          price_try: split.price_try,
          source: "yahoo",
          updated_at: nowIso,
        },
        { onConflict: "ticker" }
      )
      updated++
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error"
      errors.push(`Yahoo ${symbol}: ${msg}`)
    }
  }

  return { updated, errors }
}

/** Step 2.5 — TEFAS (Turkish mutual / money-market funds, "PPF"). Each fund's
 *  daily NAV is fetched by its fund code (`price_id ?? ticker`) and is always
 *  TRY-quoted, so it converts through `splitPrice(..., "TRY", ...)` exactly like
 *  a BIST quote. No market-hours gate — NAV publishes once a business day, so a
 *  per-fund daily cadence is enough (force refetches everything). */
async function refreshTefasPrices(
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
  const errors: string[] = []

  let assets: { ticker: string; price_id: string | null }[]
  try {
    const { data } = await supabase
      .from("assets")
      .select("ticker, price_id")
      .eq("price_source", "tefas")
    assets = (data ?? []) as typeof assets
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown TEFAS error"
    return { updated: 0, errors: [`TEFAS: ${msg}`] }
  }
  if (assets.length === 0) return { updated: 0, errors }

  // Fetch key is the fund code (price_id ?? ticker), which is also the
  // price_cache key. Dedupe identical codes.
  const codes = new Set<string>()
  for (const a of assets) codes.add(a.price_id ?? a.ticker)

  let updated = 0
  let fetchedAny = false

  for (const code of codes) {
    const last = updatedAtMs.get(code) ?? 0
    if (!force && last && nowMs - last < FUND_CADENCE_MS) continue

    // Be gentle on TEFAS: 1s between actual fetches (skipped funds don't count).
    if (fetchedAny) await sleep(1000)
    fetchedAny = true

    try {
      const { status, quote } = await fetchTefasQuote(code)

      if (!quote) {
        errors.push(
          `TEFAS ${code}: ${status === null ? "request failed" : `HTTP ${status}`}`
        )
        continue
      }
      if (quote.price == null) {
        errors.push(`TEFAS ${code}: no NAV in response`)
        continue
      }

      // NAV is always TRY.
      const split = splitPrice(quote.price, quote.currency, { usdTry, eurUsd })
      if (!split) {
        errors.push(`TEFAS ${code}: unsupported currency ${quote.currency}`)
        continue
      }

      await supabase.from("price_cache").upsert(
        {
          ticker: code,
          price_usd: split.price_usd,
          price_try: split.price_try,
          source: "tefas",
          updated_at: nowIso,
        },
        { onConflict: "ticker" }
      )
      updated++
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error"
      errors.push(`TEFAS ${code}: ${msg}`)
    }
  }

  return { updated, errors }
}

/** Step 3 (cron only) — chain the server-side EOD snapshot now that prices are
 *  fresh. Fire-and-forget. Must forward X-Cron-Token: take-snapshots authorizes
 *  on that, not the JWT. */
function triggerSnapshot(cronToken: string): void {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  fetch(`${supabaseUrl}/functions/v1/take-snapshots`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
      "X-Cron-Token": cronToken,
    },
    body: "{}",
  }).catch((err) => {
    console.error("take-snapshots invoke failed:", err)
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

  // Only an authenticated internal caller (the cron, holding X-Cron-Token) may
  // bypass the cadence/guard or chain a snapshot. Public/frontend pings can
  // only ever trigger a normal, throttled refresh.
  const cronToken = Deno.env.get("CRON_TOKEN")
  const isCron = !!cronToken && req.headers.get("X-Cron-Token") === cronToken

  let body: { force?: boolean; snapshot?: boolean } = {}
  try {
    body = await req.json()
  } catch {
    // No/!JSON body — a plain frontend ping. Defaults stand.
  }
  const force = isCron && body.force === true
  const doSnapshot = isCron && body.snapshot === true

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

  // Step 2 — Yahoo (per-asset cadence / market hours).
  const yahoo = await refreshYahooPrices(supabase, {
    force,
    usdTry: rates.usdTry,
    eurUsd: rates.eurUsd,
    updatedAtMs,
    nowMs,
    nowIso,
  })
  errors.push(...yahoo.errors)
  updated += yahoo.updated

  // Step 2.5 — TEFAS (Turkish funds / PPF; daily NAV, no market-hours gate).
  const tefas = await refreshTefasPrices(supabase, {
    force,
    usdTry: rates.usdTry,
    eurUsd: rates.eurUsd,
    updatedAtMs,
    nowMs,
    nowIso,
  })
  errors.push(...tefas.errors)
  updated += tefas.updated

  // Step 3 — daily EOD snapshot (cron only).
  if (doSnapshot) {
    try {
      triggerSnapshot(cronToken!)
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown snapshot error"
      errors.push(`take-snapshots: ${msg}`)
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
