import { Input } from "@/components/ui/input"
import { CellShell } from "./CellShell"

interface Props {
  value: string
  error?: string
  placeholder?: string
  prefix?: string
  className?: string
  onChange: (next: string) => void
}

export function NumberCell({
  value,
  error,
  placeholder,
  prefix,
  className,
  onChange,
}: Props) {
  return (
    <CellShell error={error} className={className ?? "w-[140px]"}>
      <div className="flex items-center gap-1 px-2">
        {prefix && (
          <span className="select-none text-xs text-muted-foreground">
            {prefix}
          </span>
        )}
        <Input
          type="number"
          step="any"
          min="0"
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 border-transparent bg-transparent px-0 text-right tabular-nums shadow-none hover:bg-accent/40 focus:bg-background"
        />
      </div>
    </CellShell>
  )
}
