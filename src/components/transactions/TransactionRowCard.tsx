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

export function TransactionRowCard({
  transaction,
  linkedChild,
  currency,
  realized,
}: Props) {
  const tx = transaction
  const { rates } = useTransactionData()
  const d = deriveTransactionDisplay(tx, currency, realized ?? null, rates)

  return (
    <div className="rounded-lg border p-3">
      {/* Top: date · type badge + actions */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">
          {formatTxDate(tx.date)}
        </span>
        <div className="flex items-center gap-1">
          <TransactionTypeBadge type={tx.type} />
          <TransactionRowActions tx={tx} />
        </div>
      </div>

      {/* Middle: asset · platform */}
      <div className="mt-2 flex items-center justify-between gap-2">
        <TransactionAssetLabel tx={tx} linkedChild={linkedChild ?? null} />
        {tx.platforms ? (
          <div className="flex shrink-0 items-center gap-1.5">
            <PlatformDot color={tx.platforms.color} />
            <span className="text-sm">{tx.platforms.name}</span>
          </div>
        ) : (
          <span className="text-muted-foreground">--</span>
        )}
      </div>

      {/* Bottom: amount · total (+ realized) */}
      <div className="mt-2 flex items-end justify-between gap-2 border-t pt-2">
        <div className="flex flex-col">
          <span className="text-xs text-muted-foreground">Amount</span>
          <span className={`font-medium tabular-nums ${d.amountColor}`}>
            {d.sign}
            {new Intl.NumberFormat("en-US", {
              minimumFractionDigits: 0,
              maximumFractionDigits: 8,
            }).format(tx.amount)}
          </span>
          <span className="text-xs tabular-nums text-muted-foreground">
            @ {formatCurrency(tx.unit_price, d.nativeCurrency)}
          </span>
        </div>
        <div className="flex flex-col text-right">
          <span className="text-xs text-muted-foreground">Total</span>
          <span className="tabular-nums font-medium">
            {formatCurrency(tx.total_cost, d.nativeCurrency)}
            {d.convertedTotal !== null && (
              <span className="ml-1 text-xs font-normal text-muted-foreground">
                (~{formatCurrency(d.convertedTotal, currency)})
              </span>
            )}
          </span>
          <RealizedPnLLine display={d} />
        </div>
      </div>
    </div>
  )
}
