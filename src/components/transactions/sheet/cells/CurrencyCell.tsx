import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { CellShell } from "./CellShell"
import { SUPPORTED_FIAT_CURRENCIES } from "@/lib/constants/currencies"

interface Props {
  value: string
  error?: string
  onChange: (next: string) => void
}

export function CurrencyCell({ value, error, onChange }: Props) {
  return (
    <CellShell error={error} className="w-[80px]">
      <Select value={value} onValueChange={(v) => v && onChange(v)}>
        <SelectTrigger className="h-8 border-transparent bg-transparent hover:border-input">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {SUPPORTED_FIAT_CURRENCIES.map((c) => (
            <SelectItem key={c} value={c}>
              {c}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </CellShell>
  )
}
