import { Input } from "@/components/ui/input"
import { CellShell } from "./CellShell"

interface Props {
  value: string
  error?: string
  placeholder?: string
  onChange: (next: string) => void
}

export function TextCell({ value, error, placeholder, onChange }: Props) {
  return (
    <CellShell error={error} className="min-w-[160px]">
      <Input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 border-transparent bg-transparent px-2 hover:border-input focus:border-input"
      />
    </CellShell>
  )
}
