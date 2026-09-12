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
import { InterestAlerts } from "@/components/dashboard/InterestAlerts"
import { VehicleAlerts } from "@/components/dashboard/VehicleAlerts"
import FinancialOverview from "@/components/dashboard/FinancialOverview"

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
    intradaySnapshots,
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
      {/* Above the fold: a term quietly ending is the one thing on this page
          that needs a decision this week (Component 16). */}
      <InterestAlerts />
      <VehicleAlerts />

      <Suspense fallback={<RouteSkeleton />}>
        <DashboardHero
          snapshots={snapshots}
          intradaySnapshots={intradaySnapshots}
          currentValueUsd={pnl.totalValueUsd}
          currentValueTry={pnl.totalValueTry}
          totalPnlUsd={pnl.totalPnlUsd}
          totalPnlTry={pnl.totalPnlTry}
          usdTry={usdTry}
        />
      </Suspense>

      <FinancialOverview liveValueUsd={pnl.totalValueUsd} />

      <section className="space-y-2" aria-labelledby="portfolio-breakdowns-title">
        <div className="flex items-baseline justify-between gap-3 md:hidden">
          <h2 id="portfolio-breakdowns-title" className="text-sm font-semibold">
            Portfolio breakdowns
          </h2>
          <p className="text-xs text-muted-foreground">Swipe to explore</p>
        </div>
        <div className="grid snap-x snap-mandatory grid-flow-col auto-cols-[88%] gap-4 overflow-x-auto pb-2 md:grid-flow-row md:auto-cols-auto md:grid-cols-2 md:overflow-visible md:pb-0">
          <div className="snap-start">
            <Suspense fallback={<RouteSkeleton />}>
              <AllocationChart
                byAllocation={byAllocation}
                totalValueUsd={totalValueUsd}
                totalValueTry={totalValueTry}
              />
            </Suspense>
          </div>
          <div className="snap-start">
            <PlatformBreakdown byPlatform={byPlatform} />
          </div>
          <div className="snap-start">
            <TopMovers topMovers={topMovers} />
          </div>
          <div className="snap-start">
            <CurrencyBreakdown byCurrency={byCurrency} />
          </div>
          <div className="snap-start md:col-span-2">
            <ForeignIncomeCard />
          </div>
        </div>
      </section>
    </div>
  )
}
