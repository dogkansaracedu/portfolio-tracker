import type { TransactionType } from "@/types/database"

const typeConfig: {
  value: TransactionType
  label: string
  color: string
  bg: string
}[] = [
  { value: "buy", label: "Buy", color: "text-green-700", bg: "bg-green-100 border-green-300" },
  { value: "sell", label: "Sell", color: "text-red-700", bg: "bg-red-100 border-red-300" },
  { value: "transfer_in", label: "Transfer In", color: "text-blue-700", bg: "bg-blue-100 border-blue-300" },
  { value: "transfer_out", label: "Transfer Out", color: "text-orange-700", bg: "bg-orange-100 border-orange-300" },
  { value: "dividend", label: "Dividend", color: "text-purple-700", bg: "bg-purple-100 border-purple-300" },
  { value: "interest", label: "Interest", color: "text-teal-700", bg: "bg-teal-100 border-teal-300" },
  { value: "fee", label: "Fee", color: "text-gray-700", bg: "bg-gray-100 border-gray-300" },
]

interface Props {
  value: TransactionType
  onChange: (type: TransactionType) => void
}

export function TransactionTypeSelector({ value, onChange }: Props) {
  return (
    <div className="flex flex-wrap gap-2">
      {typeConfig.map((type) => (
        <button
          key={type.value}
          type="button"
          onClick={() => onChange(type.value)}
          className={`rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
            value === type.value
              ? `${type.bg} ${type.color}`
              : "border-border bg-background text-muted-foreground hover:bg-muted"
          }`}
        >
          {type.label}
        </button>
      ))}
    </div>
  )
}

export function TransactionTypeBadge({ type }: { type: TransactionType }) {
  const config = typeConfig.find((t) => t.value === type)
  if (!config) return null
  return (
    <span
      className={`inline-flex rounded-md border px-2 py-0.5 text-xs font-medium ${config.bg} ${config.color}`}
    >
      {config.label}
    </span>
  )
}
