import { useState } from "react"
import { useSnapshots } from "@/hooks/useSnapshots"
import { usePerformance } from "@/hooks/usePerformance"
import { useAssets } from "@/hooks/useAssets"
import { usePrices } from "@/hooks/usePrices"
import { useDisplayCurrency } from "@/contexts/DisplayContext"
import { TimeRangeSelector } from "@/components/performance/TimeRangeSelector"
import { PerformanceSummary } from "@/components/performance/PerformanceSummary"
import { PortfolioValueChart } from "@/components/performance/PortfolioValueChart"
import { MonthlyReturnsChart } from "@/components/performance/MonthlyReturnsChart"
import { CategoryAttribution } from "@/components/performance/CategoryAttribution"
import { DrawdownChart } from "@/components/performance/DrawdownChart"
import { SnapshotManager } from "@/components/performance/SnapshotManager"
import { Card, CardContent } from "@/components/ui/card"
import type { TimeRange } from "@/lib/performance"

export default function PerformancePage() {
  const [timeRange, setTimeRange] = useState<TimeRange>("ALL")
  const { snapshots, takeSnapshot, removeSnapshot } = useSnapshots()
  const { assets } = useAssets()
  const { prices, rates } = usePrices()
  const { currency } = useDisplayCurrency()

  const latestRates = rates ?? null

  const {
    monthlyReturns,
    filteredSnapshots,
    categoryAttribution,
    drawdownSeries,
    ...metrics
  } = usePerformance(snapshots, timeRange)

  // Current total from latest snapshot or 0
  const currentValueUsd =
    snapshots.length > 0
      ? (snapshots[snapshots.length - 1].total_usd ?? 0)
      : 0

  const hasEnoughData = snapshots.length >= 2

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Performance</h1>
          <p className="text-muted-foreground">
            Track your portfolio performance over time.
          </p>
        </div>
        <TimeRangeSelector value={timeRange} onChange={setTimeRange} />
      </div>

      {!hasEnoughData ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12">
            <p className="text-lg font-medium">
              {snapshots.length === 0
                ? "Take your first snapshot"
                : "Take one more snapshot"}
            </p>
            <p className="text-center text-sm text-muted-foreground">
              {snapshots.length === 0
                ? "Snapshots capture your portfolio state. Take at least 2 to see performance trends."
                : "You have 1 snapshot. Take another to start comparing performance."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Summary stats */}
          <PerformanceSummary
            metrics={{ monthlyReturns, drawdownSeries, ...metrics }}
            currentValueUsd={currentValueUsd}
            currency={currency}
          />

          {/* Portfolio value chart */}
          <PortfolioValueChart
            snapshots={filteredSnapshots}
            currency={currency}
          />

          {/* Monthly returns + Category attribution */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <MonthlyReturnsChart returns={monthlyReturns} />
            <CategoryAttribution data={categoryAttribution} />
          </div>

          {/* Drawdown */}
          <DrawdownChart data={drawdownSeries} />
        </>
      )}

      {/* Snapshot manager */}
      <SnapshotManager
        snapshots={snapshots}
        assets={assets}
        prices={prices}
        latestRates={latestRates}
        onTakeSnapshot={takeSnapshot}
        onDeleteSnapshot={removeSnapshot}
      />
    </div>
  )
}
