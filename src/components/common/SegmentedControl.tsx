import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { cn } from "@/lib/utils"

interface SegmentedControlProps<T extends string> {
  value: T
  options: { id: T; label: string; hint?: string }[]
  onChange: (next: T) => void
  size?: "sm" | "default"
  disabled?: boolean
  className?: string
  /** Accessible name for the group (it has no visible label of its own). */
  ariaLabel?: string
}

/**
 * The app's ONE "pick exactly one" control: an outline `ToggleGroup`.
 *
 * Every view / mode / range switch uses it — the dashboard hero's
 * Value|Performance and TWR|MWR, its range row, the Transactions date presets,
 * the Retirement question and view chips, Asset Detail's range, the Settings
 * granularity. Solid `bg-primary` is reserved for the one primary *action* on
 * a page, so a mode switch can never read as a call to action.
 *
 * (The Transactions type chips and the Add form's Type row are deliberately
 * NOT this: they are a colour-coded categorical picker mirroring the log's
 * type badges.)
 */
export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  size = "default",
  disabled = false,
  className,
  ariaLabel,
}: SegmentedControlProps<T>) {
  return (
    <ToggleGroup
      aria-label={ariaLabel}
      value={[value]}
      onValueChange={(next: string[]) => {
        // An empty array means the active item was pressed again — a
        // single-select never has "nothing selected", so keep the current one.
        if (next.length > 0) onChange(next[0] as T)
      }}
      variant="outline"
      size={size}
      className={cn("flex-wrap", className)}
    >
      {options.map((option) => (
        <ToggleGroupItem
          key={option.id}
          value={option.id}
          disabled={disabled}
          title={option.hint}
        >
          {option.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}
