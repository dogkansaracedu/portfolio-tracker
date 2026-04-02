import { RefreshCwIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

interface PriceRefreshButtonProps {
  lastUpdated: string | null
  refreshing: boolean
  onRefresh: () => void
}

function formatTimeAgo(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime()
  const minutes = Math.floor(diff / 60_000)

  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes}m ago`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`

  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export default function PriceRefreshButton({
  lastUpdated,
  refreshing,
  onRefresh,
}: PriceRefreshButtonProps) {
  const label = lastUpdated
    ? `Updated ${formatTimeAgo(lastUpdated)}`
    : "No price data"

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            onClick={onRefresh}
            disabled={refreshing}
            className="gap-1.5 text-xs text-muted-foreground"
          />
        }
      >
        <RefreshCwIcon
          className={cn("size-3.5", refreshing && "animate-spin")}
        />
        <span className="hidden sm:inline">{label}</span>
      </TooltipTrigger>
      <TooltipContent>
        {refreshing ? "Refreshing prices..." : "Click to refresh prices"}
      </TooltipContent>
    </Tooltip>
  )
}
