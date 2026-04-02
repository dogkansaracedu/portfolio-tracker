import { Link } from "react-router"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { PortfolioSummaryBar } from "@/components/portfolio/PortfolioSummaryBar"
import { PortfolioFilters } from "@/components/portfolio/PortfolioFilters"
import { PortfolioTable } from "@/components/portfolio/PortfolioTable"
import { usePortfolio } from "@/hooks/usePortfolio"

export default function PortfolioPage() {
  const {
    groups,
    totalValueUsd,
    totalValueTry,
    totalUnrealizedPnlUsd,
    totalUnrealizedPnlPct,
    activeAssetCount,
    loading,
    search,
    setSearch,
    groupBy,
    setGroupBy,
    sortBy,
    setSortBy,
  } = usePortfolio()

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Portfolio</h1>
          <p className="text-muted-foreground">
            All your assets in one place.
          </p>
        </div>
        <Button variant="outline" size="sm" nativeButton={false} render={<Link to="/settings" />}>
          <Plus className="size-4" />
          Add Asset
        </Button>
      </div>

      {/* Summary bar */}
      <PortfolioSummaryBar
        totalValueUsd={totalValueUsd}
        totalValueTry={totalValueTry}
        totalUnrealizedPnlUsd={totalUnrealizedPnlUsd}
        totalUnrealizedPnlPct={totalUnrealizedPnlPct}
        activeAssetCount={activeAssetCount}
      />

      {/* Filters */}
      <PortfolioFilters
        search={search}
        onSearchChange={setSearch}
        groupBy={groupBy}
        onGroupByChange={setGroupBy}
        sortBy={sortBy}
        onSortByChange={setSortBy}
      />

      {/* Table / loading state */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <p className="text-sm text-muted-foreground">Loading portfolio...</p>
        </div>
      ) : (
        <PortfolioTable groups={groups} />
      )}
    </div>
  )
}
