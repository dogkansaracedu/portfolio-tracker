import { supabase } from "@/lib/supabase"
import type { WatchlistItem, WatchlistItemInsert } from "@/types/database"
import {
  SYMBOL_SEARCH_FUNCTION,
  WATCHLIST_TABLE,
} from "@/lib/constants/watchlist"
import type { SymbolMatch } from "../../../supabase/functions/_shared/symbol-search.ts"

export type { SymbolMatch }

/** The user's watchlist in their order (RLS scopes it to them). */
export async function fetchWatchlist(): Promise<WatchlistItem[]> {
  const { data, error } = await supabase
    .from(WATCHLIST_TABLE)
    .select("*")
    .order("sort_order")
    .order("created_at")
  if (error) throw error
  return (data ?? []) as WatchlistItem[]
}

export async function addWatchlistItem(
  item: WatchlistItemInsert,
): Promise<WatchlistItem> {
  const { data, error } = await supabase
    .from(WATCHLIST_TABLE)
    .insert(item)
    .select()
    .single()
  if (error) throw error
  return data as WatchlistItem
}

export async function removeWatchlistItem(id: string): Promise<void> {
  const { error } = await supabase.from(WATCHLIST_TABLE).delete().eq("id", id)
  if (error) throw error
}

/** Persist a new order: each changed row gets its index as `sort_order`. */
export async function saveWatchlistOrder(
  changed: { id: string; sort_order: number }[],
): Promise<void> {
  const results = await Promise.all(
    changed.map(({ id, sort_order }) =>
      supabase.from(WATCHLIST_TABLE).update({ sort_order }).eq("id", id),
    ),
  )
  const failed = results.find((r) => r.error)
  if (failed?.error) throw failed.error
}

/** Symbol search for the add flow — `resolve-tickers` with `{ query }`. Runs
 *  with the signed-in user's session. */
export async function searchSymbols(query: string): Promise<SymbolMatch[]> {
  const { data, error } = await supabase.functions.invoke<{
    results: SymbolMatch[]
  }>(SYMBOL_SEARCH_FUNCTION, { body: { query } })
  if (error) throw error
  return data?.results ?? []
}
