import {
  FILTER_TYPE_DISPLAY,
  PICKABLE_TYPE_CHOICES,
  TRANSACTION_TYPE_DISPLAY,
  type TransactionFilterType,
} from "@/lib/constants/transaction-types"
import type { TransactionType } from "@/types/database"

interface Props {
  value: TransactionFilterType
  onChange: (type: TransactionFilterType) => void
}

/** The Type row. A colour-coded CATEGORICAL picker (each chip carries its own
 *  type colour, matching the log's Type badges) — deliberately not the app's
 *  neutral single-select toggle idiom. Wraps freely: 9 chips reflow to 5 + 4 at
 *  the dialog's width and stack further on a phone. */
export function TransactionTypeSelector({ value, onChange }: Props) {
  return (
    <div className="flex flex-wrap gap-2">
      {PICKABLE_TYPE_CHOICES.map((type) => {
        const config = FILTER_TYPE_DISPLAY[type]
        return (
          <button
            key={type}
            type="button"
            onClick={() => onChange(type)}
            aria-pressed={value === type}
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

export function TransactionTypeBadge({
  type,
  display,
}: {
  type: TransactionType
  /** Override the per-type display, e.g. the combined transfer-pair badge. */
  display?: { label: string; color: string; bg: string }
}) {
  const config = display ?? TRANSACTION_TYPE_DISPLAY[type]
  if (!config) return null
  return (
    <span
      className={`inline-flex rounded-md border px-2 py-0.5 text-xs font-medium ${config.bg} ${config.color}`}
    >
      {config.label}
    </span>
  )
}
