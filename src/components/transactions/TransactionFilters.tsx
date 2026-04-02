import { useState } from "react"
import { useAssets } from "@/hooks/useAssets"
import { usePlatforms } from "@/hooks/usePlatforms"
import { Button } from "@/components/ui/button"
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
import { CalendarIcon, XIcon } from "lucide-react"
import type { TransactionType } from "@/types/database"
import type { TransactionLogFilters } from "@/hooks/useTransactionLog"

const TRANSACTION_TYPES: { value: TransactionType; label: string; color: string; bg: string }[] = [
  { value: "buy", label: "Buy", color: "text-green-700", bg: "bg-green-100 border-green-300" },
  { value: "sell", label: "Sell", color: "text-red-700", bg: "bg-red-100 border-red-300" },
  { value: "transfer_in", label: "Transfer In", color: "text-blue-700", bg: "bg-blue-100 border-blue-300" },
  { value: "transfer_out", label: "Transfer Out", color: "text-orange-700", bg: "bg-orange-100 border-orange-300" },
  { value: "dividend", label: "Dividend", color: "text-purple-700", bg: "bg-purple-100 border-purple-300" },
  { value: "interest", label: "Interest", color: "text-teal-700", bg: "bg-teal-100 border-teal-300" },
  { value: "fee", label: "Fee", color: "text-gray-700", bg: "bg-gray-100 border-gray-300" },
]

interface Props {
  filters: TransactionLogFilters
  onFiltersChange: (filters: TransactionLogFilters) => void
}

function formatDateLabel(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00")
  return date.toLocaleDateString("en-US", {
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
  const [dateFromOpen, setDateFromOpen] = useState(false)
  const [dateToOpen, setDateToOpen] = useState(false)

  const setDatePreset = (preset: "7d" | "30d" | "year" | "all") => {
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
        dateFrom = `${now.getFullYear()}-01-01`
        break
      }
      case "all":
        dateFrom = undefined
        break
    }

    onFiltersChange({ ...filters, dateFrom, dateTo })
  }

  const toggleType = (type: TransactionType) => {
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
    if (filters.dateFrom === `${now.getFullYear()}-01-01` && !filters.dateTo) return "year"
    return null
  })()

  return (
    <div className="space-y-3">
      {/* Date presets */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-muted-foreground">Date:</span>
        {(
          [
            { key: "7d", label: "Last 7d" },
            { key: "30d", label: "Last 30d" },
            { key: "year", label: "This Year" },
            { key: "all", label: "All Time" },
          ] as const
        ).map(({ key, label }) => (
          <Button
            key={key}
            variant={activePreset === key ? "default" : "outline"}
            size="sm"
            onClick={() => setDatePreset(key)}
          >
            {label}
          </Button>
        ))}

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
            <SelectValue placeholder="All assets" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All assets</SelectItem>
            {assets.map((asset) => (
              <SelectItem key={asset.id} value={asset.id}>
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
            <SelectValue placeholder="All platforms" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All platforms</SelectItem>
            {platforms.map((platform) => (
              <SelectItem key={platform.id} value={platform.id}>
                <span
                  className="inline-block size-2.5 rounded-full"
                  style={{ backgroundColor: platform.color }}
                />
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
        {TRANSACTION_TYPES.map((type) => {
          const isActive = filters.types?.includes(type.value) ?? false
          return (
            <button
              key={type.value}
              type="button"
              onClick={() => toggleType(type.value)}
              className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                isActive
                  ? `${type.bg} ${type.color}`
                  : "border-border bg-background text-muted-foreground hover:bg-muted"
              }`}
            >
              {type.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
