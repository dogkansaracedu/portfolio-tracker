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

/** Trigger the fetch-historical-rate edge function for one date (best-effort). */
async function invokeFetchHistoricalRate(day: string): Promise<void> {
  try {
    await supabase.functions.invoke("fetch-historical-rate", {
      body: { date: day },
    })
  } catch (err) {
    console.warn("fetch-historical-rate failed:", err)
  }
}

/**
 * If a transaction is denominated in a non-USD currency, ensure
 * `exchange_rates` carries the TCMB rate for that day so cost-basis
 * conversions use the day's real rate instead of degrading to the nearest
 * known one. Fire-and-await before refreshing data; failures are non-fatal —
 * the transaction is already saved and conversion falls back to the nearest
 * rate (see getExchangeRateForDate).
 */
export async function ensureHistoricalRate(
  priceCurrency: string | null | undefined,
  feeCurrency: string | null | undefined,
  date: string | null | undefined,
): Promise<void> {
  const isNonUsd = (c: string | null | undefined) =>
    !!c && c.toUpperCase() !== "USD"
  if (!isNonUsd(priceCurrency) && !isNonUsd(feeCurrency)) return
  const day = (date ?? "").slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return
  await invokeFetchHistoricalRate(day)
}

/**
 * Backfill TCMB rates for a set of dates already known to need them (the
 * non-USD bulk-import path, which has no per-row ensureHistoricalRate). Runs
 * the fetches in parallel and never throws — a failed fetch leaves the
 * nearest-known-rate fallback in place.
 */
export async function ensureHistoricalRatesForDates(
  dates: Iterable<string>,
): Promise<void> {
  const valid = [...new Set(dates)].filter((d) =>
    /^\d{4}-\d{2}-\d{2}$/.test(d),
  )
  if (valid.length === 0) return
  await Promise.allSettled(valid.map(invokeFetchHistoricalRate))
}
