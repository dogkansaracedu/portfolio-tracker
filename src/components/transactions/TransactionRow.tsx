import { TableRow, TableCell } from "@/components/ui/table"
import { TransactionTypeBadge } from "@/components/transactions/TransactionTypeSelector"
import { PlatformDot } from "@/components/common/PlatformDot"
import { formatCurrency } from "@/lib/prices"
import { useTransactionData } from "@/contexts/TransactionDataContext"
import type { TransactionWithDetails } from "@/lib/queries/transactions"
import type { RealizedPnLEntry } from "@/lib/pnl/types"
import {
  deriveTransactionDisplay,
  formatTxDate,
  formatTxQuantity,
} from "./transactionRowModel"
import {
  TransactionRowActions,
  TransactionAssetLabel,
  TransferRoute,
  RealizedPnLLine,
  isTransferPair,
} from "./TransactionRowShared"
import { TRANSFER_PAIR_DISPLAY } from "@/lib/constants/transaction-types"

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
  const transferPair = isTransferPair(tx, linkedChild ?? null)
  const d = deriveTransactionDisplay(tx, currency, realized ?? null, rates, {
    transferPair,
  })

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

      {/* Platform — a linked transfer pair shows source → destination */}
      <TableCell>
        {transferPair && linkedChild ? (
          <TransferRoute source={tx} destination={linkedChild} />
        ) : tx.platforms ? (
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
        <TransactionTypeBadge
          type={tx.type}
          display={transferPair ? TRANSFER_PAIR_DISPLAY : undefined}
        />
      </TableCell>

      {/* Quantity */}
      <TableCell className={d.amountColor}>
        <span className="font-medium tabular-nums">
          {d.sign}
          {formatTxQuantity(tx.amount)}
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
        <TransactionRowActions tx={tx} linkedChild={linkedChild ?? null} />
      </TableCell>
    </TableRow>
  )
}
