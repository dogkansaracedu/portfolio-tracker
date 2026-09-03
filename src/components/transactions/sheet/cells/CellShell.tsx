import { cn } from "@/lib/utils"
import { TableCell } from "@/components/ui/table"
import type { ReactNode } from "react"

interface Props {
  error?: string
  className?: string
  children: ReactNode
}

/** Visual wrapper for every editable cell. Adds a red ring plus the reason,
 *  printed under the control. SWS-style: generous padding, no inset borders;
 *  the focus state comes from the inner input/trigger.
 *
 *  The reason is INLINE rather than in a hover affordance: it used to sit in a
 *  `Tooltip`, which has no tap path, so on a phone every validation message in
 *  the bulk editor was unreachable — and the grid's own footer tells you to
 *  "review highlighted rows". `HintPopover` (the app's tap-capable explainer)
 *  is not usable here either: its trigger is a `<button>`, and these cells'
 *  children ARE the inputs and selects the user edits. A cell only grows this
 *  second line while it is invalid, so the grid's density is untouched in the
 *  normal case. */
export function CellShell({ error, className, children }: Props) {
  if (!error) {
    return (
      <TableCell className={cn("px-2 py-2 align-middle", className)}>
        {children}
      </TableCell>
    )
  }
  return (
    <TableCell className={cn("px-2 py-2 align-middle", className)}>
      <div className="space-y-1">
        <div className="rounded-md ring-2 ring-destructive">{children}</div>
        <p className="text-[0.6875rem] leading-tight text-destructive">
          {error}
        </p>
      </div>
    </TableCell>
  )
}
