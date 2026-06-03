import { TableRow, TableCell } from "@/components/ui/table"
import { useDisplayCurrency } from "@/contexts/DisplayContext"
import {
  formatCurrency,
  formatSignedCurrency,
  formatSignedPercent,
  gainLossClass,
  obfuscate,
} from "@/lib/prices"
import type { AssetGroup, ReturnMode } from "@/hooks/usePortfolio"

interface PortfolioGroupHeaderProps {
  group: AssetGroup
  colSpan: number
  returnMode: ReturnMode
  dailyReturnAvailable: boolean
}

export function PortfolioGroupHeader({
  group,
  colSpan,
  returnMode,
  dailyReturnAvailable,
}: PortfolioGroupHeaderProps) {
  const { currency, obfuscated } = useDisplayCurrency()
  const o = (v: string) => obfuscate(v, obfuscated)

  const displayValue =
    currency === "USD" ? group.totalValueUsd : group.totalValueTry

  const isDaily = returnMode === "daily"
  // Daily mode with no prior snapshot → no figure to show.
  const showReturn = !isDaily || dailyReturnAvailable
  const returnUsd = isDaily ? group.dailyReturnUsd : group.totalPnlUsd
  const returnPct = isDaily ? group.dailyReturnPct : null
  const returnIsPositive = returnUsd >= 0

  return (
    <TableRow className="bg-muted/30 hover:bg-muted/40">
      <TableCell colSpan={colSpan} className="py-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {group.color && (
              <span
                className="inline-block size-3 rounded-full"
                style={{ backgroundColor: group.color }}
              />
            )}
            <span className="font-semibold text-sm">{group.label}</span>
            <span className="text-xs text-muted-foreground">
              ({group.assets.length} asset{group.assets.length !== 1 ? "s" : ""})
            </span>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span className="font-medium">
              {o(formatCurrency(displayValue, currency))}
            </span>
            {showReturn ? (
              <span className={gainLossClass(returnIsPositive)}>
                {o(formatSignedCurrency(returnUsd, "USD"))}
                {isDaily && returnPct !== null && (
                  <span className="ml-1 text-xs">
                    {formatSignedPercent(returnPct, 2)}
                  </span>
                )}
              </span>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </div>
        </div>
      </TableCell>
    </TableRow>
  )
}
