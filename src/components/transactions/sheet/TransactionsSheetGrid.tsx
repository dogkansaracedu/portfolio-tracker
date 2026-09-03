import { Fragment, useEffect, useMemo, useRef, useState } from "react"
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
import { autoResolveSentinels } from "./autoResolveSentinels"
import { ResolveAssetsStepper } from "./ResolveAssetsStepper"
import { CellShell } from "./cells/CellShell"
import { DateCell } from "./cells/DateCell"
import { AssetCell } from "./cells/AssetCell"
import { PlatformCell } from "./cells/PlatformCell"
import { TypeCell } from "./cells/TypeCell"
import { NumberCell } from "./cells/NumberCell"
import { TotalCostCell } from "./cells/TotalCostCell"
import { CurrencyCell } from "./cells/CurrencyCell"
import { useTransactionMutations } from "@/hooks/useTransactions"
import {
  ROW_SAVE_ERRORS,
  TRANSACTION_TYPES,
} from "@/lib/constants/transaction-types"
import { useTransactionModal } from "@/contexts/TransactionContext"
import { useTransactionData } from "@/contexts/TransactionDataContext"
import {
  bulkInsertTransactions,
  fetchTransactions,
  type BulkInsertRow,
  type TransactionWithDetails,
} from "@/lib/queries/transactions"
import { ensureHistoricalRatesForDates } from "@/lib/queries/exchangeRates"
import type { UnresolvedReason } from "@/lib/queries/assets"
import { useAuth } from "@/hooks/useAuth"
import { bn } from "@/lib/config"
import {
  assetNativeCurrency,
  currencyForAssetId,
} from "@/lib/constants/assets"
import type { Asset, Platform, TransactionInsert } from "@/types/database"
import { cn } from "@/lib/utils"

interface Controls {
  hasChanges: boolean
  saving: boolean
  loading: boolean
  /** Why the last Save refused the whole batch, if it did — one reason for
   *  an all-or-nothing insert, shown once by the page chrome. */
  batchError: string | null
  counts: { new: number; dirty: number; deleted: number; invalid: number; clean: number }
  /** Current grid rows (loaded + unsaved). Lets the import buttons dedup
   *  against rows already appended in this session. */
  rows: SheetRow[]
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
  /** Called after the auto-resolve flow creates new assets so the parent's
   *  `assets` prop catches up. */
  refetchAssets: () => Promise<void>
}

/**
 * The status marker rides the row's FIRST CELL, not the `<tr>`. This table is
 * `border-separate`, and in CSS's separated-borders model a row cannot have a
 * border at all — the old `border-l-2` on the `<tr>` painted nothing, so
 * "Review highlighted rows" pointed at rows that were never highlighted.
 * The first cell is also the pinned column, so the marker survives a sideways
 * scroll on a phone.
 */
const ROW_STATUS_TINT: Record<SheetRow["status"], string> = {
  clean: "",
  dirty: "[&>td:first-child]:border-l-2 [&>td:first-child]:border-l-amber-400",
  new: "[&>td:first-child]:border-l-2 [&>td:first-child]:border-l-emerald-400",
  invalid:
    "[&>td:first-child]:border-l-2 [&>td:first-child]:border-l-destructive",
  deleted: "",
}

/**
 * Everything wrong with one row, in one line: the failing cells' reasons (the
 * ring on each cell says which cell) then the server's own refusal. Deduped —
 * two cells failing "Not a number" is one thing to read, and the rings already
 * count them.
 *
 * `row.errors` is written by `validateRow` in its fixed field order, so the
 * reasons read left-to-right in column order.
 */
function rowErrorLine(row: SheetRow): string | null {
  const reasons = Object.values(row.errors).filter(
    (m): m is string => Boolean(m),
  )
  if (row.saveError) reasons.push(row.saveError)
  if (reasons.length === 0) return null
  return [...new Set(reasons)].join(" · ")
}

function localDayAsUtcMidnight(date: string): string {
  return `${date}T00:00:00Z`
}

const COL_COUNT = 10

/**
 * The first two columns are pinned on a phone: without them a sideways scroll
 * of a 690px grid inside 390px loses which row you are editing. Row number is
 * `w-10` (40px), so the ticker column pins at `left-10`. Both need an opaque
 * background — the columns they scroll over would otherwise show through.
 */
const PINNED_ROW_NUMBER_CLASS =
  "max-sm:sticky max-sm:left-0 max-sm:w-10 max-sm:min-w-10 max-sm:bg-background"
const PINNED_TICKER_CLASS =
  "max-sm:sticky max-sm:left-10 max-sm:w-[7.5rem] max-sm:bg-background"

/**
 * Two sticky layers meet in this grid: the `thead` (vertically) and the two
 * pinned columns (horizontally). The header must win where they cross.
 *
 * A `z-index` on the sticky `thead` opens its own stacking context, so any
 * `z-*` on the header cells inside it is measured against their siblings only
 * — it cannot lift them past a body cell. The layering therefore has to be
 * decided between `thead` and `tbody`: the header sits above every body cell,
 * and the pinned header cells need no z of their own (a positioned element
 * already paints over the static cells it scrolls across).
 */
const STICKY_HEADER_Z = "z-20"
const PINNED_BODY_CELL_Z = "max-sm:z-10"

export function TransactionsSheetGrid({
  assetId,
  assets,
  platforms,
  placeholderRowCount = 5,
  loadExisting = true,
  onControlsReady,
  refetchAssets,
}: Props) {
  const { user } = useAuth()
  const { txVersion, bumpTxVersion } = useTransactionModal()
  const { refresh: refreshTxData, rates } = useTransactionData()
  const {
    rows,
    pendingDeletes,
    counts,
    hasChanges,
    loadRows,
    editCell,
    setRowAsset,
    addBlankRow,
    appendRows,
    deleteRow,
    discardAll,
    validateAll,
    commitSaveSuccess,
    markSaveError,
    resolveAssetSentinel,
  } = useTransactionsSheetState()

  // When Save discovers unknown tickers, we auto-resolve them via Yahoo;
  // anything that doesn't resolve cleanly is queued here and shown in the
  // stepper for manual entry. The commit pauses until the queue empties.
  const [pendingSentinels, setPendingSentinels] = useState<string[]>([])
  const [stepperOpen, setStepperOpen] = useState(false)
  const [stepperReasons, setStepperReasons] = useState<
    Record<string, UnresolvedReason>
  >({})

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  // The reason an atomic bulk insert refused the whole batch. Row-level
  // failures (a per-row update, a missing returned id) stay on their row.
  const [batchError, setBatchError] = useState<string | null>(null)
  // Suppress txVersion-driven reloads while we're saving — each insert/edit
  // bumps txVersion, and we don't want our own bumps to clobber the buffer
  // before commitSaveSuccess lands.
  const savingRef = useRef(false)
  // editTransaction + removeTransaction stay per-row (rare in the bulk-add
  // path); inserts now batch through the bulk_insert_transactions RPC. The
  // grid fetches its own rows below, so we only want the mutation actions —
  // no second full-table fetch from the hook.
  const { editTransaction, removeTransaction } = useTransactionMutations()

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
        loadRows(txs.filter(isGridEditable))
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
      // Existing rows first (newest date on top); brand-new rows go to the
      // bottom in insertion order so a clicked placeholder / pasted import row
      // appears where you added it instead of jumping to the top. Array.sort
      // is stable, so returning 0 among new rows preserves insertion order.
      [...rows].sort((a, b) => {
        const aNew = a.txId == null
        const bNew = b.txId == null
        if (aNew !== bNew) return aNew ? 1 : -1
        if (aNew && bNew) return 0
        return b.date.localeCompare(a.date)
      }),
    [rows],
  )

  const save = async () => {
    if (!user) return
    setBatchError(null)
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
        offenders.length === 1
          ? "1 row has errors"
          : `${offenders.length} rows have errors`,
      )
      return
    }

    const uniqueSentinels = Array.from(
      new Set(
        rows.filter((r) => isNewAssetSentinel(r.assetId)).map((r) => r.assetId),
      ),
    )

    if (uniqueSentinels.length === 0) {
      await runCommit()
      return
    }

    const { resolvedMap, unresolved, createdAny } = await autoResolveSentinels({
      userId: user.id,
      sentinels: uniqueSentinels,
      assets,
      refetchAssets,
    })

    for (const [sentinel, info] of resolvedMap.entries()) {
      resolveAssetSentinel(sentinel, info.id, assetNativeCurrency(info))
    }

    if (createdAny) {
      toast.success(
        `Resolved ${resolvedMap.size} ticker${resolvedMap.size === 1 ? "" : "s"}`,
      )
    }

    const substitutedRows: SheetRow[] = rows.map((r) => {
      const info = resolvedMap.get(r.assetId)
      return info
        ? { ...r, assetId: info.id, priceCurrency: assetNativeCurrency(info) }
        : r
    })

    if (unresolved.length === 0) {
      await runCommit(substitutedRows)
      return
    }

    const reasonsMap: Record<string, UnresolvedReason> = {}
    for (const u of unresolved) {
      reasonsMap[u.sentinel] = u.reason
    }
    setStepperReasons(reasonsMap)
    setPendingSentinels(unresolved.map((u) => u.sentinel))
    setStepperOpen(true)
    // saving stays true; cleared on stepper finish or cancel.
  }

  const runCommit = async (rowsOverride?: SheetRow[]) => {
    if (!user) return
    const effectiveRows = rowsOverride ?? rows
    let okCount = 0
    let errCount = 0

    for (const del of pendingDeletes) {
      const orig = effectiveRows.find((r) => r.rowKey === del.rowKey)
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

    for (const row of effectiveRows) {
      if (row.status !== "dirty" || !row.txId || !row.original) continue
      // Never write linked_tx_id on an edit — an existing transfer_in may be
      // linked to its transfer_out, and the grid has no pairing UI; sending
      // the insert default (null) would silently sever the pair.
      const { linked_tx_id: _omit, ...payload } = buildPayload(row)
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
          err instanceof Error ? err.message : ROW_SAVE_ERRORS.update,
        )
      }
    }

    // Inserts go through the bulk_insert_transactions RPC — one round-trip
    // for the whole batch, atomic, server-side balance recompute. We
    // collect the rows in order so the RPC's `row_index` lines up with
    // the rowKey we need to commit on success.
    const newRows = effectiveRows.filter((r) => r.status === "new")
    if (newRows.length > 0) {
      const payloads: BulkInsertRow[] = newRows.map(buildBulkPayload)
      try {
        const created = await bulkInsertTransactions(payloads)
        const byIndex = new Map(created.map((c) => [c.row_index, c.tx_id]))
        for (let i = 0; i < newRows.length; i++) {
          const txId = byIndex.get(i)
          if (txId) {
            commitSaveSuccess(newRows[i].rowKey, txId)
            okCount++
          } else {
            errCount++
            markSaveError(newRows[i].rowKey, ROW_SAVE_ERRORS.missingId)
          }
        }
        // Backfill TCMB rates for any non-USD rows dated before our earliest
        // known rate. The single-row path does this per-write via
        // ensureHistoricalRate; the bulk RPC skipped it, so a pre-history
        // non-USD import would convert with a missing rate. Scoped to
        // genuinely-uncovered dates so a normal in-range import fires nothing.
        // (getExchangeRateForDate's earliest-rate fallback is the safety net.)
        const earliestRate =
          rates.length > 0 ? rates[0].date.slice(0, 10) : null
        const uncoveredDates = new Set<string>()
        for (const r of newRows) {
          if (r.priceCurrency.toUpperCase() === "USD") continue
          const day = r.date.slice(0, 10)
          if (earliestRate === null || day < earliestRate) {
            uncoveredDates.add(day)
          }
        }
        if (uncoveredDates.size > 0) {
          await ensureHistoricalRatesForDates(uncoveredDates)
        }

        // The RPC writes directly to the DB; the existing per-write
        // helpers normally bump txVersion + refresh. Do it once here.
        bumpTxVersion()
        await refreshTxData()
      } catch (err) {
        // The whole batch rolls back atomically on the SQL side, so this is
        // ONE failure with one reason — not one per row. Stamping the message
        // under every row printed it N times and, when the server named a row
        // ("… for row 1"), pointed at rows it had never complained about. The
        // rows are marked invalid so the tint and the counts are right; the
        // reason itself goes to the footer, beside the Save that produced it.
        const message =
          err instanceof Error ? err.message : ROW_SAVE_ERRORS.bulkInsert
        setBatchError(message)
        for (const row of newRows) {
          markSaveError(row.rowKey, null)
        }
        errCount += newRows.length
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

  const handleStepperResolved = (
    sentinel: string,
    realAssetId: string,
    priceCurrency: string,
  ) => {
    resolveAssetSentinel(sentinel, realAssetId, priceCurrency)
  }

  const handleStepperAllResolved = async () => {
    setStepperOpen(false)
    setPendingSentinels([])
    setStepperReasons({})
    await runCommit()
  }

  const handleStepperCancel = () => {
    setStepperOpen(false)
    setPendingSentinels([])
    setStepperReasons({})
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
      .then((txs: TransactionWithDetails[]) =>
        loadRows(txs.filter(isGridEditable)),
      )
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
      batchError,
      counts,
      rows,
      addBlankRow: () =>
        addBlankRow({
          assetId,
          priceCurrency: currencyForAssetId(assets, assetId),
        }),
      // Default each imported row's currency from its resolved asset (overrides
      // a parser that guessed). A `new:` sentinel resolves to no asset, so
      // asking for its currency would answer DEFAULT_CURRENCY and silently
      // relabel e.g. a TRY BIST buy as USD — those rows keep the parsed
      // currency until the resolve step assigns a real asset.
      appendRows: (incoming) =>
        appendRows(
          incoming.map((r) =>
            r.assetId && !isNewAssetSentinel(r.assetId)
              ? { ...r, priceCurrency: currencyForAssetId(assets, r.assetId) }
              : r,
          ),
        ),
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
    batchError,
    counts.new,
    counts.dirty,
    counts.deleted,
    counts.invalid,
    counts.clean,
    rows,
    pendingDeletes,
    assets,
  ])

  // Empty placeholder rows, rendered after the real ones and numbered as if
  // they continued the list. Clicking any of them adds a real new row.
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
      <TableHeader
        className={cn(
          "sticky top-0 bg-background shadow-[inset_0_-1px_0_var(--border)]",
          STICKY_HEADER_Z,
        )}
      >
        <TableRow className="hover:bg-transparent">
          <TableHead
            className={cn(
              "w-10 px-2 py-3 text-right text-xs font-normal text-muted-foreground",
              PINNED_ROW_NUMBER_CLASS,
            )}
          />
          <TableHead
            className={cn(
              "px-2 py-3 text-xs font-medium text-muted-foreground",
              PINNED_TICKER_CLASS,
            )}
          >
            Ticker / Company
          </TableHead>
          <TableHead className="px-2 py-3 text-xs font-medium text-muted-foreground">
            Transaction Type
          </TableHead>
          <TableHead className="px-2 py-3 text-xs font-medium text-muted-foreground">
            Date
          </TableHead>
          <TableHead className="px-2 py-3 text-right text-xs font-medium text-muted-foreground">
            Shares / Qty
          </TableHead>
          <TableHead className="px-2 py-3 text-right text-xs font-medium text-muted-foreground">
            Price
          </TableHead>
          <TableHead className="px-2 py-3 text-xs font-medium text-muted-foreground">
            Currency
          </TableHead>
          <TableHead className="px-2 py-3 text-right text-xs font-medium text-muted-foreground">
            Total Cost
          </TableHead>
          <TableHead className="px-2 py-3 text-right text-xs font-medium text-muted-foreground">
            Fee
          </TableHead>
          <TableHead className="px-2 py-3 text-xs font-medium text-muted-foreground">
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
          visibleRows.map((row, idx) => {
          const errorLine = rowErrorLine(row)
          return (
            <Fragment key={row.rowKey}>
            <TableRow
              className={cn("border-b last:border-b", ROW_STATUS_TINT[row.status])}
              data-status={row.status}
            >
              <TableCell
                className={cn(
                  "w-10 px-2 py-2 text-right align-middle text-xs text-muted-foreground tabular-nums",
                  PINNED_BODY_CELL_Z,
                  PINNED_ROW_NUMBER_CLASS,
                )}
              >
                {idx + 1}
              </TableCell>
              <AssetCell
                className={cn(PINNED_BODY_CELL_Z, PINNED_TICKER_CLASS)}
                value={row.assetId}
                assets={assets}
                error={row.errors.assetId}
                readOnly={Boolean(assetId)}
                onChange={(v) =>
                  setRowAsset(row.rowKey, v, currencyForAssetId(assets, v))
                }
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
              <CurrencyCell
                value={row.priceCurrency}
                error={row.errors.priceCurrency}
                onChange={(v) => editCell(row.rowKey, "priceCurrency", v)}
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
            {/* What is wrong with the row above, on the row the footer's
                "Review highlighted rows" points at: the failing cells'
                reasons, then the server's own refusal. It spans the grid and
                the text sticks to the Ticker column's left edge, so a
                sideways-scrolled phone still reads it without leaving the
                row-number gutter. */}
            {errorLine && (
              <TableRow
                className={cn(
                  "hover:bg-transparent",
                  ROW_STATUS_TINT[row.status],
                )}
                data-row-error=""
              >
                <TableCell colSpan={COL_COUNT + 1} className="px-2 pt-0 pb-2">
                  {/* The cell spans the whole (wider-than-the-screen) grid,
                      so the line is capped at the scroll area's own width and
                      wraps inside it — otherwise its tail sat off the right
                      edge of a phone, unreachable, since the sticky start
                      never moves. This page owns the full viewport at every
                      width, so `100vw` IS the scroll area. `whitespace-normal`
                      is required — `TableCell` is `whitespace-nowrap`, which
                      let the line run past that cap instead of wrapping in
                      it. */}
                  <span className="sticky left-12 inline-block max-w-[calc(100vw-4rem)] whitespace-normal text-xs text-destructive">
                    {errorLine}
                  </span>
                </TableCell>
              </TableRow>
            )}
            </Fragment>
          )
          })}

        {!loading &&
          placeholders.map((i) => {
            const num = visibleRows.length + i + 1
            return (
              <TableRow
                key={`placeholder-${i}`}
                onClick={() =>
                  addBlankRow({
                    assetId,
                    priceCurrency: currencyForAssetId(assets, assetId),
                  })
                }
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
      reasons={stepperReasons}
    />
    </>
  )
}

/** The grid never shows a linked transfer_in — it's the auto-managed
 *  destination side of a transfer pair, kept in lockstep through its
 *  transfer_out parent (editing both sides as independent grid rows would
 *  let one save silently overwrite the other). */
function isGridEditable(tx: TransactionWithDetails): boolean {
  return !(tx.type === TRANSACTION_TYPES.TRANSFER_IN && tx.linked_tx_id)
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
    related_asset_id: row.relatedAssetId ?? null,
    linked_tx_id: null,
    notes: row.notes || null,
  }
}

/** Payload shape for the bulk_insert_transactions RPC. Same field set as
 *  buildPayload but uses string-encoded numerics so BigNumber precision
 *  survives the JSONB roundtrip (Postgres numeric parses strings cleanly
 *  but JS Number can lose tail digits past ~15 sig figs). */
function buildBulkPayload(row: SheetRow): BulkInsertRow {
  const amount = bn(row.amount)
  const unitPrice = bn(row.unitPrice || "0")
  const totalCost = amount.times(unitPrice)
  const fee = row.fee ? bn(row.fee) : bn(0)
  return {
    asset_id: row.assetId,
    platform_id: row.platformId,
    type: row.type,
    date: localDayAsUtcMidnight(row.date),
    amount: amount.toFixed(),
    unit_price: unitPrice.toFixed(),
    price_currency: row.priceCurrency,
    total_cost: totalCost.toFixed(),
    fee: fee.toFixed(),
    fee_currency: row.fee ? row.priceCurrency : null,
    related_asset_id: row.relatedAssetId ?? null,
    notes: row.notes || null,
    // Bulk buys debit cash on their own platform so portfolio totals
    // don't inflate; sells already auto-credit cash in the RPC.
    funding_platform_id: row.type === "buy" ? row.platformId : null,
  }
}

export type { Controls as TransactionsSheetControls }
