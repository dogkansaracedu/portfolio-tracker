import { TableRow, TableCell } from "@/components/ui/table"
import { TransactionTypeBadge } from "@/components/transactions/TransactionTypeSelector"
import { PlatformDot } from "@/components/common/PlatformDot"
import { formatCurrency } from "@/lib/prices"
import { useTransactionData } from "@/contexts/TransactionDataContext"
import type { TransactionWithDetails } from "@/lib/queries/transactions"
import type { RealizedPnLEntry } from "@/lib/pnl/types"
import { deriveTransactionDisplay, formatTxDate } from "./transactionRowModel"
import {
  TransactionRowActions,
  TransactionAssetLabel,
  RealizedPnLLine,
} from "./TransactionRowShared"

interface Props {
  transaction: TransactionWithDetails
  linkedChild?: TransactionWithDetails | null
  currency: "USD" | "TRY"
  realized?: RealizedPnLEntry | null
}

export function TransactionRow({
  transaction,
  linkedChild,
  currency,
  realized,
}: Props) {
  const tx = transaction
  const { rates } = useTransactionData()
  const d = deriveTransactionDisplay(tx, currency, realized ?? null, rates)

  return (
    <TableRow>
      {/* Date */}
      <TableCell className="text-muted-foreground">
        {formatTxDate(tx.date)}
      </TableCell>

      {/* Asset */}
      <TableCell>
        <TransactionAssetLabel tx={tx} linkedChild={linkedChild ?? null} />
      </TableCell>

      {/* Platform */}
      <TableCell>
        {tx.platforms ? (
          <div className="flex items-center gap-1.5">
            <PlatformDot color={tx.platforms.color} />
            <span className="text-sm">{tx.platforms.name}</span>
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
      <TableCell className={d.amountColor}>
        <span className="font-medium tabular-nums">
          {d.sign}
          {new Intl.NumberFormat("en-US", {
            minimumFractionDigits: 0,
            maximumFractionDigits: 8,
          }).format(tx.amount)}
        </span>
      </TableCell>

      {/* Unit Price */}
      <TableCell className="tabular-nums text-muted-foreground">
        {formatCurrency(tx.unit_price, d.nativeCurrency)}
        {d.convertedUnitPrice !== null && (
          <span className="ml-1 text-xs font-normal text-muted-foreground">
            (~{formatCurrency(d.convertedUnitPrice, currency)})
          </span>
        )}
      </TableCell>

      {/* Total */}
      <TableCell className="tabular-nums font-medium">
        {formatCurrency(tx.total_cost, d.nativeCurrency)}
        {d.convertedTotal !== null && (
          <span className="ml-1 text-xs font-normal text-muted-foreground">
            (~{formatCurrency(d.convertedTotal, currency)})
          </span>
        )}
        <RealizedPnLLine display={d} />
      </TableCell>

      {/* Actions */}
      <TableCell className="text-right">
        <TransactionRowActions tx={tx} />
      </TableCell>
    </TableRow>
  )
}
