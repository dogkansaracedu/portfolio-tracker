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

  try {
    // Get distinct stock tickers from assets
    const { data: assets, error: assetsError } = await supabase
      .from("assets")
      .select("ticker")
      .eq("price_source", "yahoo")

    if (assetsError) {
      throw new Error(`Failed to query assets: ${assetsError.message}`)
    }

    if (!assets || assets.length === 0) {
      return new Response(
        JSON.stringify({ updated: 0, errors: [], message: "No stock assets found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // Deduplicate tickers
    const tickerSet = new Set<string>()
    for (const a of assets) {
      tickerSet.add(a.ticker)
    }

    // Get latest USD/TRY for converting TRY prices to USD
    const { data: rateRow } = await supabase
      .from("exchange_rates")
      .select("usd_try")
      .order("date", { ascending: false })
      .limit(1)
      .single()

    const usdTry = rateRow?.usd_try ?? null

    const now = new Date().toISOString()
    let updated = 0
    const errors: string[] = []

    // Process each ticker with a 1-second delay between requests
    const tickers = [...tickerSet]
    for (let i = 0; i < tickers.length; i++) {
      const ticker = tickers[i]

      // 1-second delay between requests (skip for first)
      if (i > 0) {
        await new Promise((resolve) => setTimeout(resolve, 1000))
      }

      try {
        const yahooRes = await fetch(
          `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1d`
        )

        if (!yahooRes.ok) {
          errors.push(`${ticker}: HTTP ${yahooRes.status}`)
          continue
        }

        const yahooData = await yahooRes.json()
        const meta = yahooData?.chart?.result?.[0]?.meta
        const regularMarketPrice = meta?.regularMarketPrice

        if (regularMarketPrice == null) {
          errors.push(`${ticker}: no regularMarketPrice in response`)
          continue
        }

        // Determine denomination: .IS suffix = TRY, else USD
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

        const { error: cacheError } = await supabase.from("price_cache").upsert(
          {
            ticker,
            price_usd: priceUsd,
            price_try: priceTry,
            source: "yahoo",
            updated_at: now,
          },
          { onConflict: "ticker" }
        )

        if (cacheError) {
          errors.push(`${ticker}: upsert error - ${cacheError.message}`)
          continue
        }

        updated++
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error"
        errors.push(`${ticker}: ${msg}`)
      }
    }

    return new Response(JSON.stringify({ updated, errors }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }
})
