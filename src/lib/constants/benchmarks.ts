// Benchmark indices overlaid on the dashboard P&L chart. A benchmark is
// always selected (default = SPY) — the chart's right Y-axis is calibrated
// against the portfolio's period-start value and the grey line always
// renders. Tickers must match what `fetch-benchmark-history` upserts into
// `benchmark_prices`; keep the two in sync.

// Legacy sentinel kept only to migrate users whose persisted state still
// holds "none" from an earlier build — `findBenchmark` falls back to the
// default when it sees this.
export const BENCHMARK_NONE = "none" as const

export interface BenchmarkOption {
  /** Ticker stored in `benchmark_prices.ticker`. */
  id: string
  /** Short label for the dropdown chip (e.g. "S&P 500"). */
  label: string
  /** Long-form name for the tooltip / legend. */
  fullName: string
}

export const BENCHMARKS: readonly BenchmarkOption[] = [
  { id: "SPY", label: "S&P 500", fullName: "S&P 500 (SPY)" },
  { id: "QQQ", label: "NASDAQ", fullName: "NASDAQ 100 (QQQ)" },
] as const

export const DEFAULT_BENCHMARK_ID = BENCHMARKS[0].id

export function findBenchmark(id: string | null): BenchmarkOption {
  if (!id || id === BENCHMARK_NONE) return BENCHMARKS[0]
  return BENCHMARKS.find((b) => b.id === id) ?? BENCHMARKS[0]
}
