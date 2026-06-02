import { useState } from "react"
import { TableRow, TableCell } from "@/components/ui/table"
import { AssetIcon } from "@/components/common/AssetIcon"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog"
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react"
import { TransactionTypeBadge } from "@/components/transactions/TransactionTypeSelector"
import { PlatformDot } from "@/components/common/PlatformDot"
import { formatCurrency } from "@/lib/prices"
import { useTransactionModal } from "@/contexts/TransactionContext"
import { useTransactionMutations } from "@/hooks/useTransactions"
import { useTransactionData } from "@/contexts/TransactionDataContext"
import { convertOnDate, fromUsdOnDate } from "@/lib/pnl/currency"
import { BN_HUNDRED } from "@/lib/config"
import { toast } from "sonner"
import type { TransactionWithDetails } from "@/lib/queries/transactions"
import type { RealizedPnLEntry } from "@/lib/pnl/types"
import {
  POSITIVE_TYPES,
  TRANSACTION_TYPES,
} from "@/lib/constants/transaction-types"
import {
  CURRENCY_SYMBOLS,
  isFiatCurrency,
  type FiatCurrency,
} from "@/lib/constants/currencies"

function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

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
  const { openTransactionModal } = useTransactionModal()
  const { removeTransaction } = useTransactionMutations()
  const { rates } = useTransactionData()
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const isPositive = POSITIVE_TYPES.includes(tx.type)
  const sign = isPositive ? "+" : "-"
  const amountColor = isPositive ? "text-green-600" : "text-red-600"
  const nativeCurrency: FiatCurrency = isFiatCurrency(tx.price_currency)
    ? tx.price_currency
    : currency
  const showConverted = nativeCurrency !== currency && rates.length > 0
  const convertedTotal = showConverted
    ? convertOnDate(tx.total_cost, nativeCurrency, currency, tx.date, rates).toNumber()
    : null
  const convertedUnitPrice = showConverted
    ? convertOnDate(tx.unit_price, nativeCurrency, currency, tx.date, rates).toNumber()
    : null

  // Realized P&L (FIFO) — sells only. The engine computes it in USD net of
  // fees; the % binds to the USD figure because USD is the source of truth for
  // returns (a position up in lira can be down in dollars when FX moves), and
  // so the whole sub-line's color follows the USD sign.
  const showRealized = tx.type === TRANSACTION_TYPES.SELL && realized != null
  const realizedPnlUsd = realized?.realizedPnlUsd ?? null
  const usdIsGain = realizedPnlUsd ? realizedPnlUsd.gte(0) : false
  const usdSign = usdIsGain ? "+" : "-"
  const realizedColor = usdIsGain ? "text-green-600" : "text-red-600"
  const realizedUsdAbs = realizedPnlUsd ? realizedPnlUsd.abs().toNumber() : 0

  // Prefer the engine's exact native P&L; fall back to converting the USD
  // figure at the sell-date rate for mixed-currency holdings.
  const nativePnlBn =
    realized?.nativePnl != null && realized.nativeCurrency === nativeCurrency
      ? realized.nativePnl
      : realizedPnlUsd
        ? fromUsdOnDate(realizedPnlUsd, nativeCurrency, tx.date, rates)
        : null
  const nativeSign = nativePnlBn?.gte(0) ? "+" : "-"
  const realizedNativeAbs = nativePnlBn ? nativePnlBn.abs().toNumber() : 0

  const realizedPctBn =
    realized && realized.costBasisUsd.gt(0)
      ? realized.realizedPnlUsd.div(realized.costBasisUsd).times(BN_HUNDRED)
      : null
  const realizedPct = realizedPctBn
    ? `${usdSign}${realizedPctBn.abs().toFixed(1)}%`
    : null
  const nativeIsUsd = nativeCurrency === "USD"

  const handleEdit = () => {
    openTransactionModal({ edit: tx })
  }

  const confirmDelete = async () => {
    setDeleting(true)
    try {
      await removeTransaction(tx.id, tx.asset_id, tx.platform_id)
      toast.success("Transaction deleted")
      setDeleteOpen(false)
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to delete transaction",
      )
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
      <TableRow>
        {/* Date */}
        <TableCell className="text-muted-foreground">
          {formatDate(tx.date)}
        </TableCell>

        {/* Asset */}
        <TableCell>
          <div className="flex items-center gap-2">
            {tx.assets && <AssetIcon asset={tx.assets} size="sm" />}
            <div className="flex flex-col">
              <span className="font-medium">{tx.assets?.ticker ?? "Unknown"}</span>
              {linkedChild && (
                <span className="text-xs text-muted-foreground italic">
                  {linkedChild.type === TRANSACTION_TYPES.CASH_CREDIT
                    ? `+${CURRENCY_SYMBOLS[linkedChild.price_currency as FiatCurrency] ?? ""}${Number(linkedChild.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${linkedChild.price_currency} → ${linkedChild.platforms?.name ?? "platform"}`
                    : `−${CURRENCY_SYMBOLS[linkedChild.price_currency as FiatCurrency] ?? ""}${Number(linkedChild.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${linkedChild.price_currency} from ${linkedChild.platforms?.name ?? "platform"}`}
                </span>
              )}
              {tx.type === TRANSACTION_TYPES.BUY && !linkedChild && (
                <span className="text-xs text-muted-foreground italic">
                  external cash
                </span>
              )}
            </div>
          </div>
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
          {formatCurrency(tx.unit_price, nativeCurrency)}
          {convertedUnitPrice !== null && (
            <span className="ml-1 text-xs font-normal text-muted-foreground">
              (~{formatCurrency(convertedUnitPrice, currency)})
            </span>
          )}
        </TableCell>

        {/* Total */}
        <TableCell className="tabular-nums font-medium">
          {formatCurrency(tx.total_cost, nativeCurrency)}
          {convertedTotal !== null && (
            <span className="ml-1 text-xs font-normal text-muted-foreground">
              (~{formatCurrency(convertedTotal, currency)})
            </span>
          )}
          {showRealized && (
            <div className={`mt-0.5 text-xs font-normal ${realizedColor}`}>
              {nativeIsUsd ? (
                <span>
                  {usdSign}
                  {formatCurrency(realizedUsdAbs, "USD")}
                  {realizedPct && ` (${realizedPct})`}
                  <span className="ml-1 text-muted-foreground">P&L</span>
                </span>
              ) : (
                <>
                  <div>
                    {nativeSign}
                    {formatCurrency(realizedNativeAbs, nativeCurrency)}
                    <span className="ml-1 text-muted-foreground">P&L</span>
                  </div>
                  <div className="text-muted-foreground">
                    ~{usdSign}
                    {formatCurrency(realizedUsdAbs, "USD")}
                    {realizedPct && ` (${realizedPct})`}
                  </div>
                </>
              )}
            </div>
          )}
        </TableCell>

        {/* Actions */}
        <TableCell className="text-right">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="ghost" size="icon-sm">
                  <MoreHorizontal className="size-4" />
                  <span className="sr-only">Actions</span>
                </Button>
              }
            />
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleEdit}>
                <Pencil className="size-4" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 className="size-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </TableCell>
      </TableRow>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete transaction?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the {tx.type} of {tx.amount}{" "}
              {tx.assets?.ticker ?? ""} on {formatDate(tx.date)}. Holdings will
              be recalculated. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                confirmDelete()
              }}
              disabled={deleting}
            >
              {deleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
