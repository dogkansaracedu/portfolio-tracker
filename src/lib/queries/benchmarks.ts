import { supabase } from "@/lib/supabase"
import type { BenchmarkPrice } from "@/types/database"

/**
 * Fetch the daily-close series for one benchmark ticker, ordered
 * oldest → newest.
 *
 * We query DESC (most recent first) because Supabase Cloud caps each
 * request at 1000 rows (the `max-rows` PostgREST setting). With an ASC
 * order we'd get 2016 → 2020 — useless for a 2026 chart. DESC gives us
 * the most recent ~1000 trading days (~4 years), which covers every
 * chart range up to "ALL" for portfolios newer than that. After fetch
 * we reverse client-side so callers can keep the ascending-walk
 * contract (`closesAtOrBefore` etc.).
 *
 * Empty array (not null) when the ticker is unknown — keeps consumers
 * branchless.
 */
export async function fetchBenchmarkSeries(
  ticker: string,
): Promise<BenchmarkPrice[]> {
  const { data, error } = await supabase
    .from("benchmark_prices")
    .select("*")
    .eq("ticker", ticker)
    .order("date", { ascending: false })

  if (error) {
    throw new Error(
      `Failed to fetch benchmark series for ${ticker}: ${error.message}`,
    )
  }

  return [...(data ?? [])].reverse()
}
