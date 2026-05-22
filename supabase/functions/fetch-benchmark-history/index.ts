import { getServiceClient } from "../_shared/client.ts"
import { corsHeaders } from "../_shared/cors.ts"

// Tickers we expose to users as benchmark options. Keep small — the table
// grows by len(tickers) × ~2500 rows on the 10y range, and a Yahoo
// rate-limit triggers across the whole batch.
const BENCHMARK_TICKERS = ["SPY", "QQQ"] as const

// Yahoo's `chart` endpoint takes a `range` and `interval`. 10y gives us
// roughly 2500 daily closes per ticker — more than enough for any in-app
// time range (we already cap at "ALL"), and small enough that a daily
// re-fetch + upsert stays trivially cheap.
const YAHOO_RANGE = "10y"
const YAHOO_INTERVAL = "1d"

interface YahooChartResponse {
  chart?: {
    result?: Array<{
      timestamp?: number[]
      indicators?: {
        quote?: Array<{
          close?: Array<number | null>
        }>
        // Yahoo's "adjclose" accounts for splits & dividends. Use it as the
        // primary close so SPY's historical returns match what brokers
        // report (otherwise dividends silently disappear and the
        // benchmark line under-reports cumulative return by ~2%/yr).
        adjclose?: Array<{
          adjclose?: Array<number | null>
        }>
      }
    }>
    error?: { description?: string } | null
  }
}

function epochToDateUtc(ts: number): string {
  const d = new Date(ts * 1000)
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, "0")
  const day = String(d.getUTCDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin")

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(origin) })
  }

  const supabase = getServiceClient()
  const now = new Date().toISOString()
  let totalUpserted = 0
  const errors: string[] = []

  for (let i = 0; i < BENCHMARK_TICKERS.length; i++) {
    const ticker = BENCHMARK_TICKERS[i]
    // 1-second polite delay between tickers — same cadence as fetch-yahoo.
    if (i > 0) await new Promise((r) => setTimeout(r, 1000))

    try {
      const url =
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}` +
        `?interval=${YAHOO_INTERVAL}&range=${YAHOO_RANGE}`
      // Yahoo aggressively 429s the default Deno fetch User-Agent from
      // datacenter IPs. A browser-like UA + Accept header gets through
      // cleanly. Same workaround Yahoo-API wrappers (yfinance, etc.) use.
      const res = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
          Accept: "application/json,text/plain,*/*",
          "Accept-Language": "en-US,en;q=0.9",
        },
      })
      if (!res.ok) {
        errors.push(`${ticker}: HTTP ${res.status}`)
        continue
      }
      const json = (await res.json()) as YahooChartResponse
      const result = json.chart?.result?.[0]
      const timestamps = result?.timestamp
      const adjcloseArr = result?.indicators?.adjclose?.[0]?.adjclose
      const closeArr = result?.indicators?.quote?.[0]?.close
      const closes = adjcloseArr ?? closeArr

      if (!timestamps || !closes || timestamps.length !== closes.length) {
        errors.push(`${ticker}: malformed chart payload`)
        continue
      }

      const rows: Array<{
        ticker: string
        date: string
        close_usd: number
        updated_at: string
      }> = []
      for (let j = 0; j < timestamps.length; j++) {
        const close = closes[j]
        if (close == null || !Number.isFinite(close)) continue
        rows.push({
          ticker,
          date: epochToDateUtc(timestamps[j]),
          close_usd: close,
          updated_at: now,
        })
      }

      if (rows.length === 0) {
        errors.push(`${ticker}: no usable rows`)
        continue
      }

      const { error: upsertErr } = await supabase
        .from("benchmark_prices")
        .upsert(rows, { onConflict: "ticker,date" })

      if (upsertErr) {
        errors.push(`${ticker}: upsert error - ${upsertErr.message}`)
        continue
      }

      totalUpserted += rows.length
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error"
      errors.push(`${ticker}: ${msg}`)
    }
  }

  return new Response(JSON.stringify({ upserted: totalUpserted, errors }), {
    headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
  })
})
