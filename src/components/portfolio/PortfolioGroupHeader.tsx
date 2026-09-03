import { TableRow, TableCell } from "@/components/ui/table"
import { useDisplayMoney } from "@/hooks/useDisplayMoney"
import { formatSignedPercent, gainLossToneClass } from "@/lib/prices"
import type { AssetGroup, ReturnMode } from "@/hooks/usePortfolio"

interface PortfolioGroupHeaderProps {
  group: AssetGroup
  returnMode: ReturnMode
  dailyReturnAvailable: boolean
}

/** A group's figures, in whichever return mode is showing. Shared by the
 *  desktop header cells and the mobile header line so the two can never
 *  disagree. Subtotals stay gross — the after-tax (net) view lives only on
 *  taxed asset rows, so a group holding one reads slightly above the sum of
 *  its rows' net headlines (each row still shows its gross beside the net). */
export function useGroupFigures(
  group: AssetGroup,
  returnMode: ReturnMode,
  dailyReturnAvailable: boolean,
) {
  const { currency, signedMoney, display } = useDisplayMoney()
  const isDaily = returnMode === "daily"
  const returnUsd = isDaily ? group.dailyReturnUsd : group.totalPnlUsd
  const returnPct = isDaily ? group.dailyReturnPct : null
  return {
    value: display(currency === "USD" ? group.totalValueUsd : group.totalValueTry),
    // Daily mode with no prior snapshot → no figure to show.
    showReturn: !isDaily || dailyReturnAvailable,
    returnUsd,
    returnPct: isDaily ? returnPct : null,
    returnText: signedMoney(returnUsd),
  }
}

/**
 * The group row. Its subtotal and return sit in the **Value** and return
 * columns, right-aligned like the rows beneath them — a header exists to be
 * scanned against its own rows, which a full-width flex row cannot be.
 */
export function PortfolioGroupHeader({
  group,
  returnMode,
  dailyReturnAvailable,
}: PortfolioGroupHeaderProps) {
  const f = useGroupFigures(group, returnMode, dailyReturnAvailable)

  return (
    <TableRow className="bg-muted/30 hover:bg-muted/40">
      {/* Name + asset count — the label column */}
      <TableCell colSpan={2} className="py-2.5">
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
      </TableCell>

      {/* Quantity / Bought / Price — nothing to subtotal */}
      <TableCell colSpan={3} className="py-2.5" />

      <TableCell className="py-2.5 text-right text-sm font-medium tabular-nums">
        {f.value}
      </TableCell>

      <TableCell className="py-2.5 text-right text-sm tabular-nums">
        {f.showReturn ? (
          <span className={gainLossToneClass(f.returnUsd)}>
            {f.returnText}
            {f.returnPct !== null && (
              <span className="ml-1 text-xs">
                {formatSignedPercent(f.returnPct)}
              </span>
            )}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>

      {/* Alloc. + row action */}
      <TableCell colSpan={2} className="py-2.5" />
    </TableRow>
  )
}
