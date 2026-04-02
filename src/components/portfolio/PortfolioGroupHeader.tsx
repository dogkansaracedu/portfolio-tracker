import { TableRow, TableCell } from "@/components/ui/table"
import { useDisplayCurrency } from "@/contexts/DisplayContext"
import { formatCurrency } from "@/lib/prices"
import type { AssetGroup } from "@/hooks/usePortfolio"

interface PortfolioGroupHeaderProps {
  group: AssetGroup
  colSpan: number
}

export function PortfolioGroupHeader({
  group,
  colSpan,
}: PortfolioGroupHeaderProps) {
  const { currency } = useDisplayCurrency()

  const displayValue =
    currency === "USD" ? group.totalValueUsd : group.totalValueTry
  const displayPnl = group.totalPnlUsd
  const pnlIsPositive = displayPnl >= 0

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
              {formatCurrency(displayValue, currency)}
            </span>
            <span
              className={
                pnlIsPositive ? "text-emerald-600" : "text-red-500"
              }
            >
              {pnlIsPositive ? "+" : ""}
              {formatCurrency(displayPnl, "USD")}
            </span>
          </div>
        </div>
      </TableCell>
    </TableRow>
  )
}
