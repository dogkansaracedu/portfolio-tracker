import { cn } from "@/lib/utils"
import { TableCell } from "@/components/ui/table"
import type { ReactNode } from "react"

interface Props {
  error?: string
  className?: string
  children: ReactNode
}

/** Visual wrapper for every editable cell. A cell that fails validation gets a
 *  red ring — and nothing else: the *reason* is printed once per row, by the
 *  grid, under the row it belongs to.
 *
 *  It used to be a hover `Tooltip` (no tap path, so unreachable on a phone).
 *  Printing the reason inside the cell instead fixed that but cost the row its
 *  baseline — a cell carrying a second line centres the pair, so its control
 *  rode ~9px above the cells beside it — and let each message widen its column.
 *  One line per row keeps the grid on one baseline, at one type size, and the
 *  ring still says which cells. */
export function CellShell({ error, className, children }: Props) {
  return (
    <TableCell className={cn("px-2 py-2 align-middle", className)}>
      {error ? (
        <div className="rounded-md ring-2 ring-destructive">{children}</div>
      ) : (
        children
      )}
    </TableCell>
  )
}
