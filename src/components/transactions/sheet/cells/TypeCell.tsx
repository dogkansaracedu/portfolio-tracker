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

/** Renders the selected type as bold uppercase colored text inline (SWS
 *  style). Trigger has no border; the whole label is the click target. */
export function TypeCell({ value, error, onChange }: Props) {
  return (
    <CellShell error={error} className="w-[140px]">
      <Select
        value={value}
        onValueChange={(v) => v && onChange(v as TransactionType)}
      >
        <SelectTrigger className="h-10 border-transparent bg-transparent px-2 font-semibold uppercase tracking-wide shadow-none hover:bg-accent/40">
          <SelectValue>
            {(v: string) => {
              const t = (v || value) as TransactionType
              const display = TRANSACTION_TYPE_DISPLAY[t]
              return (
                <span className={display?.color ?? ""}>
                  {display?.label.toUpperCase() ?? t}
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
                <span className={`font-semibold uppercase ${display.color}`}>
                  {display.label}
                </span>
              </SelectItem>
            )
          })}
        </SelectContent>
      </Select>
    </CellShell>
  )
}
