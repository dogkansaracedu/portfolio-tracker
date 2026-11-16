/**
 * Watchlist symbol search — the pure half. `resolve-tickers` turns one typed
 * query ("AAPL", "THYAO", "BTC", "altın", "USDTRY", a TEFAS code) into the
 * provider keys worth trying, fetches them with the existing quote clients and
 * maps each hit to the asset pricing vocabulary (category / price_source /
 * price_id). No IO and no Deno globals here, so Vitest imports this module
 * (`src/lib/queries/symbol-search.test.ts`).
 */

import { categoryForQuote } from "./currency.ts"
import type { YahooQuote } from "./yahoo.ts"

/** The currency a watched price is shown in. price_cache holds only USD + TRY,
 *  so a TRY quote shows in TRY and everything else (USD, EUR) in USD — the
 *  same fallback the portfolio row uses. */
export type WatchCurrency = "USD" | "TRY"

export interface SymbolMatch {
  /** Display symbol (THYAO, BTC, USDTRY) — never used to fetch. */
  ticker: string
  name: string
  /** Same values as `assets.category`. */
  category: string
  price_source: "yahoo" | "tcmb" | "tefas"
  /** Price-fetch key = the price_cache key. */
  price_id: string
  currency: WatchCurrency
  /** Current price in `currency`, or null when the source returned none. */
  price: number | null
}

/** Physical gram gold — priced by the central-bank FX step of fetch-prices
 *  (TRY). Mirrors `PHYSICAL_GOLD_TICKER` (separate runtime). */
export const GOLD_GRAM_KEY = "XAU_GRAM"

/** Queries that mean gram gold (after upper-casing; "altın" → "ALTIN"). */
const GOLD_ALIASES = new Set(["ALTIN", "ALTIN GRAM", "GRAM ALTIN", "GOLD", "XAU", GOLD_GRAM_KEY])

const BIST_SUFFIX = ".IS"
const CRYPTO_SUFFIX = "-USD"
const FX_SUFFIX = "=X"

/** Upper-cased, trimmed, inner whitespace collapsed. `toUpperCase` (not the
 *  Turkish locale) so "altın" and "altin" both become "ALTIN". */
export function normalizeQuery(query: string): string {
  return query.trim().replace(/\s+/g, " ").toUpperCase()
}

export function isGoldQuery(q: string): boolean {
  return GOLD_ALIASES.has(q)
}

/**
 * Yahoo symbols to try for a query, most literal first. A query that already
 * carries a Yahoo marker (`.IS`, `-USD`, `=X`, `^`) is tried as-is only;
 * otherwise the bare symbol (US listing), its BIST listing, its USD crypto
 * pair and — for six letters — the FX pair.
 */
export function yahooCandidates(q: string): string[] {
  if (!/^[A-Z0-9.\-=^]{1,20}$/.test(q)) return []
  if (/[.\-=^]/.test(q)) return [q]
  const out = [q, `${q}${BIST_SUFFIX}`, `${q}${CRYPTO_SUFFIX}`]
  if (/^[A-Z]{6}$/.test(q)) out.push(`${q}${FX_SUFFIX}`)
  return out
}

/** TEFAS fund codes are three letters/digits (TP2, TI1, AFT). */
export function isTefasCode(q: string): boolean {
  return /^[A-Z0-9]{3}$/.test(q)
}

/** The display symbol for a Yahoo key: THYAO.IS → THYAO, BTC-USD → BTC,
 *  USDTRY=X → USDTRY. */
export function displayTicker(symbol: string): string {
  for (const suffix of [BIST_SUFFIX, CRYPTO_SUFFIX, FX_SUFFIX]) {
    if (symbol.endsWith(suffix) && symbol.length > suffix.length) {
      return symbol.slice(0, -suffix.length)
    }
  }
  return symbol
}

export function watchCurrency(sourceCurrency: string): WatchCurrency {
  return sourceCurrency === "TRY" ? "TRY" : "USD"
}

/** Asset category for a Yahoo quote: from the source's own instrument type and
 *  currency, never from the symbol. Equities/ETFs/indices follow
 *  `categoryForQuote` (TRY → BIST, which also gates refreshes on BIST hours). */
export function yahooCategory(quote: Pick<YahooQuote, "instrumentType" | "currency">): string {
  if (quote.instrumentType === "CRYPTOCURRENCY") return "crypto"
  if (quote.instrumentType === "CURRENCY") return "fiat"
  return categoryForQuote(quote.currency)
}

/** One Yahoo hit as a match. `split` is the price in the cache's two columns
 *  (null = unsupported currency → not offered). */
export function yahooMatch(
  symbol: string,
  quote: YahooQuote,
  split: { price_usd: number | null; price_try: number | null } | null,
): SymbolMatch | null {
  if (!split) return null
  const currency = watchCurrency(quote.currency)
  return {
    ticker: displayTicker(symbol),
    name: quote.name,
    category: yahooCategory(quote),
    price_source: "yahoo",
    price_id: symbol,
    currency,
    price: currency === "TRY" ? split.price_try : split.price_usd,
  }
}

export function tefasMatch(code: string, name: string, nav: number | null): SymbolMatch {
  return {
    ticker: code,
    name,
    category: "fund",
    price_source: "tefas",
    price_id: code,
    currency: "TRY",
    price: nav,
  }
}

export function goldGramMatch(priceTry: number | null): SymbolMatch {
  return {
    ticker: GOLD_GRAM_KEY,
    name: "Gram altın",
    category: "gold",
    price_source: "tcmb",
    price_id: GOLD_GRAM_KEY,
    currency: "TRY",
    price: priceTry,
  }
}
