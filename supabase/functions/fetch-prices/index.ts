import { createClient } from "jsr:@supabase/supabase-js@2"

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
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  )

  const errors: string[] = []
  let totalUpdated = 0

  // ──────────────────────────────────────────────────────────────
  // Step 1: TCMB (exchange rates — must run first for conversions)
  // ──────────────────────────────────────────────────────────────
  let usdTry: number | null = null
  let eurTry: number | null = null
  let goldGramTry: number | null = null

  try {
    const res = await fetch("https://www.tcmb.gov.tr/kurlar/today.xml")
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

    const xauMatch = xml.match(
      /<Currency[^>]*CurrencyCode="XAU"[^>]*>[\s\S]*?<ForexBuying>([\d.]+)<\/ForexBuying>/
    )
    if (xauMatch && usdTry) {
      const xauOunceUsd = parseFloat(xauMatch[1])
      goldGramTry = (xauOunceUsd / 31.1035) * usdTry
    }

    if (usdTry && eurTry) {
      const today = new Date().toISOString().split("T")[0]

      await supabase.from("exchange_rates").upsert(
        {
          date: today,
          source: "tcmb",
          usd_try: usdTry,
          eur_try: eurTry,
          eur_usd: eurTry / usdTry,
          gold_gram_try: goldGramTry,
        },
        { onConflict: "date,source" }
      )

      const now = new Date().toISOString()
      const priceRows = [
        { ticker: "USD", price_usd: 1, price_try: usdTry, source: "tcmb", updated_at: now },
        { ticker: "EUR", price_usd: eurTry / usdTry, price_try: eurTry, source: "tcmb", updated_at: now },
        { ticker: "TRY", price_usd: 1 / usdTry, price_try: 1, source: "tcmb", updated_at: now },
      ]
      if (goldGramTry) {
        priceRows.push({
          ticker: "XAU_GRAM",
          price_usd: goldGramTry / usdTry,
          price_try: goldGramTry,
          source: "tcmb",
          updated_at: now,
        })
      }

      await supabase.from("price_cache").upsert(priceRows, { onConflict: "ticker" })
      totalUpdated += priceRows.length
    } else {
      errors.push("TCMB: could not parse USD/TRY or EUR/TRY")
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown TCMB error"
    errors.push(`TCMB: ${msg}`)
  }

  // If we didn't get usdTry from TCMB, try to load it from exchange_rates
  if (!usdTry) {
    const { data: rateRow } = await supabase
      .from("exchange_rates")
      .select("usd_try")
      .order("date", { ascending: false })
      .limit(1)
      .single()
    usdTry = rateRow?.usd_try ?? null
  }

  // ──────────────────────────────────────────────────────────────
  // Step 2: CoinGecko (crypto) — runs in parallel with Yahoo
  // ──────────────────────────────────────────────────────────────
  const coingeckoPromise = (async () => {
    try {
      const { data: assets } = await supabase
        .from("assets")
        .select("ticker")
        .eq("category", "crypto")

      if (!assets || assets.length === 0) return 0

      const tickers = [...new Set(assets.map((a: { ticker: string }) => a.ticker.toLowerCase()))]
      const ids = tickers.join(",")

      const cgRes = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`
      )

      if (cgRes.status === 429) {
        errors.push("CoinGecko: rate limit (429)")
        return 0
      }
      if (!cgRes.ok) {
        errors.push(`CoinGecko: HTTP ${cgRes.status}`)
        return 0
      }

      const cgData = await cgRes.json()
      const now = new Date().toISOString()
      const rows: Array<{
        ticker: string
        price_usd: number
        price_try: number | null
        source: string
        updated_at: string
      }> = []

      for (const ticker of tickers) {
        if (cgData[ticker]?.usd) {
          rows.push({
            ticker,
            price_usd: cgData[ticker].usd,
            price_try: usdTry ? cgData[ticker].usd * usdTry : null,
            source: "coingecko",
            updated_at: now,
          })
        }
      }

      if (rows.length > 0) {
        await supabase.from("price_cache").upsert(rows, { onConflict: "ticker" })
      }
      return rows.length
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown CoinGecko error"
      errors.push(`CoinGecko: ${msg}`)
      return 0
    }
  })()

  // ──────────────────────────────────────────────────────────────
  // Step 3: Yahoo Finance (stocks) — runs in parallel with CoinGecko
  // ──────────────────────────────────────────────────────────────
  const yahooPromise = (async () => {
    try {
      const { data: assets } = await supabase
        .from("assets")
        .select("ticker, category")
        .in("category", ["stock_bist", "stock_us"])

      if (!assets || assets.length === 0) return 0

      const tickerSet = new Map<string, string>()
      for (const a of assets) {
        tickerSet.set(a.ticker, a.category)
      }

      const now = new Date().toISOString()
      let updated = 0
      const tickers = [...tickerSet.entries()]

      for (let i = 0; i < tickers.length; i++) {
        const [ticker] = tickers[i]

        if (i > 0) {
          await new Promise((resolve) => setTimeout(resolve, 1000))
        }

        try {
          const yahooRes = await fetch(
            `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1d`
          )

          if (!yahooRes.ok) {
            errors.push(`Yahoo ${ticker}: HTTP ${yahooRes.status}`)
            continue
          }

          const yahooData = await yahooRes.json()
          const regularMarketPrice =
            yahooData?.chart?.result?.[0]?.meta?.regularMarketPrice

          if (regularMarketPrice == null) {
            errors.push(`Yahoo ${ticker}: no price in response`)
            continue
          }

          const isTRY = ticker.endsWith(".IS")
          let priceUsd: number | null = null
          let priceTry: number | null = null

          if (isTRY) {
            priceTry = regularMarketPrice
            priceUsd = usdTry ? regularMarketPrice / usdTry : null
          } else {
            priceUsd = regularMarketPrice
            priceTry = usdTry ? regularMarketPrice * usdTry : null
          }

          await supabase.from("price_cache").upsert(
            {
              ticker,
              price_usd: priceUsd,
              price_try: priceTry,
              source: "yahoo",
              updated_at: now,
            },
            { onConflict: "ticker" }
          )

          updated++
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Unknown error"
          errors.push(`Yahoo ${ticker}: ${msg}`)
        }
      }

      return updated
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown Yahoo error"
      errors.push(`Yahoo: ${msg}`)
      return 0
    }
  })()

  // Wait for both to complete
  const [cgUpdated, yahooUpdated] = await Promise.all([
    coingeckoPromise,
    yahooPromise,
  ])

  totalUpdated += cgUpdated + yahooUpdated

  const result = {
    updated: totalUpdated,
    errors: errors.length > 0 ? errors : undefined,
    timestamp: new Date().toISOString(),
  }

  return new Response(JSON.stringify(result), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
})
