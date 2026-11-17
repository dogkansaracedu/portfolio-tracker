/**
 * The fetcher for every `asset_price_sources.source`, wired for one
 * fetch-prices run (Paribu bulk lists are fetched at most once per run, and
 * only if some due asset needs that market).
 */
import { fetchTefasQuote } from "../tefas.ts"
import { fetchYahooQuote } from "../yahoo.ts"
import { paribuCryptoFetcher, paribuStockFetcher } from "./paribu.ts"
import { errorMessage, fail, ok, type PriceSourceName, type SourceFetcher, type SourceResult } from "./types.ts"

export type { PriceSourceName, SourceFetcher, SourceQuote, SourceResult } from "./types.ts"
export { resolvePrices, type PriceTarget, type SourceRow } from "./resolve.ts"

/** Human label for the response's `errors` lines. */
export const SOURCE_LABEL: Record<PriceSourceName, string> = {
  paribu_crypto: "Paribu crypto",
  paribu_us: "Paribu US",
  paribu_bist: "Paribu BIST",
  yahoo: "Yahoo",
  tefas: "TEFAS",
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

type QuoteFn = (symbol: string) => Promise<{
  status: number | null
  quote: { price: number | null; currency: string } | null
}>

/** One symbol at a time, `spacingMs` between actual requests (Yahoo and TEFAS
 *  are gentle-use endpoints). The underlying clients never throw. */
function sequentialFetcher(quoteFn: QuoteFn, spacingMs: number, noPrice: string): SourceFetcher {
  let fetchedAny = false
  return async (symbols) => {
    const out = new Map<string, SourceResult>()
    for (const s of symbols) {
      if (fetchedAny) await sleep(spacingMs)
      fetchedAny = true
      try {
        const { status, quote } = await quoteFn(s)
        if (!quote) out.set(s, fail(status === null ? "request failed" : `HTTP ${status}`))
        else if (quote.price == null) out.set(s, fail(noPrice))
        else out.set(s, ok({ price: quote.price, currency: quote.currency }))
      } catch (err) {
        out.set(s, fail(errorMessage(err)))
      }
    }
    return out
  }
}

export function createFetchers(): Record<PriceSourceName, SourceFetcher> {
  return {
    paribu_crypto: paribuCryptoFetcher(),
    paribu_us: paribuStockFetcher("us"),
    paribu_bist: paribuStockFetcher("bist"),
    yahoo: sequentialFetcher(fetchYahooQuote, 1000, "no price in response"),
    tefas: sequentialFetcher(fetchTefasQuote, 1000, "no NAV in response"),
  }
}
