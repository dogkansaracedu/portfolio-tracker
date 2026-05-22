import { useEffect, useState } from "react"
import { fetchBenchmarkSeries } from "@/lib/queries/benchmarks"
import type { BenchmarkPrice } from "@/types/database"

export interface UseBenchmarkResult {
  /** Daily closes ordered oldest → newest. Empty until loaded or when no
   *  ticker is selected (caller passes `null`). */
  series: BenchmarkPrice[]
  loading: boolean
  error: string | null
}

interface LoadedSeries {
  ticker: string
  series: BenchmarkPrice[]
}

/**
 * Lazy-loaded benchmark series for the dashboard hero's vs-Market overlay.
 *
 * Returns an empty series until `ticker` is non-null so users who never
 * pick a benchmark don't pay the round trip. State updates happen inside
 * an async IIFE — that defers them past the effect body and keeps the
 * `react-hooks/set-state-in-effect` rule satisfied (same pattern as
 * TransactionDataContext).
 */
export function useBenchmark(ticker: string | null): UseBenchmarkResult {
  const [loaded, setLoaded] = useState<LoadedSeries | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      if (!ticker) return
      if (!cancelled) {
        setLoading(true)
        setError(null)
      }
      try {
        const data = await fetchBenchmarkSeries(ticker)
        if (!cancelled) setLoaded({ ticker, series: data })
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err))
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [ticker])

  // Match-the-current-ticker guard: avoids flashing stale series when the
  // user toggles between SPY → QQQ before the second fetch resolves.
  const series = ticker && loaded?.ticker === ticker ? loaded.series : []

  return {
    series,
    loading: !!ticker && loading,
    error: ticker ? error : null,
  }
}
