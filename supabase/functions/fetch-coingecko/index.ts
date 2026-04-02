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
    // Get distinct crypto tickers from assets
    const { data: assets, error: assetsError } = await supabase
      .from("assets")
      .select("ticker")
      .eq("price_source", "coingecko")

    if (assetsError) {
      throw new Error(`Failed to query assets: ${assetsError.message}`)
    }

    if (!assets || assets.length === 0) {
      return new Response(JSON.stringify({ updated: 0, message: "No crypto assets found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    // Deduplicate tickers
    const tickers = [...new Set(assets.map((a: { ticker: string }) => a.ticker.toLowerCase()))]

    // Fetch prices from CoinGecko
    const ids = tickers.join(",")
    const cgRes = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`
    )

    if (cgRes.status === 429) {
      throw new Error("CoinGecko rate limit (429). Retry later.")
    }

    if (!cgRes.ok) {
      throw new Error(`CoinGecko fetch failed: ${cgRes.status} ${cgRes.statusText}`)
    }

    const cgData = await cgRes.json()

    // Get latest USD/TRY rate for conversion
    const { data: rateRow } = await supabase
      .from("exchange_rates")
      .select("usd_try")
      .order("date", { ascending: false })
      .limit(1)
      .single()

    const usdTry = rateRow?.usd_try ?? null

    // Build price_cache rows
    const now = new Date().toISOString()
    const priceRows: Array<{
      ticker: string
      price_usd: number
      price_try: number | null
      source: string
      updated_at: string
    }> = []

    for (const ticker of tickers) {
      const priceData = cgData[ticker]
      if (priceData?.usd) {
        priceRows.push({
          ticker: ticker,
          price_usd: priceData.usd,
          price_try: usdTry ? priceData.usd * usdTry : null,
          source: "coingecko",
          updated_at: now,
        })
      }
    }

    if (priceRows.length > 0) {
      const { error: cacheError } = await supabase
        .from("price_cache")
        .upsert(priceRows, { onConflict: "ticker" })

      if (cacheError) {
        throw new Error(`price_cache upsert error: ${cacheError.message}`)
      }
    }

    return new Response(JSON.stringify({ updated: priceRows.length }), {
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
