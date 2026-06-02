import { getServiceClient } from "../_shared/client.ts"
import { corsHeaders } from "../_shared/cors.ts"
import { splitPrice } from "../_shared/currency.ts"
import { TROY_OZ_GRAMS } from "../_shared/constants.ts"

// ─── Types ──────────────────────────────────────────────────────────

interface AssetRow {
  id: string
  ticker: string
  price_id: string | null
  name: string
  category: string
  tags: string[] | null
  price_source: string
  is_active: boolean
}

interface PlatformRow {
  id: string
  name: string
  color: string
}

interface TransactionRow {
  id: string
  user_id: string
  asset_id: string
  platform_id: string
  type:
    | "buy"
    | "sell"
    | "transfer_in"
    | "transfer_out"
    | "dividend"
    | "interest"
    | "fee"
    | "cash_credit"
    | "cash_debit"
  date: string
  amount: number
  unit_price: number
  price_currency: string
  total_cost: number
  fee: number | null
  fee_currency: string | null
}

// ─── Constants ──────────────────────────────────────────────────────

const YAHOO_HEADERS: HeadersInit = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/json,text/plain,*/*",
  "Accept-Language": "en-US,en;q=0.9",
}

// ─── Helpers ────────────────────────────────────────────────────────

function isoDate(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(
    d.getUTCDate(),
  ).padStart(2, "0")}`
}

function todayIso(): string {
  return isoDate(new Date())
}

/** Every day from `daysBack` ago through `to` (inclusive). */
function dailyRange(to: string, daysBack: number): string[] {
  const out: string[] = []
  const toD = new Date(`${to}T00:00:00Z`)
  for (let i = daysBack; i >= 0; i--) {
    const d = new Date(toD.getTime())
    d.setUTCDate(d.getUTCDate() - i)
    out.push(isoDate(d))
  }
  return out
}

/** Every 7th day from `from` (inclusive) up to but not including `to`,
 *  walking forward. The result starts on `from`'s weekday. */
function weeklyBetween(from: string, to: string): string[] {
  const out: string[] = []
  const fromD = new Date(`${from}T00:00:00Z`)
  const toD = new Date(`${to}T00:00:00Z`)
  const cur = new Date(fromD.getTime())
  while (cur.getTime() < toD.getTime()) {
    out.push(isoDate(cur))
    cur.setUTCDate(cur.getUTCDate() + 7)
  }
  return out
}

/** Find most recent value at or before `date`. Falls back up to 30 days back. */
function lookupAtOrBefore(
  map: Map<string, number>,
  date: string,
): number | null {
  if (map.has(date)) return map.get(date)!
  const d = new Date(`${date}T00:00:00Z`)
  for (let i = 1; i <= 30; i++) {
    d.setUTCDate(d.getUTCDate() - 1)
    const key = isoDate(d)
    if (map.has(key)) return map.get(key)!
  }
  return null
}

// ─── Historical fetch sources ──────────────────────────────────────

async function fetchYahooHistory(
  ticker: string,
  fromTs: number,
  toTs: number,
): Promise<{ closes: Map<string, number>; currency: string }> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    ticker,
  )}?period1=${fromTs}&period2=${toTs}&interval=1d`
  const res = await fetch(url, { headers: YAHOO_HEADERS })
  if (!res.ok) {
    throw new Error(`Yahoo ${ticker} HTTP ${res.status} ${res.statusText}`)
  }
  const data = (await res.json()) as {
    chart?: {
      result?: Array<{
        meta?: { currency?: string }
        timestamp?: number[]
        indicators?: { quote?: Array<{ close?: (number | null)[] }> }
      }>
    }
  }
  const result = data.chart?.result?.[0]
  const closes = new Map<string, number>()
  if (!result) return { closes, currency: "USD" }
  // The currency these closes are quoted in (BIST → TRY, Frankfurt → EUR, …).
  // Same principle as the live fetcher: take it from the source, not the suffix.
  const currency =
    typeof result.meta?.currency === "string" ? result.meta.currency : "USD"
  const timestamps = result.timestamp ?? []
  const closeArr = result.indicators?.quote?.[0]?.close ?? []
  for (let i = 0; i < timestamps.length; i++) {
    const c = closeArr[i]
    if (c == null) continue
    closes.set(isoDate(new Date(timestamps[i] * 1000)), c)
  }
  return { closes, currency }
}

// ─── Balance application ────────────────────────────────────────────

function balanceSign(type: TransactionRow["type"]): number {
  switch (type) {
    case "buy":
    case "transfer_in":
    case "dividend":
    case "interest":
    case "cash_credit":
      return 1
    case "sell":
    case "transfer_out":
    case "fee":
    case "cash_debit":
      return -1
    default:
      return 0
  }
}

// ─── Main handler ──────────────────────────────────────────────────

Deno.serve(async (req) => {
  const origin = req.headers.get("origin")
  const jsonHeaders = { ...corsHeaders(origin), "Content-Type": "application/json" }

  function jsonError(message: string, status = 500): Response {
    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: jsonHeaders,
    })
  }

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(origin) })
  }

  try {
    return await handle(req, jsonHeaders, jsonError)
  } catch (e) {
    // Catch-all so an uncaught throw inside handle() returns an actionable
    // JSON body instead of an opaque "non-2xx status code".
    const message = e instanceof Error
      ? `${e.message}\n${e.stack ?? ""}`.trim()
      : String(e)
    return jsonError(`backfill-snapshots crashed: ${message}`)
  }
})

async function handle(
  req: Request,
  jsonHeaders: HeadersInit,
  jsonError: (message: string, status?: number) => Response,
): Promise<Response> {
  let supabase
  try {
    supabase = getServiceClient()
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : String(err))
  }

  // Parse body (optional)
  let body: {
    granularity?: "monthly" | "tx_dates"
    overwrite?: boolean
  } = {}
  try {
    body = await req.json()
  } catch {
    // empty body OK
  }
  const granularity = body.granularity ?? "monthly"
  const overwrite = body.overwrite ?? false

  const errors: string[] = []

  // ── Load assets, platforms, transactions ───────────────────────
  const { data: assetsRaw, error: assetsErr } = await supabase
    .from("assets")
    .select("id, ticker, price_id, name, category, tags, price_source, is_active")
  if (assetsErr) {
    return jsonError(`load assets: ${assetsErr.message}`)
  }
  const assets = (assetsRaw ?? []) as AssetRow[]
  const assetsById = new Map<string, AssetRow>()
  // Keyed by the price-fetch key (price_id ?? ticker), matching how
  // priceMaps and the held set below are keyed.
  const assetsByPriceId = new Map<string, AssetRow>()
  for (const a of assets) {
    assetsById.set(a.id, a)
    assetsByPriceId.set(a.price_id ?? a.ticker, a)
  }

  const { data: platformsRaw, error: platformsErr } = await supabase
    .from("platforms")
    .select("id, name, color")
  if (platformsErr) {
    return jsonError(`load platforms: ${platformsErr.message}`)
  }
  const platformsById = new Map<string, PlatformRow>()
  for (const p of (platformsRaw ?? []) as PlatformRow[]) {
    platformsById.set(p.id, p)
  }

  const { data: txRaw, error: txErr } = await supabase
    .from("transactions")
    .select(
      "id, user_id, asset_id, platform_id, type, date, amount, unit_price, price_currency, total_cost, fee, fee_currency",
    )
    .order("date", { ascending: true })
  if (txErr) {
    return jsonError(`load transactions: ${txErr.message}`)
  }
  const txs = (txRaw ?? []) as TransactionRow[]
  if (txs.length === 0) {
    // Return a valid BackfillResult shape so the client doesn't trip on missing
    // fields when there is genuinely nothing to do.
    return new Response(
      JSON.stringify({
        target_dates: [],
        target_count: 0,
        snapshots_written: 0,
        tickers_priced: [],
        sample: [],
        errors: ["No transactions to backfill"],
        timestamp: new Date().toISOString(),
      }),
      { headers: jsonHeaders },
    )
  }

  // ── Determine target dates ─────────────────────────────────────
  const earliestTxDate = txs[0].date.slice(0, 10)
  const today = todayIso()

  // Build target date set:
  //   monthly  → every month-start since earliest tx + every day in the
  //              last 30 days (so 1G/1H ranges in the dashboard hero have
  //              data points to draw, not just 1 May + today).
  //   tx_dates → only the days a transaction happened.
  // "today" is always included.
  const targetSet = new Set<string>()
  if (granularity === "monthly") {
    // Two-tier density:
    //   Last 30 days  → daily (smooth recent ranges)
    //   Older         → weekly walking back from 31 days ago to first tx
    // Anchor first tx so charts start at the actual entry point.
    targetSet.add(earliestTxDate)

    const daily = dailyRange(today, 30)
    for (const d of daily) {
      if (d >= earliestTxDate) targetSet.add(d)
    }

    // Weekly tier: 31+ days back, walking from earliestTxDate forward in
    // 7-day steps, stopping before the daily tier begins.
    const dailyStart = daily[0] // 30 days ago
    for (const d of weeklyBetween(earliestTxDate, dailyStart)) {
      targetSet.add(d)
    }
  } else {
    for (const t of txs) targetSet.add(t.date.slice(0, 10))
  }
  targetSet.add(today)
  const targetDates = [...targetSet].sort()

  // ── Fetch historical prices ────────────────────────────────────
  const fromTs =
    Math.floor(new Date(`${earliestTxDate}T00:00:00Z`).getTime() / 1000) -
    7 * 86400
  const toTs =
    Math.floor(new Date(`${today}T00:00:00Z`).getTime() / 1000) + 86400

  // Discover which price_ids we actually need (only assets that ever had a tx).
  // Keyed by the fetch key (price_id ?? ticker) so priceMaps lines up.
  const heldPriceIds = new Set<string>()
  for (const t of txs) {
    const a = assetsById.get(t.asset_id)
    if (a) heldPriceIds.add(a.price_id ?? a.ticker)
  }

  // priceMaps is keyed by price_id (price_id ?? ticker) everywhere.
  const priceMaps = new Map<string, Map<string, number>>()
  // Source currency per Yahoo symbol (from meta.currency), used to convert
  // its native closes to USD. Symbols not listed here are treated as USD
  // (XAU_GRAM is derived from USD/oz).
  const currencyByPriceId = new Map<string, string>()

  // Stocks, crypto, and tokenized gold via Yahoo (sequential w/ small delay)
  const yahooPriceIds = [...heldPriceIds].filter((pid) => {
    const a = assetsByPriceId.get(pid)
    return a?.price_source === "yahoo"
  })
  for (const priceId of yahooPriceIds) {
    try {
      const { closes, currency } = await fetchYahooHistory(priceId, fromTs, toTs)
      priceMaps.set(priceId, closes)
      currencyByPriceId.set(priceId, currency)
      await new Promise((r) => setTimeout(r, 800))
    } catch (e) {
      errors.push(
        `Yahoo ${priceId}: ${e instanceof Error ? e.message : String(e)}`,
      )
    }
  }

  // Physical gold (XAU_GRAM) via Yahoo gold futures (GC=F is USD/oz)
  if (heldPriceIds.has("XAU_GRAM")) {
    try {
      const { closes: oz } = await fetchYahooHistory("GC=F", fromTs, toTs)
      const gram = new Map<string, number>()
      for (const [d, v] of oz) gram.set(d, v / TROY_OZ_GRAMS)
      priceMaps.set("XAU_GRAM", gram)
      await new Promise((r) => setTimeout(r, 800))
    } catch (e) {
      errors.push(
        `Yahoo XAU_GRAM (GC=F): ${e instanceof Error ? e.message : String(e)}`,
      )
    }
  }

  // USD/TRY via Yahoo (TRY=X)
  let usdTryMap = new Map<string, number>()
  try {
    usdTryMap = (await fetchYahooHistory("TRY=X", fromTs, toTs)).closes
    await new Promise((r) => setTimeout(r, 800))
  } catch (e) {
    errors.push(`Yahoo TRY=X: ${e instanceof Error ? e.message : String(e)}`)
  }

  // EUR/TRY via Yahoo (EURTRY=X)
  let eurTryMap = new Map<string, number>()
  try {
    eurTryMap = (await fetchYahooHistory("EURTRY=X", fromTs, toTs)).closes
  } catch (e) {
    errors.push(`Yahoo EURTRY=X: ${e instanceof Error ? e.message : String(e)}`)
  }

  // ── Group transactions by user ─────────────────────────────────
  const txsByUser = new Map<string, TransactionRow[]>()
  for (const t of txs) {
    const arr = txsByUser.get(t.user_id) ?? []
    arr.push(t)
    txsByUser.set(t.user_id, arr)
  }

  // ── Compute snapshots for every (user, date) ───────────────────
  const inserts: Array<{
    user_id: string
    snapshot_date: string
    total_usd: number
    total_try: number
    breakdown: unknown
  }> = []

  for (const [userId, userTxs] of txsByUser) {
    for (const date of targetDates) {
      // Compute (asset_id, platform_id) → balance after applying txs ≤ date
      const balances = new Map<string, Map<string, number>>() // assetId → (platformId → balance)
      for (const t of userTxs) {
        if (t.date.slice(0, 10) > date) break
        const sign = balanceSign(t.type)
        if (sign === 0) continue
        const inner = balances.get(t.asset_id) ?? new Map<string, number>()
        const cur = inner.get(t.platform_id) ?? 0
        inner.set(t.platform_id, cur + sign * Number(t.amount))
        balances.set(t.asset_id, inner)
      }


      // Rates at date
      const usdTry = lookupAtOrBefore(usdTryMap, date) ?? 30
      const eurTry = lookupAtOrBefore(eurTryMap, date) ?? 33
      const goldGramUsd = lookupAtOrBefore(
        priceMaps.get("XAU_GRAM") ?? new Map(),
        date,
      )
      const goldGramTry = goldGramUsd != null ? goldGramUsd * usdTry : null

      let totalUsd = 0
      let totalTry = 0
      const byCategory: Record<
        string,
        { usd: number; try: number; pct: number }
      > = {}
      const byPlatform: Record<
        string,
        { usd: number; try: number; color: string; pct: number }
      > = {}
      const byTag: Record<string, { usd: number; try: number; pct: number }> = {}
      const byAsset: Array<{
        ticker: string
        name: string
        platform: string
        amount: number
        price_usd: number
        value_usd: number
        value_try: number
      }> = []

      for (const [assetId, perPlatform] of balances) {
        const a = assetsById.get(assetId)
        if (!a || !a.is_active) continue

        // Resolve price USD at this date. Key the special cases and the
        // priceMaps lookup on the fetch key (price_id ?? ticker).
        const priceId = a.price_id ?? a.ticker
        let priceUsd = 0
        if (priceId === "USD") priceUsd = 1
        else if (priceId === "TRY") priceUsd = 1 / usdTry
        else if (priceId === "EUR") priceUsd = eurTry / usdTry
        else {
          const map = priceMaps.get(priceId)
          if (map) {
            const close = lookupAtOrBefore(map, date) ?? 0
            // Convert the source-currency close (BIST→TRY, etc.) to USD using
            // the date's rates. Was previously booked as USD verbatim, which
            // inflated TRY-quoted stocks ~30-45x.
            const currency = currencyByPriceId.get(priceId) ?? "USD"
            const eurUsd = usdTry ? eurTry / usdTry : null
            priceUsd =
              splitPrice(close, currency, { usdTry, eurUsd })?.price_usd ?? 0
          }
        }
        const priceTry = priceUsd * usdTry

        for (const [platformId, balance] of perPlatform) {
          if (balance <= 1e-9) continue
          const p = platformsById.get(platformId)
          if (!p) continue

          const valueUsd = balance * priceUsd
          const valueTry = balance * priceTry
          totalUsd += valueUsd
          totalTry += valueTry

          byAsset.push({
            ticker: a.ticker,
            name: a.name,
            platform: p.name,
            amount: balance,
            price_usd: priceUsd,
            value_usd: valueUsd,
            value_try: valueTry,
          })

          if (!byCategory[a.category])
            byCategory[a.category] = { usd: 0, try: 0, pct: 0 }
          byCategory[a.category].usd += valueUsd
          byCategory[a.category].try += valueTry

          if (!byPlatform[p.name]) {
            byPlatform[p.name] = { usd: 0, try: 0, color: p.color, pct: 0 }
          }
          byPlatform[p.name].usd += valueUsd
          byPlatform[p.name].try += valueTry

          for (const tag of a.tags ?? []) {
            if (!byTag[tag]) byTag[tag] = { usd: 0, try: 0, pct: 0 }
            byTag[tag].usd += valueUsd
            byTag[tag].try += valueTry
          }
        }
      }

      const safePct = (n: number) =>
        totalUsd > 0 ? (n / totalUsd) * 100 : 0
      for (const k of Object.keys(byCategory))
        byCategory[k].pct = safePct(byCategory[k].usd)
      for (const k of Object.keys(byPlatform))
        byPlatform[k].pct = safePct(byPlatform[k].usd)
      for (const k of Object.keys(byTag))
        byTag[k].pct = safePct(byTag[k].usd)

      // Skip only when at least one held asset couldn't be priced
      // (partial data — typically a holding bought before its Yahoo history
      // window). An empty portfolio is a real, honest state: the user
      // closed all positions. Write a 0-valued snapshot so charts render
      // a flat $0 line through that period instead of an interpolated
      // gap. Percent-change consumers handle 0-anchor by falling back to
      // invested-capital as denominator.
      const hasUnpriced = byAsset.some(
        (a) => a.amount > 0 && a.price_usd <= 0,
      )
      if (hasUnpriced) continue

      inserts.push({
        user_id: userId,
        snapshot_date: date,
        total_usd: totalUsd,
        total_try: totalTry,
        breakdown: {
          rates: {
            usd_try: usdTry,
            eur_try: eurTry,
            gold_gram_try: goldGramTry,
          },
          by_category: byCategory,
          by_platform: byPlatform,
          by_tag: byTag,
          by_asset: byAsset,
        },
      })
    }
  }

  // ── Optionally wipe existing snapshots in the affected range ─────
  // Range-based wipe (not date-list wipe). Earlier behavior deleted
  // only the exact dates this run is about to write — but stale rows
  // from prior runs with different cadences (e.g. an old weekly
  // snapshot the new run doesn't target this time) survived. The user
  // expectation for "overwrite existing snapshots" is "wipe the slate
  // for the affected user-history window, then rewrite", so we delete
  // every snapshot in [earliestTxDate, today] for the affected users.
  if (overwrite && inserts.length > 0) {
    const userIds = [...new Set(inserts.map((i) => i.user_id))]
    const { error: delErr } = await supabase
      .from("snapshots")
      .delete()
      .in("user_id", userIds)
      .gte("snapshot_date", earliestTxDate)
      .lte("snapshot_date", today)
    if (delErr) errors.push(`delete existing: ${delErr.message}`)
  }

  // ── Upsert all snapshots ───────────────────────────────────────
  let written = 0
  if (inserts.length > 0) {
    const { data: upserted, error: upErr } = await supabase
      .from("snapshots")
      .upsert(inserts, { onConflict: "user_id,snapshot_date" })
      .select("id")
    if (upErr) errors.push(`upsert: ${upErr.message}`)
    else written = upserted?.length ?? 0
  }

  return new Response(
    JSON.stringify({
      target_dates: targetDates,
      target_count: targetDates.length,
      snapshots_written: written,
      tickers_priced: [...priceMaps.keys()],
      sample: inserts.slice(0, 3).map((i) => ({
        date: i.snapshot_date,
        total_usd: i.total_usd,
        total_try: i.total_try,
      })),
      errors: errors.length > 0 ? errors : undefined,
      timestamp: new Date().toISOString(),
    }),
    { headers: jsonHeaders },
  )
}
