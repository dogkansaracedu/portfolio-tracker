import { useMemo } from "react"
import {
  filterByTimeRange,
  computePerformanceMetrics,
  computeCategoryAttribution,
  type TimeRange,
  type PerformanceMetrics,
} from "@/lib/performance"
import type { Snapshot } from "@/types/database"

export function usePerformance(snapshots: Snapshot[], timeRange: TimeRange) {
  const filtered = useMemo(
    () => filterByTimeRange(snapshots, timeRange),
    [snapshots, timeRange],
  )

  const metrics: PerformanceMetrics = useMemo(
    () => computePerformanceMetrics(filtered),
    [filtered],
  )

  const categoryAttribution = useMemo(() => {
    if (filtered.length < 2) return []
    return computeCategoryAttribution(filtered[0], filtered[filtered.length - 1])
  }, [filtered])

  return {
    ...metrics,
    categoryAttribution,
    filteredSnapshots: filtered,
  }
}
