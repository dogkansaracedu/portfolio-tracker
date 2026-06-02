/** Ticker → provider symbol logic. The asset's `ticker` is a display
 *  shorthand (THYAO, AAPL, BTC); `price_id` is the symbol a provider fetches
 *  by (THYAO.IS, AAPL, BTC-USD). These helpers derive one from the other. */

/** Yahoo suffix for Borsa İstanbul symbols (e.g. THYAO → THYAO.IS). */
export const BIST_YAHOO_SUFFIX = ".IS"

/** Convert raw user/PDF input to the canonical Yahoo-aligned ticker
 *  shape: uppercase + trimmed, with US class-share dots rewritten to
 *  dashes (BRK.B → BRK-B). BIST tickers ending in `.IS` keep their dot.
 *  Use this anywhere you need to compare or look up a ticker against
 *  the asset table — the asset's stored form follows the same rule. */
export function canonicalizeTicker(input: string): string {
  const upper = input.trim().toUpperCase()
  if (upper.endsWith(BIST_YAHOO_SUFFIX)) return upper
  return upper.replace(/\./g, "-")
}

/** Derive the Yahoo `price_id` from a ticker for the cases where it's
 *  mechanical: BIST stocks get a `.IS` suffix, US stocks are the canonical
 *  ticker as-is. Returns `null` when there's nothing to auto-fill (non-Yahoo
 *  source, or crypto/gold/fiat whose symbols aren't derivable from the
 *  ticker) — callers should leave the field untouched in that case. */
export function derivePriceId(
  ticker: string,
  category: string,
  priceSource: string,
): string | null {
  if (priceSource !== "yahoo") return null
  const t = canonicalizeTicker(ticker)
  if (!t) return null
  if (category === "stock_bist") {
    return t.endsWith(BIST_YAHOO_SUFFIX) ? t : `${t}${BIST_YAHOO_SUFFIX}`
  }
  if (category === "stock_us") return t
  return null
}
