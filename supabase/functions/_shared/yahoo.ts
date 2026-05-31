/** Yahoo Finance chart-endpoint fetch, shared by `fetch-prices` and
 *  `resolve-tickers`. The price's currency is read from `meta.currency` — the
 *  source's own report — never guessed from the ticker suffix. */

const YAHOO_CHART_BASE = "https://query1.finance.yahoo.com/v8/finance/chart"

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/json,text/plain,*/*",
  "Accept-Language": "en-US,en;q=0.9",
}

export interface YahooQuote {
  /** `regularMarketPrice`, quoted in `currency`. Null when the response omitted it. */
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

/** Fetch a single quote. Never throws — network/HTTP/parse failures surface as
 *  `{ status, quote: null }` so callers branch on one `quote` check and map the
 *  status to their own error vocabulary. */
export async function fetchYahooQuote(symbol: string): Promise<YahooResult> {
  let res: Response
  try {
    res = await fetch(
      `${YAHOO_CHART_BASE}/${encodeURIComponent(symbol)}?interval=1d&range=1d`,
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

  const meta = data?.chart?.result?.[0]?.meta
  if (!meta) return { status: res.status, quote: null }

  return {
    status: res.status,
    quote: {
      price:
        typeof meta.regularMarketPrice === "number"
          ? meta.regularMarketPrice
          : null,
      currency: typeof meta.currency === "string" ? meta.currency : "USD",
      instrumentType:
        typeof meta.instrumentType === "string" ? meta.instrumentType : null,
      name: meta.longName || meta.shortName || symbol,
    },
  }
}
