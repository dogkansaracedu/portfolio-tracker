import { createClient } from "jsr:@supabase/supabase-js@2"
import { corsHeaders } from "../_shared/cors.ts"

function pad2(n: number): string {
  return n.toString().padStart(2, "0")
}

/** Build TCMB historical rates URL: kurlar/YYYYMM/DDMMYYYY.xml */
function tcmbUrlFor(d: Date): string {
  const yyyy = d.getUTCFullYear()
  const mm = pad2(d.getUTCMonth() + 1)
  const dd = pad2(d.getUTCDate())
  return `https://www.tcmb.gov.tr/kurlar/${yyyy}${mm}/${dd}${mm}${yyyy}.xml`
}

function isoDate(d: Date): string {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(
    d.getUTCDate(),
  )}`
}

interface FetchResult {
  rate_date: string
  usd_try: number
  eur_try: number | null
}

/**
 * Walk back up to 7 days from `targetDate` until TCMB returns 200 (TCMB
 * skips weekends and Turkish holidays). The rate is stored under the actual
 * publish date so `getExchangeRateForDate` (closest ≤ target) finds it.
 */
async function fetchTcmbHistorical(
  targetDate: string,
): Promise<FetchResult | null> {
  for (let back = 0; back <= 7; back++) {
    const d = new Date(`${targetDate}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() - back)
    const url = tcmbUrlFor(d)

    const res = await fetch(url)
    if (!res.ok) continue

    const xml = await res.text()
    const usdMatch = xml.match(
      /<Currency[^>]*CurrencyCode="USD"[^>]*>[\s\S]*?<ForexBuying>([\d.]+)<\/ForexBuying>/,
    )
    if (!usdMatch) continue

    const usdTry = parseFloat(usdMatch[1])
    if (!Number.isFinite(usdTry) || usdTry <= 0) continue

    const eurMatch = xml.match(
      /<Currency[^>]*CurrencyCode="EUR"[^>]*>[\s\S]*?<ForexBuying>([\d.]+)<\/ForexBuying>/,
    )
    const eurTry =
      eurMatch && Number.isFinite(parseFloat(eurMatch[1]))
        ? parseFloat(eurMatch[1])
        : null

    return { rate_date: isoDate(d), usd_try: usdTry, eur_try: eurTry }
  }
  return null
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin")
  const jsonHeaders = { ...corsHeaders(origin), "Content-Type": "application/json" }

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(origin) })
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    if (!supabaseUrl || !serviceKey) {
      return new Response(
        JSON.stringify({ error: "Missing service env vars" }),
        { status: 500, headers: jsonHeaders },
      )
    }

    let body: { date?: string } = {}
    try {
      body = await req.json()
    } catch {
      // empty body OK
    }
    const targetDate = (body.date ?? "").slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
      return new Response(
        JSON.stringify({ error: "body.date must be YYYY-MM-DD" }),
        { status: 400, headers: jsonHeaders },
      )
    }

    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    })

    // Fast path: already cached.
    const { data: existing } = await supabase
      .from("exchange_rates")
      .select("date, source, usd_try, eur_try")
      .eq("source", "tcmb")
      .lte("date", targetDate)
      .order("date", { ascending: false })
      .limit(1)
    const hit = existing?.[0]
    if (hit && hit.date === targetDate) {
      return new Response(
        JSON.stringify({
          requested: targetDate,
          rate_date: hit.date,
          usd_try: hit.usd_try,
          eur_try: hit.eur_try,
          cached: true,
        }),
        { headers: jsonHeaders },
      )
    }

    const result = await fetchTcmbHistorical(targetDate)
    if (!result) {
      return new Response(
        JSON.stringify({
          error: `TCMB has no rate within 7 days back from ${targetDate}`,
        }),
        { status: 404, headers: jsonHeaders },
      )
    }

    // Skip the upsert if TCMB's publish-date row is already there (an older
    // tx may have triggered the same fetch). Avoids needless writes.
    if (hit?.date !== result.rate_date) {
      const { error: upsertErr } = await supabase
        .from("exchange_rates")
        .upsert(
          {
            date: result.rate_date,
            source: "tcmb",
            usd_try: result.usd_try,
            eur_try: result.eur_try,
            eur_usd:
              result.eur_try != null ? result.eur_try / result.usd_try : null,
            gold_gram_try: null,
          },
          { onConflict: "date,source" },
        )
      if (upsertErr) {
        return new Response(
          JSON.stringify({ error: `upsert: ${upsertErr.message}` }),
          { status: 500, headers: jsonHeaders },
        )
      }
    }

    return new Response(
      JSON.stringify({
        requested: targetDate,
        rate_date: result.rate_date,
        usd_try: result.usd_try,
        eur_try: result.eur_try,
        cached: false,
      }),
      { headers: jsonHeaders },
    )
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return new Response(
      JSON.stringify({ error: `fetch-historical-rate: ${message}` }),
      { status: 500, headers: jsonHeaders },
    )
  }
})
