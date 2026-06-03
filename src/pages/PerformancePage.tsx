import { Suspense, useState } from "react"
import { useHoldings } from "@/hooks/useHoldings"
import { useSnapshots } from "@/hooks/useSnapshots"
import { usePerformance } from "@/hooks/usePerformance"
import { usePrices } from "@/hooks/usePrices"
import { usePnL } from "@/hooks/usePnL"
import { useDisplayCurrency } from "@/contexts/DisplayContext"
import { TimeRangeSelector } from "@/components/performance/TimeRangeSelector"
import { PerformanceSummary } from "@/components/performance/PerformanceSummary"
import {
  PortfolioValueChart,
  MonthlyReturnsChart,
  DrawdownChart,
} from "@/components/charts/LazyChart"
import RouteSkeleton from "@/components/layout/RouteSkeleton"
import { CategoryAttribution } from "@/components/performance/CategoryAttribution"
import { SnapshotManager } from "@/components/performance/SnapshotManager"
import { Card, CardContent } from "@/components/ui/card"
import type { TimeRange } from "@/lib/performance"

export default function PerformancePage() {
  const [timeRange, setTimeRange] = useState<TimeRange>("ALL")
  const { holdings } = useHoldings()
  const { snapshots, takeSnapshot, removeSnapshot } = useSnapshots()
  const { prices, rates } = usePrices()
  const { currency } = useDisplayCurrency()

  const latestRates = rates ?? null

  const {
    assetPnLs,
    totalUnrealizedPnlUsd,
    totalRealizedPnlUsd,
    totalInvestedUsd,
    totalCurrentValueUsd,
    transactions,
    rates: pnlRates,
  } = usePnL(holdings, prices)

  const totalPnlUsd = totalUnrealizedPnlUsd.plus(totalRealizedPnlUsd).toNumber()
  const totalInvestedNum = totalInvestedUsd.toNumber()
  const currentValueNum = totalCurrentValueUsd.toNumber()

  const {
    monthlyReturns,
    filteredSnapshots,
    categoryAttribution,
    drawdownSeries,
    ...metrics
  } = usePerformance({
    snapshots,
    timeRange,
    assetPnLs,
    transactions,
    rates: pnlRates,
    totalInvestedUsd: totalInvestedNum,
    totalPnlUsd,
    currentValueUsd: currentValueNum,
  })

  const hasEnoughData = snapshots.length >= 2

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
            currentValueUsd={currentValueNum}
            currency={currency}
            timeRange={timeRange}
          />

          {/* Portfolio value chart */}
          <Suspense fallback={<RouteSkeleton />}>
            <PortfolioValueChart
              snapshots={filteredSnapshots}
              currency={currency}
            />
          </Suspense>

          {/* Monthly returns + Category attribution */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Suspense fallback={<RouteSkeleton />}>
              <MonthlyReturnsChart returns={monthlyReturns} />
            </Suspense>
            <CategoryAttribution data={categoryAttribution} />
          </div>

          {/* Drawdown */}
          <Suspense fallback={<RouteSkeleton />}>
            <DrawdownChart data={drawdownSeries} />
          </Suspense>
        </>
      )}

      {/* Snapshot manager */}
      <SnapshotManager
        snapshots={snapshots}
        prices={prices}
        latestRates={latestRates}
        onTakeSnapshot={takeSnapshot}
        onDeleteSnapshot={removeSnapshot}
      />
    </div>
  )
}
