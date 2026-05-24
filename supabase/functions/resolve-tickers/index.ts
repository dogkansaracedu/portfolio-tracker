import { getServiceClient } from "../_shared/client.ts"
import { corsHeaders } from "../_shared/cors.ts"

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
    .select("usd_try")
    .order("date", { ascending: false })
    .limit(1)
    .single()
  const usdTry: number | null = rateRow?.usd_try ?? null

  const resolved: ResolvedTicker[] = []
  const unresolved: UnresolvedTicker[] = []
  const now = new Date().toISOString()

  for (let i = 0; i < tickers.length; i++) {
    const ticker = tickers[i]

    if (i > 0) {
      await new Promise((r) => setTimeout(r, YAHOO_DELAY_MS))
    }

    try {
      const yahooRes = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1d`,
      )

      if (!yahooRes.ok) {
        unresolved.push({
          ticker,
          reason: yahooRes.status === 404 ? "not_found" : "http_error",
        })
        continue
      }

      const data = await yahooRes.json()
      const meta = data?.chart?.result?.[0]?.meta

      if (!meta) {
        unresolved.push({ ticker, reason: "not_found" })
        continue
      }

      if (meta.quoteType !== "EQUITY") {
        unresolved.push({ ticker, reason: "not_equity" })
        continue
      }

      const name: string = meta.longName || meta.shortName || ticker
      const currency: string = typeof meta.currency === "string" ? meta.currency : "USD"
      const category: ResolvedTicker["category"] = ticker.endsWith(".IS")
        ? "stock_bist"
        : "stock_us"
      const price = meta.regularMarketPrice

      if (typeof price === "number") {
        let priceUsd: number | null = null
        let priceTry: number | null = null
        if (currency === "TRY") {
          priceTry = price
          priceUsd = usdTry ? price / usdTry : null
        } else {
          priceUsd = price
          priceTry = usdTry ? price * usdTry : null
        }
        const { error: cacheError } = await supabase.from("price_cache").upsert(
          {
            ticker,
            price_usd: priceUsd,
            price_try: priceTry,
            source: "yahoo",
            updated_at: now,
          },
          { onConflict: "ticker" },
        )
        if (cacheError) {
          console.error(`resolve-tickers price_cache upsert failed for ${ticker}:`, cacheError)
        }
      }

      resolved.push({
        ticker,
        name,
        category,
        price_source: "yahoo",
        currency,
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
