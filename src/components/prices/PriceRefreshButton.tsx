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
import { formatCompactAge, formatTimeAgo } from "@/lib/age"

interface PriceRefreshButtonProps {
  lastUpdated: string | null
  refreshing: boolean
  onRefresh: () => void
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
