/**
 * Pure helpers for the watchlist (Takip listesi): which catalog assets the
 * add flow offers for a query, and how a watched asset becomes the row the
 * shared `buildWatchlist` formula reads. No IO.
 */
import type { WatchlistAsset } from "@/types/database"
import {
  quoteCurrency,
  type WidgetWatchItem,
} from "../../supabase/functions/_shared/widget.ts"

/** Fold case and Turkish letters so "altin" finds "Gram Altın". */
export function foldSearchText(text: string): string {
  return text
    .toLocaleLowerCase("tr")
    .replace(/ı/g, "i")
    .replace(/ş/g, "s")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
}

/**
 * Catalog assets the add flow offers: active, not a currency (cash prices as
 * 1 unit of itself — nothing to follow), not already watched, and matching
 * the query on ticker or name. An empty query lists them all.
 * Order: exact ticker, ticker prefix, then any other match; ties keep the
 * catalog's order.
 */
export function filterCatalog<
  A extends {
    id: string
    ticker: string
    name: string
    is_active: boolean
    is_currency: boolean
  },
>(assets: A[], query: string, watchedIds: Set<string>): A[] {
  const q = foldSearchText(query.trim())
  const rank = (a: A): number => {
    if (!q) return 0
    const ticker = foldSearchText(a.ticker)
    if (ticker === q) return 0
    if (ticker.startsWith(q)) return 1
    if (ticker.includes(q) || foldSearchText(a.name).includes(q)) return 2
    return -1
  }
  return assets
    .filter((a) => a.is_active && !a.is_currency && !watchedIds.has(a.id))
    .map((a, index) => ({ a, index, r: rank(a) }))
    .filter((x) => x.r >= 0)
    .sort((x, y) => x.r - y.r || x.index - y.index)
    .map((x) => x.a)
}

/** A watched asset as `buildWatchlist` reads it: price key `price_id ??
 *  ticker`, shown in the asset's quote currency. */
export function watchItemFromAsset(asset: WatchlistAsset): WidgetWatchItem {
  return {
    ticker: asset.ticker,
    name: asset.name,
    price_id: asset.price_id ?? asset.ticker,
    currency: quoteCurrency(asset),
  }
}
