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
import type { GroupBy, SortBy, ReturnMode } from "@/hooks/usePortfolio"
import { RETURN_MODE_LABELS } from "@/lib/constants/portfolio"

const SORT_LABELS: Record<SortBy, string> = {
  value: "Sort: Value",
  pnl: "Sort: P&L",
  name: "Sort: Name",
}

interface PortfolioFiltersProps {
  search: string
  onSearchChange: (value: string) => void
  groupBy: GroupBy
  onGroupByChange: (value: GroupBy) => void
  sortBy: SortBy
  onSortByChange: (value: SortBy) => void
  returnMode: ReturnMode
  onReturnModeChange: (value: ReturnMode) => void
}

export function PortfolioFilters({
  search,
  onSearchChange,
  groupBy,
  onGroupByChange,
  sortBy,
  onSortByChange,
  returnMode,
  onReturnModeChange,
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

      <div className="flex flex-wrap items-center gap-2 sm:justify-end sm:gap-3">
        {/* Return mode toggle */}
        <ToggleGroup
          value={[returnMode]}
          onValueChange={(newValue: string[]) => {
            if (newValue.length > 0) {
              onReturnModeChange(newValue[0] as ReturnMode)
            }
          }}
          variant="outline"
          size="sm"
        >
          <ToggleGroupItem value="total">{RETURN_MODE_LABELS.total}</ToggleGroupItem>
          <ToggleGroupItem value="daily">{RETURN_MODE_LABELS.daily}</ToggleGroupItem>
        </ToggleGroup>

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
          <ToggleGroupItem value="currency">Currency</ToggleGroupItem>
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
            <SelectValue>
              {(value: string) => SORT_LABELS[value as SortBy] ?? "Sort by"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="value">{SORT_LABELS.value}</SelectItem>
            <SelectItem value="pnl">{SORT_LABELS.pnl}</SelectItem>
            <SelectItem value="name">{SORT_LABELS.name}</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
