import { useState } from "react"
import { TableRow, TableCell } from "@/components/ui/table"
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
import { useTransactions } from "@/hooks/useTransactions"
import { useTransactionData } from "@/contexts/TransactionDataContext"
import { convertOnDate } from "@/lib/pnl/currency"
import { toast } from "sonner"
import type { TransactionWithDetails } from "@/lib/queries/transactions"
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

function truncateNotes(notes: string | null, maxLen = 30): string {
  if (!notes) return ""
  return notes.length > maxLen ? notes.slice(0, maxLen) + "..." : notes
}

interface Props {
  transaction: TransactionWithDetails
  linkedChild?: TransactionWithDetails | null
  currency: "USD" | "TRY"
}

export function TransactionRow({ transaction, linkedChild, currency }: Props) {
  const tx = transaction
  const { openTransactionModal } = useTransactionModal()
  const { removeTransaction } = useTransactions()
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
          <div className="flex flex-col">
            <span className="font-medium">{tx.assets?.name ?? "Unknown"}</span>
            <span className="text-xs text-muted-foreground">
              {tx.assets?.ticker ?? ""}
            </span>
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
        </TableCell>

        {/* Total */}
        <TableCell className="tabular-nums font-medium">
          {formatCurrency(tx.total_cost, nativeCurrency)}
          {convertedTotal !== null && (
            <span className="ml-1 text-xs font-normal text-muted-foreground">
              (~{formatCurrency(convertedTotal, currency)})
            </span>
          )}
        </TableCell>

        {/* Notes */}
        <TableCell
          className="max-w-[150px] text-muted-foreground"
          title={tx.notes ?? undefined}
        >
          {truncateNotes(tx.notes)}
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
