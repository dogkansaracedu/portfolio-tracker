import { useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
  TableCell,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Trash2, Plus } from "lucide-react"
import { useTransactionsSheetState } from "./useTransactionsSheetState"
import type { SheetRow } from "./types"
import { validateRow } from "./validation"
import { CellShell } from "./cells/CellShell"
import { DateCell } from "./cells/DateCell"
import { AssetCell } from "./cells/AssetCell"
import { PlatformCell } from "./cells/PlatformCell"
import { TypeCell } from "./cells/TypeCell"
import { NumberCell } from "./cells/NumberCell"
import { CurrencyCell } from "./cells/CurrencyCell"
import { TextCell } from "./cells/TextCell"
import { useTransactions } from "@/hooks/useTransactions"
import { useTransactionModal } from "@/contexts/TransactionContext"
import {
  fetchTransactions,
  type TransactionWithDetails,
} from "@/lib/queries/transactions"
import { useAuth } from "@/hooks/useAuth"
import { bn } from "@/lib/config"
import type { Asset, Platform, TransactionInsert } from "@/types/database"
import { cn } from "@/lib/utils"

interface Props {
  /** When set, asset column is locked and new rows prefill this asset. */
  assetId?: string
  assets: Asset[]
  platforms: Platform[]
}

const ROW_STATUS_TINT: Record<SheetRow["status"], string> = {
  clean: "",
  dirty: "border-l-4 border-l-amber-400",
  new: "border-l-4 border-l-emerald-400",
  invalid: "border-l-4 border-l-destructive",
  deleted: "",
}

function localDayAsUtcMidnight(date: string): string {
  return `${date}T00:00:00Z`
}

export function TransactionsSheetGrid({ assetId, assets, platforms }: Props) {
  const { user } = useAuth()
  const { txVersion } = useTransactionModal()
  const {
    rows,
    pendingDeletes,
    counts,
    hasChanges,
    loadRows,
    editCell,
    addBlankRow,
    deleteRow,
    discardAll,
    validateAll,
    commitSaveSuccess,
    markSaveError,
  } = useTransactionsSheetState()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  // Suppress the txVersion-driven re-load while *we* are the ones bumping it
  // — each insert/edit/delete inside handleSave triggers bumpTxVersion, and
  // we don't want that to clobber our in-flight buffer transitions. The
  // user's edits in OTHER components will still flow in normally because
  // savingRef is false then.
  const savingRef = useRef(false)
  const { addTransaction, editTransaction, removeTransaction } = useTransactions(
    assetId
      ? { assetId, includeLinkedChildren: true }
      : { includeLinkedChildren: false },
  )

  // Load rows from server on mount, and re-load whenever the underlying tx
  // version bumps (someone added/edited a tx elsewhere) — but only when the
  // buffer is clean. Otherwise we'd clobber in-flight edits.
  useEffect(() => {
    if (!user) return
    if (savingRef.current) return
    let cancelled = false
    setLoading(true)
    fetchTransactions(
      user.id,
      assetId
        ? { assetId, includeLinkedChildren: true }
        : { includeLinkedChildren: false },
    )
      .then((txs: TransactionWithDetails[]) => {
        if (cancelled) return
        loadRows(txs)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        toast.error(
          err instanceof Error ? err.message : "Failed to load transactions",
        )
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // hasChanges intentionally NOT in deps — once dirty, the user owns the
    // buffer until they Save or Discard.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, assetId, txVersion])

  const visibleRows = useMemo(
    () =>
      [...rows].sort((a, b) => {
        // newest dates first; new rows (no original) sink to the top of their
        // date so the user sees what they just added without scrolling.
        return b.date.localeCompare(a.date) || (a.txId == null ? -1 : 1)
      }),
    [rows],
  )

  const canSave = hasChanges && !saving

  const handleSave = async () => {
    if (!user) return
    setSaving(true)
    savingRef.current = true
    // Bulk-validate first; any error blocks save.
    validateAll()
    const offenders = rows
      .map((r) => ({ row: r, errors: validateRow(r) }))
      .filter(({ errors }) => Object.keys(errors).length > 0)
    if (offenders.length > 0) {
      setSaving(false)
      savingRef.current = false
      toast.error(
        `${offenders.length} row${offenders.length === 1 ? "" : "s"} have errors`,
      )
      return
    }

    // Phase order: deletes → updates → inserts. Within each phase, route
    // every write through the existing tx helpers so cash-pairing and
    // balance-recompute stay single-sourced.
    let okCount = 0
    let errCount = 0

    for (const del of pendingDeletes) {
      const orig = rows.find((r) => r.rowKey === del.rowKey)
      try {
        // We need asset/platform at delete time — fetch from row.original
        // (always present for existing rows).
        const oAsset = orig?.original?.assetId
        const oPlat = orig?.original?.platformId
        if (!oAsset || !oPlat) {
          // Falls back to the snapshot we cached earlier.
          throw new Error("Missing original asset/platform for delete")
        }
        await removeTransaction(del.txId, oAsset, oPlat)
        okCount++
      } catch (err) {
        errCount++
        toast.error(
          err instanceof Error
            ? `Delete failed: ${err.message}`
            : "Delete failed",
        )
      }
    }

    for (const row of rows) {
      if (row.status !== "dirty" || !row.txId || !row.original) continue
      const payload = buildPayload(row)
      try {
        await editTransaction(row.txId, payload, {
          assetId: row.original.assetId,
          platformId: row.original.platformId,
        })
        commitSaveSuccess(row.rowKey, row.txId)
        okCount++
      } catch (err) {
        errCount++
        markSaveError(
          row.rowKey,
          err instanceof Error ? err.message : "Update failed",
        )
      }
    }

    for (const row of rows) {
      if (row.status !== "new") continue
      const payload = buildPayload(row)
      try {
        const created = await addTransaction(payload)
        commitSaveSuccess(row.rowKey, created.id)
        okCount++
      } catch (err) {
        errCount++
        markSaveError(
          row.rowKey,
          err instanceof Error ? err.message : "Insert failed",
        )
      }
    }

    setSaving(false)
    savingRef.current = false
    if (errCount === 0) {
      toast.success(`Saved ${okCount} transaction${okCount === 1 ? "" : "s"}`)
    } else {
      toast.error(
        `Saved ${okCount}, ${errCount} failed. Review highlighted rows.`,
      )
    }
  }

  const handleDiscard = () => {
    discardAll()
    // Re-load from server so pendingDeletes resurrect cleanly.
    if (user) {
      fetchTransactions(
        user.id,
        assetId
          ? { assetId, includeLinkedChildren: true }
          : { includeLinkedChildren: false },
      )
        .then(loadRows)
        .catch((err: unknown) => {
          toast.error(
            err instanceof Error ? err.message : "Failed to reload",
          )
        })
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-auto">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-popover">
            <TableRow>
              <TableHead className="w-[140px]">Date</TableHead>
              <TableHead className="w-[200px]">Asset</TableHead>
              <TableHead className="w-[160px]">Platform</TableHead>
              <TableHead className="w-[130px]">Type</TableHead>
              <TableHead className="w-[130px] text-right">Amount</TableHead>
              <TableHead className="w-[130px] text-right">Unit Price</TableHead>
              <TableHead className="w-[80px]">Cur.</TableHead>
              <TableHead className="w-[130px] text-right">Fee</TableHead>
              <TableHead className="min-w-[160px]">Notes</TableHead>
              <TableHead className="w-[40px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={10} className="py-8 text-center text-muted-foreground">
                  Loading transactions…
                </TableCell>
              </TableRow>
            ) : visibleRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="py-8 text-center text-muted-foreground">
                  No transactions yet. Click <span className="font-medium">+ Add row</span> below.
                </TableCell>
              </TableRow>
            ) : (
              visibleRows.map((row) => (
                <TableRow
                  key={row.rowKey}
                  className={cn(ROW_STATUS_TINT[row.status])}
                  data-status={row.status}
                >
                  <DateCell
                    value={row.date}
                    error={row.errors.date}
                    onChange={(v) => editCell(row.rowKey, "date", v)}
                  />
                  <AssetCell
                    value={row.assetId}
                    assets={assets}
                    error={row.errors.assetId}
                    readOnly={Boolean(assetId)}
                    onChange={(v) => editCell(row.rowKey, "assetId", v)}
                  />
                  <PlatformCell
                    value={row.platformId}
                    platforms={platforms}
                    error={row.errors.platformId}
                    onChange={(v) => editCell(row.rowKey, "platformId", v)}
                  />
                  <TypeCell
                    value={row.type}
                    error={row.errors.type}
                    onChange={(v) => editCell(row.rowKey, "type", v)}
                  />
                  <NumberCell
                    value={row.amount}
                    error={row.errors.amount}
                    placeholder="0"
                    onChange={(v) => editCell(row.rowKey, "amount", v)}
                  />
                  <NumberCell
                    value={row.unitPrice}
                    error={row.errors.unitPrice}
                    placeholder="0.00"
                    onChange={(v) => editCell(row.rowKey, "unitPrice", v)}
                  />
                  <CurrencyCell
                    value={row.priceCurrency}
                    error={row.errors.priceCurrency}
                    onChange={(v) => editCell(row.rowKey, "priceCurrency", v)}
                  />
                  <NumberCell
                    value={row.fee}
                    error={row.errors.fee}
                    placeholder="0"
                    onChange={(v) => editCell(row.rowKey, "fee", v)}
                  />
                  <TextCell
                    value={row.notes}
                    error={row.errors.notes}
                    placeholder="—"
                    onChange={(v) => editCell(row.rowKey, "notes", v)}
                  />
                  <CellShell className="w-[40px]">
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => deleteRow(row.rowKey)}
                      title="Delete row"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </CellShell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Footer bar */}
      <div className="flex items-center justify-between gap-3 border-t bg-popover px-4 py-3">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => addBlankRow({ assetId })}
          >
            <Plus className="size-3.5" />
            Add row
          </Button>
          <span className="text-xs text-muted-foreground tabular-nums">
            {counts.new} new · {counts.dirty} dirty · {counts.deleted} deleted
            {counts.invalid > 0 && (
              <span className="ml-1 text-destructive">· {counts.invalid} invalid</span>
            )}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleDiscard}
            disabled={!hasChanges || saving}
          >
            Discard
          </Button>
          <Button size="sm" onClick={handleSave} disabled={!canSave}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </div>
    </div>
  )
}

function buildPayload(row: SheetRow): Omit<TransactionInsert, "user_id"> {
  const amount = bn(row.amount)
  const unitPrice = bn(row.unitPrice || "0")
  const totalCost = amount.times(unitPrice)
  const fee = row.fee ? bn(row.fee) : bn(0)
  return {
    asset_id: row.assetId,
    platform_id: row.platformId,
    type: row.type,
    date: localDayAsUtcMidnight(row.date),
    amount: amount.toNumber(),
    unit_price: unitPrice.toNumber(),
    price_currency: row.priceCurrency,
    total_cost: totalCost.toNumber(),
    fee: fee.toNumber(),
    fee_currency: row.fee ? row.priceCurrency : null,
    related_asset_id: null,
    linked_tx_id: null,
    notes: row.notes || null,
  }
}
