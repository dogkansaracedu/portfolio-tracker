import { createClient } from "jsr:@supabase/supabase-js@2"
import { corsHeaders } from "../_shared/cors.ts"

Deno.serve(async (req) => {
  const origin = req.headers.get("origin")

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(origin) })
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  )

  try {
    // Fetch TCMB daily exchange rates XML
    const res = await fetch("https://www.tcmb.gov.tr/kurlar/today.xml")
    if (!res.ok) {
      throw new Error(`TCMB fetch failed: ${res.status} ${res.statusText}`)
    }
    const xml = await res.text()

    // Parse USD/TRY
    const usdMatch = xml.match(
      /<Currency[^>]*CurrencyCode="USD"[^>]*>[\s\S]*?<ForexBuying>([\d.]+)<\/ForexBuying>/
    )
    const usdTry = usdMatch ? parseFloat(usdMatch[1]) : null

    // Parse EUR/TRY
    const eurMatch = xml.match(
      /<Currency[^>]*CurrencyCode="EUR"[^>]*>[\s\S]*?<ForexBuying>([\d.]+)<\/ForexBuying>/
    )
    const eurTry = eurMatch ? parseFloat(eurMatch[1]) : null

    // Parse gold gram TRY (XAU)
    // TCMB publishes XAU per ounce in USD; we compute gram price in TRY
    // The XML has a dedicated row for XAU with ForexBuying in USD per ounce
    const xauMatch = xml.match(
      /<Currency[^>]*CurrencyCode="XAU"[^>]*>[\s\S]*?<ForexBuying>([\d.]+)<\/ForexBuying>/
    )
    let goldGramTry: number | null = null
    if (xauMatch && usdTry) {
      const xauOunceUsd = parseFloat(xauMatch[1])
      // 1 troy ounce = 31.1035 grams
      goldGramTry = (xauOunceUsd / 31.1035) * usdTry
    }

    if (!usdTry || !eurTry) {
      throw new Error("Could not parse USD/TRY or EUR/TRY from TCMB XML")
    }

    const today = new Date().toISOString().split("T")[0]

    // Upsert exchange_rates
    const { error: ratesError } = await supabase.from("exchange_rates").upsert(
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

    if (ratesError) {
      throw new Error(`exchange_rates upsert error: ${ratesError.message}`)
    }

    const now = new Date().toISOString()

    // Upsert price_cache for fiat and gold
    const priceRows = [
      {
        ticker: "USD",
        price_usd: 1,
        price_try: usdTry,
        source: "tcmb",
        updated_at: now,
      },
      {
        ticker: "EUR",
        price_usd: eurTry / usdTry,
        price_try: eurTry,
        source: "tcmb",
        updated_at: now,
      },
      {
        ticker: "TRY",
        price_usd: 1 / usdTry,
        price_try: 1,
        source: "tcmb",
        updated_at: now,
      },
    ]

    if (xauMatch) {
      const xauOunceUsd = parseFloat(xauMatch[1])
      // price_usd = USD per gram (troy oz / 31.1035)
      const goldGramUsd = xauOunceUsd / 31.1035
      // price_try = USD per gram * USD/TRY
      const goldGramTryPrice = goldGramUsd * usdTry
      priceRows.push({
        ticker: "XAU_GRAM",
        price_usd: goldGramUsd,
        price_try: goldGramTryPrice,
        source: "tcmb",
        updated_at: now,
      })
    }

    const { error: cacheError } = await supabase
      .from("price_cache")
      .upsert(priceRows, { onConflict: "ticker" })

    if (cacheError) {
      throw new Error(`price_cache upsert error: ${cacheError.message}`)
    }

    const result = {
      usd_try: usdTry,
      eur_try: eurTry,
      gold_gram_try: goldGramTry,
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    })
  }
})
