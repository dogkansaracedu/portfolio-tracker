import { Search } from "lucide-react"
import { Input } from "@/components/ui/input"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { GroupBy, SortBy } from "@/hooks/usePortfolio"

interface PortfolioFiltersProps {
  search: string
  onSearchChange: (value: string) => void
  groupBy: GroupBy
  onGroupByChange: (value: GroupBy) => void
  sortBy: SortBy
  onSortByChange: (value: SortBy) => void
}

export function PortfolioFilters({
  search,
  onSearchChange,
  groupBy,
  onGroupByChange,
  sortBy,
  onSortByChange,
}: PortfolioFiltersProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      {/* Search */}
      <div className="relative w-full sm:max-w-xs">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by name or ticker..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-8"
        />
      </div>

      <div className="flex items-center gap-3">
        {/* Group by toggle */}
        <ToggleGroup
          value={[groupBy]}
          onValueChange={(newValue: string[]) => {
            if (newValue.length > 0) {
              onGroupByChange(newValue[0] as GroupBy)
            }
          }}
          variant="outline"
          size="sm"
        >
          <ToggleGroupItem value="tag">Tag</ToggleGroupItem>
          <ToggleGroupItem value="platform">Platform</ToggleGroupItem>
          <ToggleGroupItem value="category">Category</ToggleGroupItem>
        </ToggleGroup>

        {/* Sort by */}
        <Select
          value={sortBy}
          onValueChange={(value: string | null) => {
            if (value) {
              onSortByChange(value as SortBy)
            }
          }}
        >
          <SelectTrigger size="sm" className="w-[130px]">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="value">Sort: Value</SelectItem>
            <SelectItem value="pnl">Sort: P&L</SelectItem>
            <SelectItem value="name">Sort: Name</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
