import { supabase } from "@/lib/supabase"
import type { Transaction, ExchangeRate } from "@/types/database"

/**
 * Fetch all transactions for a single asset, ordered by date ASC.
 * Used for FIFO calculation on one asset.
 */
export async function fetchTransactionsForPnL(
  assetId: string,
): Promise<Transaction[]> {
  const { data, error } = await supabase
    .from("transactions")
    .select("*")
    .eq("asset_id", assetId)
    .order("date", { ascending: true })
    .order("created_at", { ascending: true })

  if (error) throw error
  return data ?? []
}

/**
 * Fetch all transactions for all assets of a user, ordered by asset_id then date ASC.
 * Used for full portfolio P&L computation.
 */
export async function fetchTransactionsForAllAssets(
  userId: string,
): Promise<Transaction[]> {
  const { data, error } = await supabase
    .from("transactions")
    .select("*")
    .eq("user_id", userId)
    .order("asset_id", { ascending: true })
    .order("date", { ascending: true })
    .order("created_at", { ascending: true })

  if (error) throw error
  return data ?? []
}

/**
 * Fetch all exchange rates, sorted by date ASC.
 * This table is small (one row per day) — fetch all and cache in memory.
 */
export async function fetchAllExchangeRates(): Promise<ExchangeRate[]> {
  const { data, error } = await supabase
    .from("exchange_rates")
    .select("*")
    .order("date", { ascending: true })

  if (error) throw error
  return data ?? []
}
