import { createClient } from "jsr:@supabase/supabase-js@2"

// ─── Types ──────────────────────────────────────────────────────────

interface AssetRow {
  id: string
  ticker: string
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
  date: string
  amount: number
  unit_price: number
  price_currency: string
  total_cost: number
  fee: number | null
  fee_currency: string | null
}

// ─── Constants ──────────────────────────────────────────────────────

const TROY_OZ_TO_GRAMS = 31.1035

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

/** First day of every month from `from` (inclusive) to `to` (inclusive month). */
function monthStartsBetween(from: string, to: string): string[] {
  const out: string[] = []
  const fromD = new Date(`${from}T00:00:00Z`)
  const toD = new Date(`${to}T00:00:00Z`)
  const cur = new Date(Date.UTC(fromD.getUTCFullYear(), fromD.getUTCMonth(), 1))
  const end = new Date(Date.UTC(toD.getUTCFullYear(), toD.getUTCMonth(), 1))
  while (cur.getTime() <= end.getTime()) {
    out.push(isoDate(cur))
    cur.setUTCMonth(cur.getUTCMonth() + 1)
  }
  return out
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

async function fetchCoinGeckoHistory(
  coinId: string,
): Promise<Map<string, number>> {
  const url = `https://api.coingecko.com/api/v3/coins/${coinId}/market_chart?vs_currency=usd&days=max&interval=daily`
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(
      `CoinGecko ${coinId} HTTP ${res.status} ${res.statusText}`,
    )
  }
  const data = (await res.json()) as { prices?: [number, number][] }
  const map = new Map<string, number>()
  for (const [tsMs, price] of data.prices ?? []) {
    map.set(isoDate(new Date(tsMs)), price)
  }
  return map
}

async function fetchYahooHistory(
  ticker: string,
  fromTs: number,
  toTs: number,
): Promise<Map<string, number>> {
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
        timestamp?: number[]
        indicators?: { quote?: Array<{ close?: (number | null)[] }> }
      }>
    }
  }
  const result = data.chart?.result?.[0]
  const map = new Map<string, number>()
  if (!result) return map
  const timestamps = result.timestamp ?? []
  const closes = result.indicators?.quote?.[0]?.close ?? []
  for (let i = 0; i < timestamps.length; i++) {
    const c = closes[i]
    if (c == null) continue
    map.set(isoDate(new Date(timestamps[i] * 1000)), c)
  }
  return map
}

// ─── Balance application ────────────────────────────────────────────

function balanceSign(type: TransactionRow["type"]): number {
  switch (type) {
    case "buy":
    case "transfer_in":
    case "dividend":
    case "interest":
      return 1
    case "sell":
    case "transfer_out":
    case "fee":
      return -1
    default:
      return 0
  }
}

// ─── Main handler ──────────────────────────────────────────────────

Deno.serve(async (req) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
  }
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  )

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
    .select("id, ticker, name, category, tags, price_source, is_active")
  if (assetsErr) {
    return new Response(JSON.stringify({ error: assetsErr.message }), {
      status: 500,
      headers: corsHeaders,
    })
  }
  const assets = (assetsRaw ?? []) as AssetRow[]
  const assetsById = new Map<string, AssetRow>()
  const assetsByTicker = new Map<string, AssetRow>()
  for (const a of assets) {
    assetsById.set(a.id, a)
    assetsByTicker.set(a.ticker, a)
  }

  const { data: platformsRaw, error: platformsErr } = await supabase
    .from("platforms")
    .select("id, name, color")
  if (platformsErr) {
    return new Response(JSON.stringify({ error: platformsErr.message }), {
      status: 500,
      headers: corsHeaders,
    })
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
    return new Response(JSON.stringify({ error: txErr.message }), {
      status: 500,
      headers: corsHeaders,
    })
  }
  const txs = (txRaw ?? []) as TransactionRow[]
  if (txs.length === 0) {
    return new Response(
      JSON.stringify({ message: "no transactions to backfill" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
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
    for (const d of monthStartsBetween(earliestTxDate, today)) targetSet.add(d)
    for (const d of dailyRange(today, 30)) {
      if (d >= earliestTxDate) targetSet.add(d)
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

  // Discover which tickers we actually need (only assets that ever had a tx)
  const heldTickers = new Set<string>()
  for (const t of txs) {
    const a = assetsById.get(t.asset_id)
    if (a) heldTickers.add(a.ticker)
  }

  const priceMaps = new Map<string, Map<string, number>>()

  // Crypto/gold via CoinGecko (sequential w/ small delay to respect rate limits)
  const coingeckoTickers = [...heldTickers].filter((t) => {
    const a = assetsByTicker.get(t)
    return a?.price_source === "coingecko" && t !== "tether" && t !== "usd-coin"
  })
  for (const ticker of coingeckoTickers) {
    try {
      const map = await fetchCoinGeckoHistory(ticker)
      priceMaps.set(ticker, map)
      // ~30 calls/min free tier; sleep briefly between calls
      await new Promise((r) => setTimeout(r, 1500))
    } catch (e) {
      errors.push(
        `CoinGecko ${ticker}: ${e instanceof Error ? e.message : String(e)}`,
      )
    }
  }

  // Stocks via Yahoo (sequential w/ small delay)
  const yahooTickers = [...heldTickers].filter((t) => {
    const a = assetsByTicker.get(t)
    return a?.price_source === "yahoo"
  })
  for (const ticker of yahooTickers) {
    try {
      const map = await fetchYahooHistory(ticker, fromTs, toTs)
      priceMaps.set(ticker, map)
      await new Promise((r) => setTimeout(r, 800))
    } catch (e) {
      errors.push(
        `Yahoo ${ticker}: ${e instanceof Error ? e.message : String(e)}`,
      )
    }
  }

  // Physical gold (XAU_GRAM) via Yahoo gold futures (GC=F is USD/oz)
  if (heldTickers.has("XAU_GRAM")) {
    try {
      const oz = await fetchYahooHistory("GC=F", fromTs, toTs)
      const gram = new Map<string, number>()
      for (const [d, v] of oz) gram.set(d, v / TROY_OZ_TO_GRAMS)
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
    usdTryMap = await fetchYahooHistory("TRY=X", fromTs, toTs)
    await new Promise((r) => setTimeout(r, 800))
  } catch (e) {
    errors.push(`Yahoo TRY=X: ${e instanceof Error ? e.message : String(e)}`)
  }

  // EUR/TRY via Yahoo (EURTRY=X)
  let eurTryMap = new Map<string, number>()
  try {
    eurTryMap = await fetchYahooHistory("EURTRY=X", fromTs, toTs)
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
      const byPlatform: Record<string, { usd: number; pct: number }> = {}
      const byTag: Record<string, { usd: number; pct: number }> = {}
      const byAsset: Array<{
        ticker: string
        name: string
        platform: string
        amount: number
        price_usd: number
        value_usd: number
      }> = []

      for (const [assetId, perPlatform] of balances) {
        const a = assetsById.get(assetId)
        if (!a || !a.is_active) continue

        // Resolve price USD at this date
        let priceUsd = 0
        if (a.ticker === "USD") priceUsd = 1
        else if (a.ticker === "TRY") priceUsd = 1 / usdTry
        else if (a.ticker === "EUR") priceUsd = eurTry / usdTry
        else if (a.ticker === "tether" || a.ticker === "usd-coin") priceUsd = 1
        else {
          const map = priceMaps.get(a.ticker)
          if (map) priceUsd = lookupAtOrBefore(map, date) ?? 0
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
          })

          if (!byCategory[a.category])
            byCategory[a.category] = { usd: 0, try: 0, pct: 0 }
          byCategory[a.category].usd += valueUsd
          byCategory[a.category].try += valueTry

          if (!byPlatform[p.name]) byPlatform[p.name] = { usd: 0, pct: 0 }
          byPlatform[p.name].usd += valueUsd

          for (const tag of a.tags ?? []) {
            if (!byTag[tag]) byTag[tag] = { usd: 0, pct: 0 }
            byTag[tag].usd += valueUsd
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

      // Skip dates where nothing was held yet
      if (totalUsd <= 0 && byAsset.length === 0) continue

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

  // ── Optionally wipe existing snapshots in the target range ─────
  if (overwrite && inserts.length > 0) {
    const userIds = [...new Set(inserts.map((i) => i.user_id))]
    const dates = [...new Set(inserts.map((i) => i.snapshot_date))]
    const { error: delErr } = await supabase
      .from("snapshots")
      .delete()
      .in("user_id", userIds)
      .in("snapshot_date", dates)
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
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  )
})
