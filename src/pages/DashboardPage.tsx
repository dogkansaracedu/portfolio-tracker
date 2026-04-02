import { Link } from "react-router"
import { useDashboard } from "@/hooks/useDashboard"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import NetWorthCard from "@/components/dashboard/NetWorthCard"
import AllocationChart from "@/components/dashboard/AllocationChart"
import PlatformBreakdown from "@/components/dashboard/PlatformBreakdown"
import TopMovers from "@/components/dashboard/TopMovers"
import PerformanceSparkline from "@/components/dashboard/PerformanceSparkline"

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
    byCategory,
    byPlatform,
    topMovers,
    loading,
  } = useDashboard()

  if (loading) {
    return (
      <div className="space-y-4">
        <SkeletonCard />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <SkeletonChartCard />
          <SkeletonCard />
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </div>
    )
  }

  const hasNoAssets =
    byCategory.length === 0 && byPlatform.length === 0

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
      {/* Row 1: Net Worth */}
      <NetWorthCard
        totalValueUsd={totalValueUsd}
        totalValueTry={totalValueTry}
      />

      {/* Row 2: Allocation + Platform Breakdown */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <AllocationChart
          byCategory={byCategory}
          totalValueUsd={totalValueUsd}
          totalValueTry={totalValueTry}
        />
        <PlatformBreakdown byPlatform={byPlatform} />
      </div>

      {/* Row 3: Top Movers + Performance */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <TopMovers topMovers={topMovers} />
        <PerformanceSparkline />
      </div>
    </div>
  )
}
