import { supabase } from "@/lib/supabase"
import type { PriceCache } from "@/types/database"

export async function fetchPrices(): Promise<Record<string, PriceCache>> {
  const { data, error } = await supabase.from("price_cache").select("*")

  if (error) {
    throw new Error(`Failed to fetch prices: ${error.message}`)
  }

  const map: Record<string, PriceCache> = {}
  for (const row of data ?? []) {
    map[row.ticker] = row
  }
  return map
}

export async function fetchPrice(ticker: string): Promise<PriceCache | null> {
  const { data, error } = await supabase
    .from("price_cache")
    .select("*")
    .eq("ticker", ticker)
    .single()

  if (error) {
    if (error.code === "PGRST116") return null // not found
    throw new Error(`Failed to fetch price for ${ticker}: ${error.message}`)
  }

  return data
}

