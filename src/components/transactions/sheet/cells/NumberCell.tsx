import { Input } from "@/components/ui/input"
import { CellShell } from "./CellShell"

interface Props {
  value: string
  error?: string
  placeholder?: string
  onChange: (next: string) => void
}

export function NumberCell({ value, error, placeholder, onChange }: Props) {
  return (
    <CellShell error={error} className="w-[130px]">
      <Input
        type="number"
        step="any"
        min="0"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 border-transparent bg-transparent px-2 text-right tabular-nums hover:border-input focus:border-input"
      />
    </CellShell>
  )
}
