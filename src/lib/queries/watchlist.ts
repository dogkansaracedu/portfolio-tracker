import { supabase } from "@/lib/supabase"
import type { WatchlistItemInsert, WatchlistRow } from "@/types/database"
import { WATCHLIST_TABLE } from "@/lib/constants/watchlist"

/** Each item with the catalog asset it follows (display fields + price key). */
const WATCHLIST_SELECT =
  "id, user_id, asset_id, sort_order, created_at, asset:assets(id, ticker, name, category, price_id, icon_url)"

/** The user's watchlist in their order (RLS scopes it to them). */
export async function fetchWatchlist(): Promise<WatchlistRow[]> {
  const { data, error } = await supabase
    .from(WATCHLIST_TABLE)
    .select(WATCHLIST_SELECT)
    .order("sort_order")
    .order("created_at")
  if (error) throw error
  return (data ?? []) as unknown as WatchlistRow[]
}

export async function addWatchlistItem(
  item: WatchlistItemInsert,
): Promise<WatchlistRow> {
  const { data, error } = await supabase
    .from(WATCHLIST_TABLE)
    .insert(item)
    .select(WATCHLIST_SELECT)
    .single()
  if (error) throw error
  return data as unknown as WatchlistRow
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
