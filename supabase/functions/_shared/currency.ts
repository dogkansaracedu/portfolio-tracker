/** Currency handling shared by the price-fetch edge functions. The currency a
 *  price is quoted in comes from the source (Yahoo `meta.currency`), never from
 *  a ticker-suffix guess. */

export interface ConversionRates {
  usdTry: number | null
  eurUsd: number | null
}

export interface PriceColumns {
  price_usd: number | null
  price_try: number | null
}

/**
 * Split a source-currency price into the `price_cache` columns, keeping the
 * native value as the source of truth wherever a column exists (USD, TRY):
 *
 *   USD → price_usd = p (raw),       price_try = p × usdTry
 *   TRY → price_usd = p ÷ usdTry,    price_try = p (raw)
 *   EUR → price_usd = p × eurUsd,    price_try = p × eurUsd × usdTry
 *
 * Returns `null` for an unsupported currency (e.g. `GBp` = pence) so callers
 * fail loud and never mislabel a foreign price as USD. A missing rate yields
 * `null` for the column it can't compute, matching the existing guard-on-rate
 * behavior.
 */
export function splitPrice(
  price: number,
  currency: string,
  rates: ConversionRates,
): PriceColumns | null {
  const { usdTry, eurUsd } = rates
  switch (currency) {
    case "USD":
      return { price_usd: price, price_try: usdTry ? price * usdTry : null }
    case "TRY":
      return { price_usd: usdTry ? price / usdTry : null, price_try: price }
    case "EUR": {
      const priceUsd = eurUsd ? price * eurUsd : null
      return {
        price_usd: priceUsd,
        price_try: priceUsd != null && usdTry ? priceUsd * usdTry : null,
      }
    }
    default:
      // Unsupported (e.g. GBp = pence). Caller skips the upsert + logs.
      return null
  }
}

/** Pick the asset category from the quote currency. Replaces the `.IS` suffix
 *  guess: a TRY quote is a BIST listing, anything else is treated as US. */
export function categoryForQuote(currency: string): "stock_us" | "stock_bist" {
  return currency === "TRY" ? "stock_bist" : "stock_us"
}
