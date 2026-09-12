import { useEffect } from "react"
import { useSearchParams } from "react-router"
import { PageHeading } from "@/components/common/PageHeading"
import { PortfolioSummaryBar } from "@/components/portfolio/PortfolioSummaryBar"
import { PortfolioFilters } from "@/components/portfolio/PortfolioFilters"
import { PortfolioTable } from "@/components/portfolio/PortfolioTable"
import { usePortfolio } from "@/hooks/usePortfolio"

export default function PortfolioPage() {
  const [searchParams] = useSearchParams()
  const {
    groups,
    totalValueUsd,
    totalValueTry,
    totalPnlUsd,
    totalMwrPct,
    totalUnrealizedPnlUsd,
    totalRealizedPnlUsd,
    totalIncomeUsd,
    heldAssetCount,
    loading,
    search,
    setSearch,
    groupBy,
    setGroupBy,
    sortBy,
    setSortBy,
    returnMode,
    setReturnMode,
    dailyReturnAvailable,
  } = usePortfolio()

  const requestedGroupBy = searchParams.get("groupBy")
  useEffect(() => {
    if (requestedGroupBy === "platform" || requestedGroupBy === "category") {
      setGroupBy(requestedGroupBy)
    }
  }, [requestedGroupBy, setGroupBy])

  return (
    <div className="space-y-6">
      <PageHeading title="Portfolio" subtitle="All your assets in one place." />

      {/* Summary bar */}
      <PortfolioSummaryBar
        totalValueUsd={totalValueUsd}
        totalValueTry={totalValueTry}
        totalPnlUsd={totalPnlUsd}
        totalMwrPct={totalMwrPct}
        totalUnrealizedPnlUsd={totalUnrealizedPnlUsd}
        totalRealizedPnlUsd={totalRealizedPnlUsd}
        totalIncomeUsd={totalIncomeUsd}
        heldAssetCount={heldAssetCount}
      />

      {/* Filters */}
      <PortfolioFilters
        search={search}
        onSearchChange={setSearch}
        groupBy={groupBy}
        onGroupByChange={setGroupBy}
        sortBy={sortBy}
        onSortByChange={setSortBy}
        returnMode={returnMode}
        onReturnModeChange={setReturnMode}
      />

      {/* Table / loading state */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <p className="text-sm text-muted-foreground">Loading portfolio...</p>
        </div>
      ) : (
        <PortfolioTable
          groups={groups}
          returnMode={returnMode}
          dailyReturnAvailable={dailyReturnAvailable}
        />
      )}
    </div>
  )
}
