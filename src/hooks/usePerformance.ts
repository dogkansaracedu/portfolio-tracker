import { useMemo } from "react"
import {
  filterByTimeRange,
  computePerformanceMetrics,
  computeCategoryAttribution,
  type TimeRange,
  type PerformanceMetrics,
  type CategoryAttributionRow,
} from "@/lib/performance"
import { computeLifetimeMwrCumulativePct } from "@/lib/mwr"
import { homeDayIso } from "@/lib/config"
import type { Snapshot, Transaction, ExchangeRate } from "@/types/database"
import type { AssetPnL } from "@/lib/pnl/types"

interface UsePerformanceArgs {
  snapshots: Snapshot[]
  timeRange: TimeRange
  assetPnLs: AssetPnL[]
  transactions: Transaction[]
  rates: ExchangeRate[]
  totalInvestedUsd: number
  currentValueUsd: number
}

interface UsePerformanceResult extends PerformanceMetrics {
  filteredSnapshots: Snapshot[]
  categoryAttribution: CategoryAttributionRow[]
  /** Lifetime cumulative money-weighted (XIRR) return % — the All-Time Return
   *  tile. Null when the solver has no answer. */
  allTimeMwrPct: number | null
}

export function usePerformance({
  snapshots,
  timeRange,
  assetPnLs,
  transactions,
  rates,
  totalInvestedUsd,
  currentValueUsd,
}: UsePerformanceArgs): UsePerformanceResult {
  const filtered = useMemo(
    () => filterByTimeRange(snapshots, timeRange),
    [snapshots, timeRange],
  )

  const metrics: PerformanceMetrics = useMemo(
    () =>
      computePerformanceMetrics({
        snapshots: filtered,
        transactions,
        rates,
        totalInvestedUsd,
        currentValueUsd,
      }),
    [filtered, transactions, rates, totalInvestedUsd, currentValueUsd],
  )

  // All-Time Return = lifetime cumulative MWR — same lens as the Portfolio
  // headline % and the per-asset %.
  const allTimeMwrPct = useMemo(
    () =>
      computeLifetimeMwrCumulativePct(
        transactions,
        rates,
        currentValueUsd,
        homeDayIso(),
      ),
    [transactions, rates, currentValueUsd],
  )

  // Category attribution is portfolio-wide and time-range independent: it
  // shows where your gains came from across your entire holding history.
  const categoryAttribution = useMemo(
    () => computeCategoryAttribution(assetPnLs),
    [assetPnLs],
  )

  return {
    ...metrics,
    categoryAttribution,
    filteredSnapshots: filtered,
    allTimeMwrPct,
  }
}
