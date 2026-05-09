import { USER_PICKABLE_TYPES } from "@/lib/constants/transaction-types"
import type { TransactionType } from "@/types/database"

const TYPE_DISPLAY_CONFIG: Record<
  TransactionType,
  { label: string; color: string; bg: string }
> = {
  buy: { label: "Buy", color: "text-green-700", bg: "bg-green-100 border-green-300" },
  sell: { label: "Sell", color: "text-red-700", bg: "bg-red-100 border-red-300" },
  transfer_in: { label: "Transfer In", color: "text-blue-700", bg: "bg-blue-100 border-blue-300" },
  transfer_out: { label: "Transfer Out", color: "text-orange-700", bg: "bg-orange-100 border-orange-300" },
  dividend: { label: "Dividend", color: "text-purple-700", bg: "bg-purple-100 border-purple-300" },
  interest: { label: "Interest", color: "text-teal-700", bg: "bg-teal-100 border-teal-300" },
  fee: { label: "Fee", color: "text-gray-700", bg: "bg-gray-100 border-gray-300" },
  cash_credit: { label: "Cash credit", color: "text-green-700", bg: "bg-green-100 border-green-300" },
  cash_debit: { label: "Cash debit", color: "text-red-700", bg: "bg-red-100 border-red-300" },
}

interface Props {
  value: TransactionType
  onChange: (type: TransactionType) => void
}

export function TransactionTypeSelector({ value, onChange }: Props) {
  return (
    <div className="flex flex-wrap gap-2">
      {USER_PICKABLE_TYPES.map((type) => {
        const config = TYPE_DISPLAY_CONFIG[type]
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
  const config = TYPE_DISPLAY_CONFIG[type]
  if (!config) return null
  return (
    <span
      className={`inline-flex rounded-md border px-2 py-0.5 text-xs font-medium ${config.bg} ${config.color}`}
    >
      {config.label}
    </span>
  )
}
