import { supabase } from "@/lib/supabase"
import type { ExchangeRate } from "@/types/database"

export async function fetchLatestRates(): Promise<ExchangeRate | null> {
  const { data, error } = await supabase
    .from("exchange_rates")
    .select("*")
    .order("date", { ascending: false })
    .limit(1)
    .single()

  if (error) {
    if (error.code === "PGRST116") return null // no rows
    throw new Error(`Failed to fetch latest rates: ${error.message}`)
  }

  return data
}

export async function fetchRateForDate(
  date: string
): Promise<ExchangeRate | null> {
  const { data, error } = await supabase
    .from("exchange_rates")
    .select("*")
    .lte("date", date)
    .order("date", { ascending: false })
    .limit(1)
    .single()

  if (error) {
    if (error.code === "PGRST116") return null // no rows
    throw new Error(`Failed to fetch rate for ${date}: ${error.message}`)
  }

  return data
}
