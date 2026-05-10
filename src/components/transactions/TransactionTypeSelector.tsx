import {
  TRANSACTION_TYPE_DISPLAY,
  USER_PICKABLE_TYPES,
} from "@/lib/constants/transaction-types"
import type { TransactionType } from "@/types/database"

interface Props {
  value: TransactionType
  onChange: (type: TransactionType) => void
}

export function TransactionTypeSelector({ value, onChange }: Props) {
  return (
    <div className="flex flex-wrap gap-2">
      {USER_PICKABLE_TYPES.map((type) => {
        const config = TRANSACTION_TYPE_DISPLAY[type]
        return (
          <button
            key={type}
            type="button"
            onClick={() => onChange(type)}
            className={`rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
              value === type
                ? `${config.bg} ${config.color}`
                : "border-border bg-background text-muted-foreground hover:bg-muted"
            }`}
          >
            {config.label}
          </button>
        )
      })}
    </div>
  )
}

export function TransactionTypeBadge({ type }: { type: TransactionType }) {
  const config = TRANSACTION_TYPE_DISPLAY[type]
  if (!config) return null
  return (
    <span
      className={`inline-flex rounded-md border px-2 py-0.5 text-xs font-medium ${config.bg} ${config.color}`}
    >
      {config.label}
    </span>
  )
}
