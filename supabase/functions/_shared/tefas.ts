/** TEFAS (Türkiye Elektronik Fon Alım Satım Platformu) fund-price fetch, used by
 *  `fetch-prices` for Turkish mutual / money-market funds (PPF). A fund's price
 *  is its daily NAV (net asset value, per unit), always quoted in TRY. The
 *  legacy `BindHistoryInfo` API was retired in 2026 ("Method not found or
 *  disabled!"); this hits the current `/api/funds/fonFiyatBilgiGetir` JSON
 *  endpoint. */

const TEFAS_PRICE_URL = "https://www.tefas.gov.tr/api/funds/fonFiyatBilgiGetir"

/** `periyod` (months) is restricted to {1,3,6,12,36,60}; 1 returns ~the last
 *  month of daily NAVs and we take the most recent. */
const PERIYOD_LATEST = 1

/** TEFAS sends no CORS headers and WAF-blocks non-browser requests, so we
 *  replicate a browser's headers (incl. a Referer to the fund's analysis page).
 *  Same principle as the Yahoo client's User-Agent spoofing. */
function browserHeaders(fonKodu: string): HeadersInit {
  return {
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Content-Type": "application/json",
    Accept: "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    Origin: "https://www.tefas.gov.tr",
    Referer: `https://www.tefas.gov.tr/FonAnaliz.aspx?FonKod=${encodeURIComponent(fonKodu)}`,
  }
}

export interface TefasQuote {
  /** Latest NAV (`fiyat`), quoted in TRY. Null when the response had no rows. */
  price: number | null
  /** A fund's NAV is always Turkish lira. */
  currency: "TRY"
  /** Fund title (`fonUnvan`), or the code if absent. */
  name: string
  /** Date of the latest NAV (`tarih`, YYYY-MM-DD), or null. */
  date: string | null
}

export interface TefasResult {
  /** HTTP status, or null if the request never completed (network error). */
  status: number | null
  /** Parsed quote, or null on HTTP/parse failure or an empty result list. */
  quote: TefasQuote | null
}

interface TefasRow {
  tarih?: string
  fiyat?: number
  fonUnvan?: string
}

/** Fetch a single fund's latest NAV by its TEFAS fund code (`fonKodu`, e.g.
 *  `TP2`). Never throws — network/HTTP/parse failures and an empty result list
 *  surface as `{ status, quote: null }`, mirroring `fetchYahooQuote` so callers
 *  branch on one `quote` check. */
export async function fetchTefasQuote(fonKodu: string): Promise<TefasResult> {
  let res: Response
  try {
    res = await fetch(TEFAS_PRICE_URL, {
      method: "POST",
      headers: browserHeaders(fonKodu),
      body: JSON.stringify({ fonKodu, dil: "TR", periyod: PERIYOD_LATEST }),
    })
  } catch {
    return { status: null, quote: null }
  }

  if (!res.ok) return { status: res.status, quote: null }

  let data: { resultList?: TefasRow[] }
  try {
    data = await res.json()
  } catch {
    return { status: res.status, quote: null }
  }

  const rows = data?.resultList
  if (!Array.isArray(rows) || rows.length === 0) {
    return { status: res.status, quote: null }
  }

  // The list is date-ascending, but pick the row with the latest `tarih`
  // explicitly so we never depend on ordering.
  let latest: TefasRow | null = null
  for (const row of rows) {
    if (typeof row?.fiyat !== "number") continue
    if (!latest || (row.tarih ?? "") > (latest.tarih ?? "")) latest = row
  }
  if (!latest) return { status: res.status, quote: null }

  return {
    status: res.status,
    quote: {
      price: typeof latest.fiyat === "number" ? latest.fiyat : null,
      currency: "TRY",
      name: latest.fonUnvan || fonKodu,
      date: latest.tarih ?? null,
    },
  }
}
