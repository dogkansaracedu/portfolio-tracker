import { Input } from "@/components/ui/input"
import { CellShell } from "./CellShell"

interface Props {
  value: string
  error?: string
  onChange: (next: string) => void
}

/** Native date input keeps the cell compact and copy-paste friendly. The
 *  AddTransactionModal uses a full calendar popover, but inside a dense grid a
 *  one-line input is far better. */
export function DateCell({ value, error, onChange }: Props) {
  return (
    <CellShell error={error} className="w-[140px]">
      <Input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 border-transparent bg-transparent px-2 hover:border-input focus:border-input"
      />
    </CellShell>
  )
}
