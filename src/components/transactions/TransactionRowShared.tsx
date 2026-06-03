import { useState } from "react"
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react"
import { toast } from "sonner"
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
import { AssetIcon } from "@/components/common/AssetIcon"
import { formatCurrency } from "@/lib/prices"
import { useTransactionModal } from "@/contexts/TransactionContext"
import { useTransactionMutations } from "@/hooks/useTransactions"
import { TRANSACTION_TYPES } from "@/lib/constants/transaction-types"
import {
  CURRENCY_SYMBOLS,
  type FiatCurrency,
} from "@/lib/constants/currencies"
import type { TransactionWithDetails } from "@/lib/queries/transactions"
import { formatTxDate, type TransactionDisplay } from "./transactionRowModel"

// Dropdown (edit/delete) + delete confirmation dialog. Owns its own local state
// so it can be dropped into either the desktop table row or the mobile card.
export function TransactionRowActions({ tx }: { tx: TransactionWithDetails }) {
  const { openTransactionModal } = useTransactionModal()
  const { removeTransaction } = useTransactionMutations()
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const handleEdit = () => openTransactionModal({ edit: tx })

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

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete transaction?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the {tx.type} of {tx.amount}{" "}
              {tx.assets?.ticker ?? ""} on {formatTxDate(tx.date)}. Holdings will
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

// Asset icon + ticker, with the linked-child funding line or the "external cash"
// hint underneath. Identical in the table and the card.
export function TransactionAssetLabel({
  tx,
  linkedChild,
}: {
  tx: TransactionWithDetails
  linkedChild: TransactionWithDetails | null
}) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      {tx.assets && <AssetIcon asset={tx.assets} size="sm" />}
      <div className="flex min-w-0 flex-col">
        <span className="truncate font-medium">
          {tx.assets?.ticker ?? "Unknown"}
        </span>
        {linkedChild && (
          <span className="truncate text-xs italic text-muted-foreground">
            {linkedChild.type === TRANSACTION_TYPES.CASH_CREDIT
              ? `+${CURRENCY_SYMBOLS[linkedChild.price_currency as FiatCurrency] ?? ""}${Number(linkedChild.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${linkedChild.price_currency} → ${linkedChild.platforms?.name ?? "platform"}`
              : `−${CURRENCY_SYMBOLS[linkedChild.price_currency as FiatCurrency] ?? ""}${Number(linkedChild.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${linkedChild.price_currency} from ${linkedChild.platforms?.name ?? "platform"}`}
          </span>
        )}
        {tx.type === TRANSACTION_TYPES.BUY && !linkedChild && (
          <span className="text-xs italic text-muted-foreground">
            external cash
          </span>
        )}
      </div>
    </div>
  )
}

// Realized P&L sub-line shown under the Total. Renders nothing unless this is a
// sell with realized P&L. Color/sign follow the USD figure (see model).
export function RealizedPnLLine({ display }: { display: TransactionDisplay }) {
  if (!display.showRealized) return null
  const {
    realizedColor,
    nativeIsUsd,
    usdSign,
    realizedUsdAbs,
    realizedPct,
    nativeSign,
    realizedNativeAbs,
    nativeCurrency,
  } = display
  return (
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
  )
}
