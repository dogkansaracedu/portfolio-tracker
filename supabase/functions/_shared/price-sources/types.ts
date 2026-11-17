/** Shared vocabulary for the price-source fetchers. No IO. */

/** Values of `asset_price_sources.source` (the table's check constraint). */
export type PriceSourceName =
  | "paribu_crypto"
  | "paribu_us"
  | "paribu_bist"
  | "yahoo"
  | "tefas"

/** A quote in the currency the source reports it in; `splitPrice` turns it
 *  into the price_cache USD/TRY columns. */
export interface SourceQuote {
  price: number
  currency: string
}

/** One symbol's outcome: a quote, or a short error message (stored as
 *  `asset_price_sources.last_error`, so it never repeats the symbol). */
export type SourceResult = { ok: true; quote: SourceQuote } | { ok: false; error: string }

/** Fetches many symbols of one source in one go. Must never throw: every
 *  requested symbol gets a result (missing ones as errors). */
export type SourceFetcher = (symbols: string[]) => Promise<Map<string, SourceResult>>

export const ok = (quote: SourceQuote): SourceResult => ({ ok: true, quote })
export const fail = (error: string): SourceResult => ({ ok: false, error })

export const errorMessage = (err: unknown): string =>
  err instanceof Error ? err.message : String(err)
