import { useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import {
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
  TableCell,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Trash2 } from "lucide-react"
import { useTransactionsSheetState } from "./useTransactionsSheetState"
import type { SheetRow } from "./types"
import { validateRow } from "./validation"
import { isNewAssetSentinel } from "./sentinel"
import { ResolveAssetsStepper } from "./ResolveAssetsStepper"
import { CellShell } from "./cells/CellShell"
import { DateCell } from "./cells/DateCell"
import { AssetCell } from "./cells/AssetCell"
import { PlatformCell } from "./cells/PlatformCell"
import { TypeCell } from "./cells/TypeCell"
import { NumberCell } from "./cells/NumberCell"
import { TotalCostCell } from "./cells/TotalCostCell"
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

interface Controls {
  hasChanges: boolean
  saving: boolean
  loading: boolean
  counts: { new: number; dirty: number; deleted: number; invalid: number; clean: number }
  addBlankRow: () => void
  appendRows: (rows: Partial<SheetRow>[]) => void
  save: () => Promise<void>
  discard: () => void
}

interface Props {
  /** When set, asset column is locked and new rows prefill this asset. */
  assetId?: string
  assets: Asset[]
  platforms: Platform[]
  /** Number of empty placeholder rows to render below the real rows. */
  placeholderRowCount?: number
  /** When false, the grid never fetches existing transactions — pure
   *  add-new canvas. Defaults to true. */
  loadExisting?: boolean
  /** The grid lifts its imperative controls + state up so the page chrome
   *  (header import button, footer save/discard) can drive them. */
  onControlsReady?: (controls: Controls) => void
}

const ROW_STATUS_TINT: Record<SheetRow["status"], string> = {
  clean: "",
  dirty: "border-l-2 border-l-amber-400",
  new: "border-l-2 border-l-emerald-400",
  invalid: "border-l-2 border-l-destructive",
  deleted: "",
}

function localDayAsUtcMidnight(date: string): string {
  return `${date}T00:00:00Z`
}

const COL_COUNT = 9

export function TransactionsSheetGrid({
  assetId,
  assets,
  platforms,
  placeholderRowCount = 5,
  loadExisting = true,
  onControlsReady,
}: Props) {
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
    appendRows,
    deleteRow,
    discardAll,
    validateAll,
    commitSaveSuccess,
    markSaveError,
    resolveAssetSentinel,
  } = useTransactionsSheetState()

  // When Save discovers unknown tickers, we open the resolve stepper and
  // pause the actual commit until every sentinel becomes a real asset id.
  // `pendingSentinels` is the snapshot of sentinels that need resolving in
  // the current save attempt.
  const [pendingSentinels, setPendingSentinels] = useState<string[]>([])
  const [stepperOpen, setStepperOpen] = useState(false)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  // Suppress txVersion-driven reloads while we're saving — each insert/edit
  // bumps txVersion, and we don't want our own bumps to clobber the buffer
  // before commitSaveSuccess lands.
  const savingRef = useRef(false)
  const { addTransaction, editTransaction, removeTransaction } = useTransactions(
    assetId
      ? { assetId, includeLinkedChildren: true }
      : { includeLinkedChildren: false },
  )

  useEffect(() => {
    if (!user) return
    if (savingRef.current) return
    // Add-only mode: start with an empty buffer. No fetch, no existing rows.
    if (!loadExisting) {
      loadRows([])
      setLoading(false)
      return
    }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, assetId, txVersion, loadExisting])

  const visibleRows = useMemo(
    () =>
      [...rows].sort((a, b) => {
        return b.date.localeCompare(a.date) || (a.txId == null ? -1 : 1)
      }),
    [rows],
  )

  const save = async () => {
    if (!user) return
    setSaving(true)
    savingRef.current = true
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

    // Step 1: if any rows reference unknown tickers (sentinels), pause and
    // open the stepper. The stepper resolves each sentinel via reducer
    // dispatches; we resume the commit from `runCommit()` after all are
    // resolved.
    const uniqueSentinels = Array.from(
      new Set(rows.filter((r) => isNewAssetSentinel(r.assetId)).map((r) => r.assetId)),
    )
    if (uniqueSentinels.length > 0) {
      setPendingSentinels(uniqueSentinels)
      setStepperOpen(true)
      return // saving stays true; cleared on stepper finish or cancel.
    }

    await runCommit()
  }

  const runCommit = async () => {
    if (!user) return
    let okCount = 0
    let errCount = 0

    for (const del of pendingDeletes) {
      const orig = rows.find((r) => r.rowKey === del.rowKey)
      try {
        const oAsset = orig?.original?.assetId
        const oPlat = orig?.original?.platformId
        if (!oAsset || !oPlat) {
          throw new Error("Missing original asset/platform for delete")
        }
        await removeTransaction(del.txId, oAsset, oPlat)
        okCount++
      } catch (err) {
        errCount++
        toast.error(
          err instanceof Error ? `Delete failed: ${err.message}` : "Delete failed",
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

  const handleStepperResolved = (sentinel: string, realAssetId: string) => {
    resolveAssetSentinel(sentinel, realAssetId)
  }

  const handleStepperAllResolved = async () => {
    setStepperOpen(false)
    setPendingSentinels([])
    await runCommit()
  }

  const handleStepperCancel = () => {
    setStepperOpen(false)
    setPendingSentinels([])
    setSaving(false)
    savingRef.current = false
    toast.message("Save cancelled. New tickers left in the grid.")
  }

  const discard = () => {
    discardAll()
    // In add-only mode there's nothing on the server to reload back to —
    // discardAll already cleared the new rows.
    if (!loadExisting || !user) return
    fetchTransactions(
      user.id,
      assetId
        ? { assetId, includeLinkedChildren: true }
        : { includeLinkedChildren: false },
    )
      .then(loadRows)
      .catch((err: unknown) => {
        toast.error(err instanceof Error ? err.message : "Failed to reload")
      })
  }

  // Lift controls up to the page chrome.
  useEffect(() => {
    onControlsReady?.({
      hasChanges,
      saving,
      loading,
      counts,
      addBlankRow: () => addBlankRow({ assetId }),
      appendRows: appendRows as Controls["appendRows"],
      save,
      discard,
    })
    // We intentionally re-emit on every relevant value change so the page
    // chrome stays in sync without its own state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    hasChanges,
    saving,
    loading,
    counts.new,
    counts.dirty,
    counts.deleted,
    counts.invalid,
    counts.clean,
    rows,
    pendingDeletes,
  ])

  // Empty placeholder rows. Clicking any of them adds a real new row.
  // Rendered ABOVE the existing data so the "you can add here" affordance
  // is the first thing the user sees — otherwise they'd have to scroll past
  // all existing transactions to find it.
  const placeholders = Array.from(
    { length: Math.max(0, placeholderRowCount) },
    (_, i) => i,
  )

  return (
    <>
    {/* Bare <table> — not shadcn <Table> — because the latter wraps in
     *  `overflow-x-auto` which creates a nested scroll container and breaks
     *  the sticky thead. The caller (the page) owns the actual scroll area. */}
    <table className="w-full caption-bottom border-separate border-spacing-0 text-sm">
      <TableHeader className="sticky top-0 z-10 bg-background shadow-[inset_0_-1px_0_var(--border)]">
        <TableRow className="hover:bg-transparent">
          <TableHead className="w-10 px-2 py-3 text-right text-xs font-normal text-muted-foreground" />
          <TableHead className="px-2 py-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Ticker / Company
          </TableHead>
          <TableHead className="px-2 py-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Transaction type
          </TableHead>
          <TableHead className="px-2 py-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Date
            <span className="ml-1 normal-case text-muted-foreground/60">
              YYYY-MM-DD
            </span>
          </TableHead>
          <TableHead className="px-2 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Shares / Qty
          </TableHead>
          <TableHead className="px-2 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Price
          </TableHead>
          <TableHead className="px-2 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Total cost
          </TableHead>
          <TableHead className="px-2 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Fee
          </TableHead>
          <TableHead className="px-2 py-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Platform
          </TableHead>
          <TableHead className="w-10" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {loading && (
          <TableRow>
            <TableCell
              colSpan={COL_COUNT + 1}
              className="py-12 text-center text-muted-foreground"
            >
              Loading transactions…
            </TableCell>
          </TableRow>
        )}

        {!loading &&
          visibleRows.map((row, idx) => (
            <TableRow
              key={row.rowKey}
              className={cn("border-b last:border-b", ROW_STATUS_TINT[row.status])}
              data-status={row.status}
            >
              <TableCell className="w-10 px-2 py-2 text-right align-middle text-xs text-muted-foreground tabular-nums">
                {idx + 1}
              </TableCell>
              <AssetCell
                value={row.assetId}
                assets={assets}
                error={row.errors.assetId}
                readOnly={Boolean(assetId)}
                onChange={(v) => editCell(row.rowKey, "assetId", v)}
              />
              <TypeCell
                value={row.type}
                error={row.errors.type}
                onChange={(v) => editCell(row.rowKey, "type", v)}
              />
              <DateCell
                value={row.date}
                error={row.errors.date}
                onChange={(v) => editCell(row.rowKey, "date", v)}
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
              <TotalCostCell
                amount={row.amount}
                unitPrice={row.unitPrice}
                currency={row.priceCurrency}
              />
              <NumberCell
                value={row.fee}
                error={row.errors.fee}
                placeholder="0"
                onChange={(v) => editCell(row.rowKey, "fee", v)}
              />
              <PlatformCell
                value={row.platformId}
                platforms={platforms}
                error={row.errors.platformId}
                onChange={(v) => editCell(row.rowKey, "platformId", v)}
              />
              <CellShell className="w-10">
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => deleteRow(row.rowKey)}
                  title="Delete row"
                >
                  <Trash2 className="size-3.5 text-muted-foreground" />
                </Button>
              </CellShell>
            </TableRow>
          ))}

        {!loading &&
          placeholders.map((i) => {
            const num = visibleRows.length + i + 1
            return (
              <TableRow
                key={`placeholder-${i}`}
                onClick={() => addBlankRow({ assetId })}
                className="cursor-pointer border-b text-muted-foreground/60 hover:bg-accent/40"
                title="Click to add a row"
              >
                <TableCell className="w-10 px-2 py-4 text-right align-middle text-xs tabular-nums">
                  {num}
                </TableCell>
                <TableCell colSpan={COL_COUNT} className="px-2 py-4">
                  &nbsp;
                </TableCell>
              </TableRow>
            )
          })}
      </TableBody>
    </table>

    <ResolveAssetsStepper
      sentinels={pendingSentinels}
      open={stepperOpen}
      onResolved={handleStepperResolved}
      onAllResolved={handleStepperAllResolved}
      onCancel={handleStepperCancel}
    />
    </>
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

export type { Controls as TransactionsSheetControls }
