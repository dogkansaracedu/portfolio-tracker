/** Yahoo Finance chart-endpoint fetch, shared by `fetch-prices` and
 *  `resolve-tickers`. The price's currency is read from `meta.currency` — the
 *  source's own report — never guessed from the ticker suffix.
 *
 *  The chart is requested with pre-/post-market candles (`includePrePost=true`)
 *  at intraday granularity so the reported price tracks extended-hours trading:
 *  `pickLatestPrice` returns whichever is newer — `regularMarketPrice` (the
 *  live/last regular tick) or the most recent intraday close (which spans
 *  pre-market, regular, and after-hours when included). For 24/7 assets
 *  (crypto, gold futures) the two coincide; for BIST there is no extended
 *  session, so this is a no-op there. */

const YAHOO_CHART_BASE = "https://query1.finance.yahoo.com/v8/finance/chart"

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/json,text/plain,*/*",
  "Accept-Language": "en-US,en;q=0.9",
}

export interface YahooQuote {
  /** Most recent traded price (pre-market, regular, or after-hours — whichever
   *  is newest), quoted in `currency`. Null when the response omitted it. */
  price: number | null
  /** `meta.currency` — the currency `price` is quoted in (e.g. USD, TRY, EUR). */
  currency: string
  /** `meta.instrumentType` (e.g. EQUITY, ETF), or null. */
  instrumentType: string | null
  /** Best display name: longName → shortName → the symbol. */
  name: string
}

export interface YahooResult {
  /** HTTP status, or null if the request never completed (network error). */
  status: number | null
  /** Parsed quote, or null on HTTP/parse failure or a missing `meta` block. */
  quote: YahooQuote | null
}

/** A `chart.result[0]` object — only the fields the price picker reads. */
interface YahooChartResult {
  meta?: {
    regularMarketPrice?: unknown
    regularMarketTime?: unknown
  }
  timestamp?: unknown
  indicators?: { quote?: Array<{ close?: unknown }> }
}

/** Most recent traded price from a Yahoo chart result: whichever is newer of
 *  `regularMarketPrice` (at `regularMarketTime`) and the last non-null intraday
 *  close (at its candle timestamp). With `includePrePost=true` the intraday
 *  series spans pre-market / regular / after-hours, so this surfaces the
 *  freshest extended-hours print while the regular tick is still preferred
 *  during the regular session (it's more real-time than the last 5m candle).
 *  Falls back to `regularMarketPrice` when no intraday close exists, or `null`
 *  when neither is present. */
export function pickLatestPrice(result: YahooChartResult): number | null {
  const meta = result?.meta
  const regPrice =
    typeof meta?.regularMarketPrice === "number" ? meta.regularMarketPrice : null
  const regTime =
    typeof meta?.regularMarketTime === "number" ? meta.regularMarketTime : null

  const timestamps = Array.isArray(result?.timestamp) ? result.timestamp : []
  const closes = Array.isArray(result?.indicators?.quote?.[0]?.close)
    ? (result.indicators!.quote![0].close as unknown[])
    : []

  // Walk back to the last non-null close and the timestamp of its candle.
  let lastClose: number | null = null
  let lastCloseTime: number | null = null
  for (let i = closes.length - 1; i >= 0; i--) {
    if (typeof closes[i] === "number") {
      lastClose = closes[i] as number
      lastCloseTime =
        typeof timestamps[i] === "number" ? (timestamps[i] as number) : null
      break
    }
  }

  if (lastClose === null) return regPrice
  if (regPrice === null) return lastClose
  // Both present: prefer the more recent. If timestamps can't be compared,
  // keep regularMarketPrice (the canonical field).
  if (regTime !== null && lastCloseTime !== null) {
    return lastCloseTime > regTime ? lastClose : regPrice
  }
  return regPrice
}

/** Fetch a single quote. Never throws — network/HTTP/parse failures surface as
 *  `{ status, quote: null }` so callers branch on one `quote` check and map the
 *  status to their own error vocabulary. */
export async function fetchYahooQuote(symbol: string): Promise<YahooResult> {
  let res: Response
  try {
    res = await fetch(
      `${YAHOO_CHART_BASE}/${encodeURIComponent(symbol)}?interval=5m&range=1d&includePrePost=true`,
      { headers: BROWSER_HEADERS },
    )
  } catch {
    return { status: null, quote: null }
  }

  if (!res.ok) return { status: res.status, quote: null }

  let data
  try {
    data = await res.json()
  } catch {
    return { status: res.status, quote: null }
  }

  const result = data?.chart?.result?.[0]
  const meta = result?.meta
  if (!meta) return { status: res.status, quote: null }

  return {
    status: res.status,
    quote: {
      price: pickLatestPrice(result),
      currency: typeof meta.currency === "string" ? meta.currency : "USD",
      instrumentType:
        typeof meta.instrumentType === "string" ? meta.instrumentType : null,
      name: meta.longName || meta.shortName || symbol,
    },
  }
}
