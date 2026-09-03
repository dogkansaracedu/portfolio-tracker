import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

interface DisclosureProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The trigger's text — e.g. "Assumptions", "Filters (3)". */
  label: React.ReactNode
  children: React.ReactNode
  className?: string
  /** Extra classes on the trigger (e.g. `sm:hidden` to drop it on desktop). */
  triggerClassName?: string
  /** Extra classes on the content (e.g. `sm:block` to keep it open at `sm+`). */
  contentClassName?: string
}

/**
 * The app's one "hide the knobs until asked" control: a chevron + label row
 * over content that is always mounted and toggled with `hidden`, so a caller
 * can force it open from a breakpoint up (`contentClassName="sm:block"`) with
 * the trigger dropped in the same breath.
 *
 * Used by the Retirement scenario panel (Assumptions, and the whole panel on a
 * phone) and the Transactions filters.
 */
export function Disclosure({
  open,
  onOpenChange,
  label,
  children,
  className,
  triggerClassName,
  contentClassName,
}: DisclosureProps) {
  return (
    <div className={className}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => onOpenChange(!open)}
        className={cn(
          "flex min-h-10 items-center gap-1.5 text-sm font-medium sm:min-h-0",
          triggerClassName
        )}
      >
        <ChevronDown
          className={cn("size-4 transition-transform", open && "rotate-180")}
        />
        {label}
      </button>
      <div className={cn("mt-3", contentClassName, !open && "hidden")}>
        {children}
      </div>
    </div>
  )
}
