import { Suspense } from "react"
import { Link } from "react-router"
import { useDashboard } from "@/hooks/useDashboard"
import { usePnLSummary } from "@/hooks/usePnLSummary"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { DashboardHero, AllocationChart } from "@/components/charts/LazyChart"
import RouteSkeleton from "@/components/layout/RouteSkeleton"
import PlatformBreakdown from "@/components/dashboard/PlatformBreakdown"
import CurrencyBreakdown from "@/components/dashboard/CurrencyBreakdown"
import TopMovers from "@/components/dashboard/TopMovers"
import ForeignIncomeCard from "@/components/dashboard/ForeignIncomeCard"

function SkeletonCard({ className }: { className?: string }) {
  return (
    <Card className={className}>
      <CardHeader>
        <Skeleton className="h-5 w-32" />
      </CardHeader>
      <CardContent className="space-y-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-36" />
        <Skeleton className="h-4 w-24" />
      </CardContent>
    </Card>
  )
}

function SkeletonHero() {
  return (
    <Card>
      <CardContent className="space-y-5 pt-2">
        <Skeleton className="h-9 w-48" />
        <div className="space-y-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-10 w-72" />
          <Skeleton className="h-4 w-56" />
        </div>
        <Skeleton className="h-[220px] w-full" />
        <Skeleton className="h-8 w-80" />
      </CardContent>
    </Card>
  )
}

function SkeletonChartCard({ className }: { className?: string }) {
  return (
    <Card className={className}>
      <CardHeader>
        <Skeleton className="h-5 w-32" />
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-4">
        <Skeleton className="h-[220px] w-[220px] rounded-full" />
        <div className="flex gap-4">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-16" />
        </div>
      </CardContent>
    </Card>
  )
}

export default function DashboardPage() {
  const {
    totalValueUsd,
    totalValueTry,
    byAllocation,
    byPlatform,
    byCurrency,
    topMovers,
    snapshots,
    usdTry,
    loading,
  } = useDashboard()

  // Current-day value + total P&L come from the one P&L engine (same numbers as
  // the Portfolio page). The breakdowns/chart below stay snapshot-derived.
  const pnl = usePnLSummary()

  if (loading || pnl.loading) {
    return (
      <div className="space-y-4">
        <SkeletonHero />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <SkeletonCard />
          <SkeletonChartCard />
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </div>
    )
  }

  const hasNoAssets =
    byAllocation.length === 0 && byPlatform.length === 0

  if (hasNoAssets) {
    return (
      <div className="space-y-4">
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12">
            <p className="text-lg font-medium">Welcome to your portfolio!</p>
            <p className="text-center text-sm text-muted-foreground">
              Add your first platform and assets to get started.
            </p>
            <Link
              to="/settings"
              className="mt-2 text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              Go to Settings
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <Suspense fallback={<RouteSkeleton />}>
        <DashboardHero
          snapshots={snapshots}
          currentValueUsd={pnl.totalValueUsd}
          currentValueTry={pnl.totalValueTry}
          totalPnlUsd={pnl.totalPnlUsd}
          totalPnlTry={pnl.totalPnlTry}
          totalPnlAfterTaxUsd={pnl.totalPnlAfterTaxUsd}
          totalPnlAfterTaxTry={pnl.totalPnlAfterTaxTry}
          totalTaxAccrualUsd={pnl.totalTaxAccrualUsd}
          totalPnlPct={pnl.totalPnlPct}
          usdTry={usdTry}
        />
      </Suspense>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Suspense fallback={<RouteSkeleton />}>
          <AllocationChart
            byAllocation={byAllocation}
            totalValueUsd={totalValueUsd}
            totalValueTry={totalValueTry}
          />
        </Suspense>
        <PlatformBreakdown byPlatform={byPlatform} />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <TopMovers topMovers={topMovers} />
        <CurrencyBreakdown byCurrency={byCurrency} />
      </div>

      <ForeignIncomeCard />
    </div>
  )
}
