import { cn } from "@/lib/utils"
import { TableCell } from "@/components/ui/table"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import type { ReactNode } from "react"

interface Props {
  error?: string
  className?: string
  children: ReactNode
}

/** Visual wrapper for every editable cell. Adds a red ring + tooltip when the
 *  cell has a validation error. Keeps cell editors free of error-display logic. */
export function CellShell({ error, className, children }: Props) {
  if (!error) {
    return <TableCell className={cn("p-1 align-middle", className)}>{children}</TableCell>
  }
  return (
    <TableCell className={cn("p-1 align-middle", className)}>
      <Tooltip>
        <TooltipTrigger
          render={
            <div className="rounded-md ring-2 ring-destructive">{children}</div>
          }
        />
        <TooltipContent>{error}</TooltipContent>
      </Tooltip>
    </TableCell>
  )
}
