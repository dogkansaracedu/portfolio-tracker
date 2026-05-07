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
import { formatCurrency } from "@/lib/prices"
import { useTransactionModal } from "@/contexts/TransactionContext"
import { useTransactions } from "@/hooks/useTransactions"
import { toast } from "sonner"
import type { TransactionWithDetails } from "@/lib/queries/transactions"
import type { TransactionType } from "@/types/database"

const POSITIVE_TYPES: TransactionType[] = ["buy", "transfer_in", "dividend", "interest"]

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
  currency: "USD" | "TRY"
}

export function TransactionRow({ transaction }: Props) {
  const tx = transaction
  const { openTransactionModal } = useTransactionModal()
  const { removeTransaction } = useTransactions()
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const isPositive = POSITIVE_TYPES.includes(tx.type)
  const sign = isPositive ? "+" : "-"
  const amountColor = isPositive ? "text-green-600" : "text-red-600"
  const txCurrency: "USD" | "TRY" = tx.price_currency === "TRY" ? "TRY" : "USD"

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
          </div>
        </TableCell>

        {/* Platform */}
        <TableCell>
          {tx.platforms ? (
            <div className="flex items-center gap-1.5">
              <span
                className="inline-block size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: tx.platforms.color }}
              />
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
          {formatCurrency(tx.unit_price, txCurrency)}
        </TableCell>

        {/* Total */}
        <TableCell className="tabular-nums font-medium">
          {formatCurrency(tx.total_cost, txCurrency)}
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
