import { PortfolioSummaryBar } from "@/components/portfolio/PortfolioSummaryBar"
import { PortfolioFilters } from "@/components/portfolio/PortfolioFilters"
import { PortfolioTable } from "@/components/portfolio/PortfolioTable"
import { usePortfolio } from "@/hooks/usePortfolio"

export default function PortfolioPage() {
  const {
    groups,
    totalValueUsd,
    totalValueTry,
    totalPnlUsd,
    totalPnlPct,
    totalUnrealizedPnlUsd,
    totalRealizedPnlUsd,
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Portfolio</h1>
        <p className="text-muted-foreground">
          All your assets in one place.
        </p>
      </div>

      {/* Summary bar */}
      <PortfolioSummaryBar
        totalValueUsd={totalValueUsd}
        totalValueTry={totalValueTry}
        totalPnlUsd={totalPnlUsd}
        totalPnlPct={totalPnlPct}
        totalUnrealizedPnlUsd={totalUnrealizedPnlUsd}
        totalRealizedPnlUsd={totalRealizedPnlUsd}
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
