import { useState, type ReactNode } from "react"
import { Info } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

/**
 * The small shared controls of the retirement views: the glossary explainer
 * that every advanced term carries, a numeric field that tolerates half-typed
 * input, and the segmented switch used for every mode/strategy choice.
 */

export function Hint({ text, label }: { text: string; label?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-label={label ? `What is ${label}?` : "What is this?"}
            className="inline-flex cursor-help text-muted-foreground"
          />
        }
      >
        <Info className="size-3" />
      </TooltipTrigger>
      <TooltipContent>{text}</TooltipContent>
    </Tooltip>
  )
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
}

/**
 * Keeps a raw string buffer so intermediate states ("", "-", "3.") survive
 * typing; the parsed number is pushed up only when it is a real number.
 * Remounted (keyed) when the scenario changes, which re-seeds the buffer.
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
}: NumberFieldProps) {
  const [raw, setRaw] = useState(String(value))

  return (
    <div className="grid gap-1.5">
      <HintLabel htmlFor={id} hint={hint}>
        {label}
      </HintLabel>
      <div className="relative">
        <Input
          id={id}
          type="number"
          inputMode="decimal"
          step={step}
          min={min}
          disabled={disabled}
          placeholder={placeholder}
          className={cn("tabular-nums", suffix && "pr-8")}
          value={disabled ? String(value) : raw}
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

interface SegmentedControlProps<T extends string> {
  value: T
  options: { id: T; label: string }[]
  onChange: (next: T) => void
  size?: "sm" | "default"
  className?: string
}

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  size = "default",
  className,
}: SegmentedControlProps<T>) {
  return (
    <div className={cn("flex flex-wrap gap-1", className)}>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          onClick={() => onChange(option.id)}
          className={cn(
            "rounded-md font-medium transition-colors",
            size === "sm" ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm",
            value === option.id
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:bg-muted/80",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

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
