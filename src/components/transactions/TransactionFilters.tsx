import { useState } from "react"
import { useAssets } from "@/hooks/useAssets"
import { usePlatforms } from "@/hooks/usePlatforms"
import { Button } from "@/components/ui/button"
import { SegmentedControl } from "@/components/common/SegmentedControl"
import { Disclosure } from "@/components/common/Disclosure"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { PlatformDot } from "@/components/common/PlatformDot"
import { AssetIcon } from "@/components/common/AssetIcon"
import { CalendarIcon, XIcon } from "lucide-react"
import {
  FILTERABLE_TYPES,
  FILTER_TYPE_DISPLAY,
  type TransactionFilterType,
} from "@/lib/constants/transaction-types"
import {
  thisYearStartISO,
  type TransactionLogFilters,
} from "@/hooks/useTransactionLog"
import { DISPLAY_LOCALE } from "@/lib/constants/app"

type DatePreset = "7d" | "30d" | "year" | "all"

/** What `defaultFilters()` in `useTransactionLog` applies on a fresh visit. */
const DEFAULT_DATE_PRESET: DatePreset = "year"

const DATE_PRESETS: { id: DatePreset; label: string }[] = [
  { id: "7d", label: "Last 7d" },
  { id: "30d", label: "Last 30d" },
  { id: "year", label: "This Year" },
  { id: "all", label: "All Time" },
]

interface Props {
  filters: TransactionLogFilters
  onFiltersChange: (filters: TransactionLogFilters) => void
}

function formatDateLabel(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00")
  return date.toLocaleDateString(DISPLAY_LOCALE, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

function toISODate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

export function TransactionFilters({ filters, onFiltersChange }: Props) {
  const { assets } = useAssets()
  const { platforms } = usePlatforms()
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [dateFromOpen, setDateFromOpen] = useState(false)
  const [dateToOpen, setDateToOpen] = useState(false)

  const setDatePreset = (preset: DatePreset) => {
    const now = new Date()
    let dateFrom: string | undefined
    const dateTo: string | undefined = undefined

    switch (preset) {
      case "7d": {
        const d = new Date(now)
        d.setDate(d.getDate() - 7)
        dateFrom = toISODate(d)
        break
      }
      case "30d": {
        const d = new Date(now)
        d.setDate(d.getDate() - 30)
        dateFrom = toISODate(d)
        break
      }
      case "year": {
        dateFrom = thisYearStartISO()
        break
      }
      case "all":
        dateFrom = undefined
        break
    }

    onFiltersChange({ ...filters, dateFrom, dateTo })
  }

  const toggleType = (type: TransactionFilterType) => {
    const current = filters.types ?? []
    const next = current.includes(type)
      ? current.filter((t) => t !== type)
      : [...current, type]
    onFiltersChange({ ...filters, types: next.length > 0 ? next : undefined })
  }

  const clearFilters = () => {
    onFiltersChange({})
  }

  const hasFilters =
    filters.dateFrom ||
    filters.dateTo ||
    filters.assetId ||
    filters.platformId ||
    (filters.types && filters.types.length > 0)

  // Determine which preset is active
  const activePreset = (() => {
    if (!filters.dateFrom && !filters.dateTo) return "all"
    const now = new Date()
    const d7 = new Date(now)
    d7.setDate(d7.getDate() - 7)
    if (filters.dateFrom === toISODate(d7) && !filters.dateTo) return "7d"
    const d30 = new Date(now)
    d30.setDate(d30.getDate() - 30)
    if (filters.dateFrom === toISODate(d30) && !filters.dateTo) return "30d"
    if (filters.dateFrom === thisYearStartISO() && !filters.dateTo) return "year"
    return null
  })()

  // What the phone trigger counts: each chosen asset / platform / type, plus
  // the date window — but only when it is not the default one. A fresh visit
  // already carries "This Year", and a badge that never reads 0 says nothing
  // about what the user actually narrowed.
  const activeFilterCount =
    (activePreset === DEFAULT_DATE_PRESET ? 0 : 1) +
    (filters.assetId ? 1 : 0) +
    (filters.platformId ? 1 : 0) +
    (filters.types?.length ?? 0)

  return (
    // Below `sm` the three filter rows cost a full screen above the first
    // transaction, so they collapse behind a "Filters (n)" trigger; from `sm`
    // up the trigger is gone and the rows are always open.
    <Disclosure
      open={filtersOpen}
      onOpenChange={setFiltersOpen}
      label={
        activeFilterCount > 0 ? `Filters (${activeFilterCount})` : "Filters"
      }
      triggerClassName="sm:hidden"
      contentClassName="space-y-3 sm:mt-0 sm:block"
    >
      {/* Date presets */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-muted-foreground">Date:</span>
        <SegmentedControl
          ariaLabel="Date range preset"
          value={activePreset ?? ("" as DatePreset)}
          options={DATE_PRESETS}
          onChange={setDatePreset}
          size="sm"
        />

        {/* Custom date from */}
        <Popover open={dateFromOpen} onOpenChange={setDateFromOpen}>
          <PopoverTrigger
            className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-input bg-transparent px-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted"
          >
            <CalendarIcon className="size-3.5" />
            {filters.dateFrom ? formatDateLabel(filters.dateFrom) : "From"}
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto p-0">
            <Calendar
              mode="single"
              selected={filters.dateFrom ? new Date(filters.dateFrom + "T00:00:00") : undefined}
              onSelect={(date) => {
                onFiltersChange({
                  ...filters,
                  dateFrom: date ? toISODate(date) : undefined,
                })
                setDateFromOpen(false)
              }}
            />
          </PopoverContent>
        </Popover>

        {/* Custom date to */}
        <Popover open={dateToOpen} onOpenChange={setDateToOpen}>
          <PopoverTrigger
            className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-input bg-transparent px-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted"
          >
            <CalendarIcon className="size-3.5" />
            {filters.dateTo ? formatDateLabel(filters.dateTo) : "To"}
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto p-0">
            <Calendar
              mode="single"
              selected={filters.dateTo ? new Date(filters.dateTo + "T00:00:00") : undefined}
              onSelect={(date) => {
                onFiltersChange({
                  ...filters,
                  dateTo: date ? toISODate(date) : undefined,
                })
                setDateToOpen(false)
              }}
            />
          </PopoverContent>
        </Popover>
      </div>

      {/* Asset and Platform selects + type chips */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Asset filter */}
        <Select
          value={filters.assetId ?? ""}
          onValueChange={(val: string | null) => {
            onFiltersChange({
              ...filters,
              assetId: val && val !== "" ? val : undefined,
            })
          }}
        >
          <SelectTrigger className="min-w-[140px]" size="sm">
            <SelectValue>
              {(value: string) => {
                const a = value ? assets.find((x) => x.id === value) : null
                if (!a) return "All assets"
                return (
                  <>
                    <AssetIcon asset={a} size="sm" />
                    <span className="truncate">
                      {a.name} ({a.ticker})
                    </span>
                  </>
                )
              }}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All assets</SelectItem>
            {assets.map((asset) => (
              <SelectItem key={asset.id} value={asset.id}>
                <AssetIcon asset={asset} size="sm" />
                {asset.name} ({asset.ticker})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Platform filter */}
        <Select
          value={filters.platformId ?? ""}
          onValueChange={(val: string | null) => {
            onFiltersChange({
              ...filters,
              platformId: val && val !== "" ? val : undefined,
            })
          }}
        >
          <SelectTrigger className="min-w-[140px]" size="sm">
            <SelectValue>
              {(value: string) => {
                const p = value ? platforms.find((x) => x.id === value) : null
                if (!p) return "All platforms"
                return (
                  <span className="flex items-center gap-2">
                    <PlatformDot color={p.color} />
                    {p.name}
                  </span>
                )
              }}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All platforms</SelectItem>
            {platforms.map((platform) => (
              <SelectItem key={platform.id} value={platform.id}>
                <PlatformDot color={platform.color} />
                {platform.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Clear filters */}
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <XIcon className="size-3.5" />
            Clear filters
          </Button>
        )}
      </div>

      {/* Type filter chips */}
      <div className="flex flex-wrap gap-2">
        <span className="flex items-center text-sm font-medium text-muted-foreground">
          Type:
        </span>
        {FILTERABLE_TYPES.map((type) => {
          const config = FILTER_TYPE_DISPLAY[type]
          const isActive = filters.types?.includes(type) ?? false
          return (
            <button
              key={type}
              type="button"
              onClick={() => toggleType(type)}
              className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors max-sm:min-h-10 ${
                isActive
                  ? `${config.bg} ${config.color}`
                  : "border-border bg-background text-muted-foreground hover:bg-muted"
              }`}
            >
              {config.label}
            </button>
          )
        })}
      </div>
    </Disclosure>
  )
}
