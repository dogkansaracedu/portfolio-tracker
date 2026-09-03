import { Info } from "lucide-react"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"

interface HintPopoverProps {
  /** The one-line explainer — normally a GLOSSARY hint constant. */
  text: string
  /** Names the thing being explained, for the trigger's accessible name. */
  label?: string
  /** The trigger's content. Defaults to the small info glyph. */
  children?: React.ReactNode
  className?: string
  /** Where the panel sits relative to the trigger. */
  align?: "start" | "center" | "end"
}

/**
 * The app's ONE explainer affordance: a `Popover` that also opens on hover.
 *
 * A `Tooltip` (and, worse, a bare `title`) has no tap path, which on a phone
 * hides every glossary explainer behind an affordance that does nothing. This
 * opens on hover with a mouse and on tap with a finger, from one code path —
 * so no view needs a second, touch-only variant.
 *
 * The trigger is a real `<button>` sized to a 40px tap target below `sm` via
 * padding (the glyph itself never grows), and desktop density is unchanged
 * because the padding collapses from `sm` up.
 */
export function HintPopover({
  text,
  label,
  children,
  className,
  align = "center",
}: HintPopoverProps) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label={label ? `What is ${label}?` : "What is this?"}
            className={cn(
              "inline-flex cursor-help items-center justify-center text-muted-foreground",
              // The bare glyph is 14px, far under the touch guideline, so below
              // `sm` it gets a 40px box. Only the horizontal half is pulled
              // back — a vertical negative margin would let the target overlap
              // the lines above and below it. A caller-supplied chip is already
              // wide enough to hit and stays inline.
              !children && "max-sm:-mx-3 max-sm:size-10",
              className
            )}
          />
        }
        openOnHover
        delay={200}
      >
        {children ?? <Info className="size-3.5" />}
      </PopoverTrigger>
      <PopoverContent align={align} className="w-64 text-xs">
        {text}
      </PopoverContent>
    </Popover>
  )
}
