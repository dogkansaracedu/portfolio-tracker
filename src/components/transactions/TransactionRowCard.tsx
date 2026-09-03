import { TransactionTypeBadge } from "@/components/transactions/TransactionTypeSelector"
import { PlatformDot } from "@/components/common/PlatformDot"
import { formatCurrency } from "@/lib/prices"
import {
  formatTxDate,
  formatTxQuantity,
  type TransactionRowProps,
} from "./transactionRowModel"
import {
  TransactionRowActions,
  TransactionAssetLabel,
  TransferRoute,
  RealizedPnLLine,
  useTransactionRowDisplay,
} from "./TransactionRowShared"
import { TRANSFER_PAIR_DISPLAY } from "@/lib/constants/transaction-types"

export function TransactionRowCard(props: TransactionRowProps) {
  const { transaction: tx, linkedChild, currency } = props
  const { transferPair, display: d } = useTransactionRowDisplay(props)

  return (
    <div className="rounded-lg border p-3">
      {/* Top: date · type badge + actions */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">
          {formatTxDate(tx.date)}
        </span>
        <div className="flex items-center gap-1">
          <TransactionTypeBadge
            type={tx.type}
            display={transferPair ? TRANSFER_PAIR_DISPLAY : undefined}
          />
          <TransactionRowActions tx={tx} linkedChild={linkedChild ?? null} />
        </div>
      </div>

      {/* Middle: asset · platform (source → destination for a transfer pair) */}
      <div className="mt-2 flex items-center justify-between gap-2">
        <TransactionAssetLabel tx={tx} linkedChild={linkedChild ?? null} />
        {transferPair && linkedChild ? (
          <TransferRoute source={tx} destination={linkedChild} />
        ) : tx.platforms ? (
          <div className="flex shrink-0 items-center gap-1.5">
            <PlatformDot color={tx.platforms.color} />
            <span className="text-sm">{tx.platforms.name}</span>
          </div>
        ) : (
          <span className="text-muted-foreground">--</span>
        )}
      </div>

      {/* Bottom: quantity · total (+ realized) */}
      <div className="mt-2 flex items-end justify-between gap-2 border-t pt-2">
        <div className="flex flex-col">
          <span className="text-xs text-muted-foreground">Quantity</span>
          <span className="font-medium tabular-nums">
            {d.sign}
            {formatTxQuantity(tx.amount)}
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
