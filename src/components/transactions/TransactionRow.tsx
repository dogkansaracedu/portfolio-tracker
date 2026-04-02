import { TableRow, TableCell } from "@/components/ui/table"
import { TransactionTypeBadge } from "@/components/transactions/TransactionTypeSelector"
import { formatCurrency } from "@/lib/prices"
import type { TransactionWithDetails } from "@/lib/queries/transactions"
import type { TransactionType } from "@/types/database"

const POSITIVE_TYPES: TransactionType[] = ["buy", "transfer_in", "dividend", "interest"]

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00")
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

function truncateNotes(notes: string | null, maxLen = 30): string {
  if (!notes) return ""
  return notes.length > maxLen ? notes.slice(0, maxLen) + "..." : notes
}

interface Props {
  transaction: TransactionWithDetails
  currency: "USD" | "TRY"
}

export function TransactionRow({ transaction, currency }: Props) {
  const tx = transaction
  const isPositive = POSITIVE_TYPES.includes(tx.type)
  const sign = isPositive ? "+" : "-"
  const amountColor = isPositive ? "text-green-600" : "text-red-600"

  return (
    <TableRow>
      {/* Date */}
      <TableCell className="text-muted-foreground">
        {formatDate(tx.date)}
      </TableCell>

      {/* Asset */}
      <TableCell>
        <div className="flex flex-col">
          <span className="font-medium">{tx.assets?.name ?? "Unknown"}</span>
          <span className="text-xs text-muted-foreground">
            {tx.assets?.ticker ?? ""}
          </span>
        </div>
      </TableCell>

      {/* Platform */}
      <TableCell>
        {tx.assets?.platforms ? (
          <div className="flex items-center gap-1.5">
            <span
              className="inline-block size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: tx.assets.platforms.color }}
            />
            <span className="text-sm">{tx.assets.platforms.name}</span>
          </div>
        ) : (
          <span className="text-muted-foreground">--</span>
        )}
      </TableCell>

      {/* Type */}
      <TableCell>
        <TransactionTypeBadge type={tx.type} />
      </TableCell>

      {/* Amount */}
      <TableCell className={amountColor}>
        <span className="font-medium tabular-nums">
          {sign}
          {new Intl.NumberFormat("en-US", {
            minimumFractionDigits: 0,
            maximumFractionDigits: 8,
          }).format(tx.amount)}
        </span>
      </TableCell>

      {/* Unit Price */}
      <TableCell className="tabular-nums text-muted-foreground">
        {formatCurrency(tx.unit_price, currency)}
      </TableCell>

      {/* Total */}
      <TableCell className="tabular-nums font-medium">
        {formatCurrency(tx.total_cost, currency)}
      </TableCell>

      {/* Notes */}
      <TableCell
        className="max-w-[150px] text-muted-foreground"
        title={tx.notes ?? undefined}
      >
        {truncateNotes(tx.notes)}
      </TableCell>
    </TableRow>
  )
}
