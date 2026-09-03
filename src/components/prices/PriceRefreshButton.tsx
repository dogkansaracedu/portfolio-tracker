import { RefreshCwIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip"
import { getStalenessLevel } from "@/lib/prices"
import {
  NO_PRICE_DATA_AGE,
  PRICE_STALENESS_TONE_CLASS,
} from "@/lib/constants/prices"
import { cn } from "@/lib/utils"

interface PriceRefreshButtonProps {
  lastUpdated: string | null
  refreshing: boolean
  onRefresh: () => void
}

function ageParts(isoString: string): { value: number; unit: string } {
  const minutes = Math.floor((Date.now() - new Date(isoString).getTime()) / 60_000)
  if (minutes < 60) return { value: Math.max(minutes, 0), unit: "m" }
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return { value: hours, unit: "h" }
  return { value: Math.floor(hours / 24), unit: "d" }
}

function formatTimeAgo(isoString: string): string {
  const { value, unit } = ageParts(isoString)
  if (unit === "m" && value < 1) return "just now"
  return `${value}${unit} ago`
}

/** The phone header's version of the same figure: "2m", "3h", "2d". */
function formatCompactAge(isoString: string): string {
  const { value, unit } = ageParts(isoString)
  return `${value}${unit}`
}

export default function PriceRefreshButton({
  lastUpdated,
  refreshing,
  onRefresh,
}: PriceRefreshButtonProps) {
  const label = lastUpdated
    ? `Updated ${formatTimeAgo(lastUpdated)}`
    : "No price data"
  // On a phone there is no room for the sentence, but a stale price must not
  // look like a live one — so the age itself shows, in the engine's own
  // three-level tone (never the gain/loss palette).
  const level = lastUpdated ? getStalenessLevel(lastUpdated) : "stale"
  const compactAge = lastUpdated
    ? formatCompactAge(lastUpdated)
    : NO_PRICE_DATA_AGE

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            onClick={onRefresh}
            disabled={refreshing}
            className="gap-1.5 text-xs text-muted-foreground max-sm:min-h-10 max-sm:px-2"
          />
        }
      >
        <RefreshCwIcon
          className={cn("size-3.5", refreshing && "animate-spin")}
        />
        <span
          className={cn(
            "tabular-nums sm:hidden",
            PRICE_STALENESS_TONE_CLASS[level]
          )}
        >
          {compactAge}
        </span>
        <span className="hidden sm:inline">{label}</span>
      </TooltipTrigger>
      <TooltipContent>
        {refreshing ? "Refreshing prices..." : "Click to refresh prices"}
      </TooltipContent>
    </Tooltip>
  )
}
