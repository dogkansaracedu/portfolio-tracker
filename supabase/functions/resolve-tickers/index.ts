import { getServiceClient } from "../_shared/client.ts"
import { corsHeaders } from "../_shared/cors.ts"
import { fetchYahooQuote } from "../_shared/yahoo.ts"
import { splitPrice, categoryForQuote } from "../_shared/currency.ts"

interface RequestBody {
  tickers: unknown
}

interface ResolvedTicker {
  ticker: string
  name: string
  category: "stock_us" | "stock_bist"
  price_source: "yahoo"
  currency: string
}

interface UnresolvedTicker {
  ticker: string
  reason: "not_found" | "http_error" | "not_equity"
}

interface ResponseBody {
  resolved: ResolvedTicker[]
  unresolved: UnresolvedTicker[]
}

const MAX_BATCH = 20
const YAHOO_DELAY_MS = 1000

Deno.serve(async (req) => {
  const origin = req.headers.get("origin")

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(origin) })
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    })
  }

  let body: RequestBody
  try {
    body = (await req.json()) as RequestBody
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    })
  }

  const tickers: string[] = Array.isArray(body.tickers)
    ? body.tickers
        .map((t) => (typeof t === "string" ? t.trim() : ""))
        .filter(Boolean)
        .map((t) => t.toUpperCase())
        .slice(0, MAX_BATCH)
    : []

  if (tickers.length === 0) {
    const empty: ResponseBody = { resolved: [], unresolved: [] }
    return new Response(JSON.stringify(empty), {
      headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    })
  }

  const supabase = getServiceClient()

  const { data: rateRow } = await supabase
    .from("exchange_rates")
    .select("usd_try, eur_usd")
    .order("date", { ascending: false })
    .limit(1)
    .single()
  const usdTry: number | null = rateRow?.usd_try ?? null
  const eurUsd: number | null = rateRow?.eur_usd ?? null

  const resolved: ResolvedTicker[] = []
  const unresolved: UnresolvedTicker[] = []
  const now = new Date().toISOString()

  for (let i = 0; i < tickers.length; i++) {
    const ticker = tickers[i]

    if (i > 0) {
      await new Promise((r) => setTimeout(r, YAHOO_DELAY_MS))
    }

    try {
      const { status, quote } = await fetchYahooQuote(ticker)

      if (!quote) {
        console.error(`resolve-tickers ${ticker}: HTTP ${status ?? "request failed"}`)
        // A 404 or a 200-with-no-meta both mean "no such symbol"; anything
        // else (other HTTP code, network failure) is a transient error.
        unresolved.push({
          ticker,
          reason: status === 404 || status === 200 ? "not_found" : "http_error",
        })
        continue
      }

      if (quote.instrumentType !== "EQUITY" && quote.instrumentType !== "ETF") {
        unresolved.push({ ticker, reason: "not_equity" })
        continue
      }

      // Category and conversion both come from the source currency, not `.IS`.
      const category = categoryForQuote(quote.currency)

      if (quote.price != null) {
        const split = splitPrice(quote.price, quote.currency, { usdTry, eurUsd })
        if (split) {
          const { error: cacheError } = await supabase.from("price_cache").upsert(
            {
              ticker,
              price_usd: split.price_usd,
              price_try: split.price_try,
              source: "yahoo",
              updated_at: now,
            },
            { onConflict: "ticker" },
          )
          if (cacheError) {
            console.error(`resolve-tickers price_cache upsert failed for ${ticker}:`, cacheError)
          }
        }
        // split === null → unsupported currency: resolve the ticker but skip pricing.
      }

      resolved.push({
        ticker,
        name: quote.name,
        category,
        price_source: "yahoo",
        currency: quote.currency,
      })
    } catch (err) {
      console.error(`resolve-tickers ${ticker} failed:`, err)
      unresolved.push({ ticker, reason: "http_error" })
    }
  }

  const responseBody: ResponseBody = { resolved, unresolved }
  return new Response(JSON.stringify(responseBody), {
    headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
  })
})
