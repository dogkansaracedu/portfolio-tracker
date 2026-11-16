import type { SupabaseClient } from "jsr:@supabase/supabase-js@2"
import { fetchYahooQuote } from "../_shared/yahoo.ts"
import { fetchTefasQuote } from "../_shared/tefas.ts"
import { splitPrice } from "../_shared/currency.ts"
import {
  GOLD_GRAM_KEY,
  goldGramMatch,
  isGoldQuery,
  isTefasCode,
  normalizeQuery,
  tefasMatch,
  yahooCandidates,
  yahooMatch,
  type SymbolMatch,
} from "../_shared/symbol-search.ts"

const MAX_QUERY_LENGTH = 40

/**
 * Watchlist symbol search (`{ query }` body). Tries every plausible provider
 * key for the query at once — a handful of single-quote fetches through the
 * same clients the price engine uses — and returns the hits in the asset
 * pricing vocabulary. Each hit's price is written to `price_cache` under its
 * key (as the ticker resolve path does), so a picked symbol shows a price
 * before the next refresh. Gram gold comes from the cache (the FX step owns it).
 */
export async function searchSymbols(
  supabase: SupabaseClient,
  rawQuery: string,
): Promise<SymbolMatch[]> {
  const q = normalizeQuery(rawQuery.slice(0, MAX_QUERY_LENGTH))
  if (!q) return []

  if (isGoldQuery(q)) {
    const { data } = await supabase
      .from("price_cache")
      .select("price_try")
      .eq("ticker", GOLD_GRAM_KEY)
      .maybeSingle()
    const p = data?.price_try == null ? null : Number(data.price_try)
    return [goldGramMatch(p)]
  }

  const { data: rateRow } = await supabase
    .from("exchange_rates")
    .select("usd_try, eur_usd")
    .order("date", { ascending: false })
    .limit(1)
    .maybeSingle()
  const rates = { usdTry: rateRow?.usd_try ?? null, eurUsd: rateRow?.eur_usd ?? null }
  const nowIso = new Date().toISOString()

  const yahoo = yahooCandidates(q).map(async (symbol) => {
    const { quote } = await fetchYahooQuote(symbol)
    if (!quote) return null
    const split = quote.price == null ? { price_usd: null, price_try: null } : splitPrice(quote.price, quote.currency, rates)
    const match = yahooMatch(symbol, quote, split)
    if (match && split && quote.price != null) {
      await cachePrice(supabase, symbol, split, "yahoo", nowIso)
    }
    return match
  })

  const tefas = isTefasCode(q)
    ? [
        (async () => {
          const { quote } = await fetchTefasQuote(q)
          if (!quote) return null
          if (quote.price != null) {
            const split = splitPrice(quote.price, quote.currency, rates)
            if (split) await cachePrice(supabase, q, split, "tefas", nowIso)
          }
          return tefasMatch(q, quote.name, quote.price)
        })(),
      ]
    : []

  const settled = await Promise.allSettled([...yahoo, ...tefas])
  const seen = new Set<string>()
  const out: SymbolMatch[] = []
  for (const r of settled) {
    if (r.status !== "fulfilled" || !r.value || seen.has(r.value.price_id)) continue
    seen.add(r.value.price_id)
    out.push(r.value)
  }
  return out
}

async function cachePrice(
  supabase: SupabaseClient,
  key: string,
  split: { price_usd: number | null; price_try: number | null },
  source: string,
  nowIso: string,
): Promise<void> {
  const { error } = await supabase.from("price_cache").upsert(
    { ticker: key, price_usd: split.price_usd, price_try: split.price_try, source, updated_at: nowIso },
    { onConflict: "ticker" },
  )
  if (error) console.error(`symbol search: price_cache upsert failed for ${key}:`, error)
}
