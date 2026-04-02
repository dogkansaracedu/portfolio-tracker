import type { PriceCache } from "@/types/database"
import { formatCurrency, getStalenessLevel } from "@/lib/prices"
import { useDisplayCurrency } from "@/contexts/DisplayContext"
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

const dotColors: Record<ReturnType<typeof getStalenessLevel>, string> = {
  fresh: "bg-green-500",
  warning: "bg-amber-500",
  stale: "bg-red-500",
}

const dotLabels: Record<ReturnType<typeof getStalenessLevel>, string> = {
  fresh: "Price is up to date",
  warning: "Price may be outdated (>30 min)",
  stale: "Price is stale (>2 hours)",
}

interface PriceDisplayProps {
  price: PriceCache | null | undefined
  className?: string
}

export default function PriceDisplay({ price, className }: PriceDisplayProps) {
  const { currency } = useDisplayCurrency()

  if (!price) {
    return <span className={cn("text-muted-foreground", className)}>--</span>
  }

  const value = currency === "USD" ? price.price_usd : price.price_try
  const staleness = getStalenessLevel(price.updated_at)

  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <Tooltip>
        <TooltipTrigger
          render={
            <span
              className={cn(
                "inline-block size-2 shrink-0 rounded-full",
                dotColors[staleness]
              )}
            />
          }
        />
        <TooltipContent>{dotLabels[staleness]}</TooltipContent>
      </Tooltip>
      <span>
        {value != null
          ? formatCurrency(value, currency)
          : "--"}
      </span>
    </span>
  )
}
