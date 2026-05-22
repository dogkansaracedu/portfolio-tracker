import { supabase } from "@/lib/supabase"
import type { BenchmarkPrice } from "@/types/database"

/**
 * Fetch the full daily-close series for one benchmark ticker, ordered
 * oldest → newest. Returned as a tightly-typed array so the caller can
 * binary-search by date when normalising returns to a range start.
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
    .order("date", { ascending: true })

  if (error) {
    throw new Error(
      `Failed to fetch benchmark series for ${ticker}: ${error.message}`,
    )
  }

  return data ?? []
}
