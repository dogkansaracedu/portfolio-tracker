import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { CellShell } from "./CellShell"
import {
  TRANSACTION_TYPE_DISPLAY,
  USER_PICKABLE_TYPES,
} from "@/lib/constants/transaction-types"
import type { TransactionType } from "@/types/database"

interface Props {
  value: TransactionType
  error?: string
  onChange: (next: TransactionType) => void
}

export function TypeCell({ value, error, onChange }: Props) {
  return (
    <CellShell error={error} className="w-[130px]">
      <Select
        value={value}
        onValueChange={(v) => v && onChange(v as TransactionType)}
      >
        <SelectTrigger className="h-8 border-transparent bg-transparent hover:border-input">
          <SelectValue>
            {(v: string) => {
              const t = (v || value) as TransactionType
              const display = TRANSACTION_TYPE_DISPLAY[t]
              return (
                <span className={display?.color ?? ""}>
                  {display?.label ?? t}
                </span>
              )
            }}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {USER_PICKABLE_TYPES.map((t) => {
            const display = TRANSACTION_TYPE_DISPLAY[t]
            return (
              <SelectItem key={t} value={t}>
                <span className={display.color}>{display.label}</span>
              </SelectItem>
            )
          })}
        </SelectContent>
      </Select>
    </CellShell>
  )
}
