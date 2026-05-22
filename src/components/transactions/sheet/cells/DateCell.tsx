import { Input } from "@/components/ui/input"
import { CellShell } from "./CellShell"

interface Props {
  value: string
  error?: string
  onChange: (next: string) => void
}

export function DateCell({ value, error, onChange }: Props) {
  return (
    <CellShell error={error} className="w-[150px]">
      <Input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 border-transparent bg-transparent px-2 shadow-none hover:bg-accent/40 focus:bg-background"
      />
    </CellShell>
  )
}
