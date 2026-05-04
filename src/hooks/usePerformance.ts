import { useMemo } from "react"
import {
  filterByTimeRange,
  computePerformanceMetrics,
  computeCategoryAttribution,
  type TimeRange,
  type PerformanceMetrics,
  type CategoryAttributionRow,
} from "@/lib/performance"
import type { Snapshot, Transaction, ExchangeRate } from "@/types/database"
import type { AssetPnL } from "@/lib/pnl/types"

interface UsePerformanceArgs {
  snapshots: Snapshot[]
  timeRange: TimeRange
  assetPnLs: AssetPnL[]
  transactions: Transaction[]
  rates: ExchangeRate[]
  totalInvestedUsd: number
  totalPnlUsd: number
  currentValueUsd: number
}

interface UsePerformanceResult extends PerformanceMetrics {
  filteredSnapshots: Snapshot[]
  categoryAttribution: CategoryAttributionRow[]
}

export function usePerformance({
  snapshots,
  timeRange,
  assetPnLs,
  transactions,
  rates,
  totalInvestedUsd,
  totalPnlUsd,
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
        totalPnlUsd,
        currentValueUsd,
      }),
    [
      filtered,
      transactions,
      rates,
      totalInvestedUsd,
      totalPnlUsd,
      currentValueUsd,
    ],
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
  }
}
