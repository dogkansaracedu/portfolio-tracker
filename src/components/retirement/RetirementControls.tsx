import { useState, type ReactNode } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { HintPopover } from "@/components/common/HintPopover"
import { cn } from "@/lib/utils"

/**
 * The small shared controls of the retirement views: the glossary explainer
 * that every advanced term carries, a numeric field that tolerates half-typed
 * input, and the segmented switch used for every mode/strategy choice.
 */

/** The retirement views' name for the app-wide `HintPopover`, so a glossary
 *  explainer here reads as one word at the call site. */
export function Hint({ text, label }: { text: string; label?: string }) {
  return <HintPopover text={text} label={label} />
}

export function HintLabel({
  children,
  hint,
  htmlFor,
  className,
}: {
  children: ReactNode
  hint?: string
  htmlFor?: string
  className?: string
}) {
  return (
    <Label htmlFor={htmlFor} className={cn("text-xs font-medium", className)}>
      {children}
      {hint && <Hint text={hint} label={typeof children === "string" ? children : undefined} />}
    </Label>
  )
}

interface NumberFieldProps {
  id: string
  label: string
  hint?: string
  value: number
  onChange: (next: number) => void
  suffix?: string
  step?: number
  min?: number
  disabled?: boolean
  placeholder?: string
  /**
   * Presentation string for a disabled (read-only) field — typically money put
   * through the app's money edge. Ignored while the field is editable.
   */
  displayValue?: string
}

/**
 * Keeps a raw string buffer so intermediate states ("", "-", "3.") survive
 * typing; the parsed number is pushed up only when it is a real number.
 * Remounted (keyed) when the scenario changes, which re-seeds the buffer.
 *
 * A disabled field is presentation only, so it renders as text rather than a
 * native number input: a number input paints its value through the *browser's*
 * locale (55597.51 shows as "55597,51" on a tr-TR browser), which is never this
 * app's number/money convention.
 */
export function NumberField({
  id,
  label,
  hint,
  value,
  onChange,
  suffix,
  step,
  min,
  disabled,
  placeholder,
  displayValue,
}: NumberFieldProps) {
  const [raw, setRaw] = useState(String(value))

  return (
    <div className="grid gap-1.5">
      <HintLabel htmlFor={id} hint={hint}>
        {label}
      </HintLabel>
      {/*
        `flex` (not a plain block) so the input is a flex item rather than an
        inline-block: an inline-block input leaves baseline descender space
        under it, which makes this wrapper taller than the input and drags the
        `inset-y-0` suffix below the input's own vertical centre.
      */}
      <div className="relative flex items-center">
        <Input
          id={id}
          type={disabled ? "text" : "number"}
          inputMode="decimal"
          step={disabled ? undefined : step}
          min={disabled ? undefined : min}
          disabled={disabled}
          placeholder={placeholder}
          className={cn("tabular-nums", suffix && "pr-8")}
          value={disabled ? (displayValue ?? String(value)) : raw}
          onChange={(e) => {
            setRaw(e.target.value)
            const next = Number(e.target.value)
            if (e.target.value !== "" && Number.isFinite(next)) onChange(next)
          }}
          onBlur={() => setRaw(String(value))}
        />
        {suffix && (
          <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-xs text-muted-foreground">
            {suffix}
          </span>
        )}
      </div>
    </div>
  )
}

export { SegmentedControl } from "@/components/common/SegmentedControl"

export function StatTile({
  label,
  hint,
  value,
  valueClassName,
  caption,
  children,
}: {
  label: string
  hint?: string
  value: string
  valueClassName?: string
  caption?: ReactNode
  children?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        {label}
        {hint && <Hint text={hint} label={label} />}
      </span>
      <span className={cn("text-xl font-bold tabular-nums", valueClassName)}>
        {value}
      </span>
      {caption && (
        <span className="text-xs text-muted-foreground">{caption}</span>
      )}
      {children}
    </div>
  )
}
