import { useReducer, useCallback, useMemo } from "react"
import { DEFAULT_CURRENCY } from "@/lib/constants/currencies"
import type { TransactionWithDetails } from "@/lib/queries/transactions"
import {
  snapshotFromTx,
  type RowCounts,
  type RowStatus,
  type SheetField,
  type SheetRow,
  type SheetSnapshot,
  type SheetState,
} from "./types"
import { validateRow } from "./validation"

/** Web-platform UUID — crypto.randomUUID is available in modern browsers and
 *  this app's runtime. No polyfill needed. */
function newRowKey(): string {
  return crypto.randomUUID()
}

function rowFromTx(tx: TransactionWithDetails): SheetRow {
  const snap = snapshotFromTx(tx)
  return {
    rowKey: newRowKey(),
    txId: tx.id,
    ...snap,
    status: "clean",
    original: snap,
    errors: {},
  }
}

function snapshotEquals(a: SheetSnapshot, b: SheetSnapshot): boolean {
  return (
    a.date === b.date &&
    a.assetId === b.assetId &&
    a.platformId === b.platformId &&
    a.type === b.type &&
    a.amount === b.amount &&
    a.unitPrice === b.unitPrice &&
    a.priceCurrency === b.priceCurrency &&
    a.fee === b.fee &&
    a.notes === b.notes
  )
}

function pickSnapshot(row: SheetRow): SheetSnapshot {
  return {
    date: row.date,
    assetId: row.assetId,
    platformId: row.platformId,
    type: row.type,
    amount: row.amount,
    unitPrice: row.unitPrice,
    priceCurrency: row.priceCurrency,
    fee: row.fee,
    notes: row.notes,
  }
}

interface BlankRowDefaults {
  assetId?: string
  platformId?: string
  priceCurrency?: string
}

function blankRow(defaults: BlankRowDefaults = {}): SheetRow {
  const today = (() => {
    const d = new Date()
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, "0")
    const day = String(d.getDate()).padStart(2, "0")
    return `${y}-${m}-${day}`
  })()
  return {
    rowKey: newRowKey(),
    txId: null,
    date: today,
    assetId: defaults.assetId ?? "",
    platformId: defaults.platformId ?? "",
    type: "buy",
    amount: "",
    unitPrice: "",
    priceCurrency: defaults.priceCurrency ?? DEFAULT_CURRENCY,
    fee: "",
    notes: "",
    status: "new",
    original: null,
    errors: {},
  }
}

type Action =
  | { kind: "load"; txs: TransactionWithDetails[] }
  | { kind: "edit"; rowKey: string; field: SheetField; value: string }
  | {
      kind: "setRowAsset"
      rowKey: string
      assetId: string
      priceCurrency: string
    }
  | { kind: "addBlank"; defaults?: BlankRowDefaults }
  | { kind: "appendRows"; rows: Partial<SheetSnapshot>[] }
  | { kind: "delete"; rowKey: string }
  | { kind: "discardAll" }
  | { kind: "validateAll" }
  | { kind: "commitSaveSuccess"; rowKey: string; txId: string }
  | { kind: "markSaveError"; rowKey: string; message: string }
  | { kind: "removeDeleted"; rowKey: string }
  | {
      kind: "resolveAssetSentinel"
      sentinel: string
      realAssetId: string
      priceCurrency: string
    }

function reduce(state: SheetState, action: Action): SheetState {
  switch (action.kind) {
    case "load":
      return {
        rows: action.txs.map(rowFromTx),
        pendingDeletes: [],
      }

    case "edit": {
      const next = state.rows.map((r) => {
        if (r.rowKey !== action.rowKey) return r
        const patched: SheetRow = {
          ...r,
          [action.field]: action.value,
        } as SheetRow
        // dirty-vs-clean recomputation: only existing rows can return to clean.
        let nextStatus: RowStatus = patched.status
        if (patched.status !== "new") {
          if (patched.original && snapshotEquals(pickSnapshot(patched), patched.original)) {
            nextStatus = "clean"
          } else {
            nextStatus = "dirty"
          }
        }
        return { ...patched, status: nextStatus, errors: {} }
      })
      return { ...state, rows: next }
    }

    case "setRowAsset": {
      // Asset and its native currency move together: picking/changing the
      // asset resets the price currency to the asset's quote currency (still
      // user-editable afterward). One pass so status recompute matches "edit".
      const next = state.rows.map((r) => {
        if (r.rowKey !== action.rowKey) return r
        const patched: SheetRow = {
          ...r,
          assetId: action.assetId,
          priceCurrency: action.priceCurrency,
        }
        let nextStatus: RowStatus = patched.status
        if (patched.status !== "new") {
          nextStatus =
            patched.original &&
            snapshotEquals(pickSnapshot(patched), patched.original)
              ? "clean"
              : "dirty"
        }
        return { ...patched, status: nextStatus, errors: {} }
      })
      return { ...state, rows: next }
    }

    case "addBlank":
      return { ...state, rows: [...state.rows, blankRow(action.defaults)] }

    case "appendRows": {
      const made: SheetRow[] = action.rows.map((partial) => {
        const base = blankRow()
        return {
          ...base,
          ...partial,
          status: "new" as RowStatus,
          original: null,
          errors: {},
        }
      })
      return { ...state, rows: [...state.rows, ...made] }
    }

    case "delete": {
      const target = state.rows.find((r) => r.rowKey === action.rowKey)
      if (!target) return state
      // New rows: drop outright. Existing rows: park in pendingDeletes, hide
      // from the grid. We do not flip status to "deleted" in-place because
      // TanStack would still render the row.
      if (target.txId == null) {
        return { ...state, rows: state.rows.filter((r) => r.rowKey !== action.rowKey) }
      }
      return {
        rows: state.rows.filter((r) => r.rowKey !== action.rowKey),
        pendingDeletes: [
          ...state.pendingDeletes,
          { rowKey: target.rowKey, txId: target.txId },
        ],
      }
    }

    case "discardAll": {
      // Re-hydrate existing rows from their `original` snapshot; drop new
      // rows; restore pendingDeletes (rebuild rows from a fresh load).
      const restored = state.rows
        .filter((r) => r.txId != null)
        .map((r) => {
          if (!r.original) return r
          return {
            ...r,
            ...r.original,
            status: "clean" as RowStatus,
            errors: {},
          }
        })
      // pendingDeletes need to come back as clean rows. The component will
      // re-load from server on discard for full safety; this branch just
      // makes the UI feel snappy until that completes.
      return { rows: restored, pendingDeletes: [] }
    }

    case "validateAll": {
      const next = state.rows.map((r) => {
        if (r.status === "clean") return r
        const errors = validateRow(r)
        const hasError = Object.keys(errors).length > 0
        const nextStatus: RowStatus = hasError ? "invalid" : r.status === "invalid" ? (r.txId ? "dirty" : "new") : r.status
        return { ...r, errors, status: nextStatus }
      })
      return { ...state, rows: next }
    }

    case "commitSaveSuccess": {
      const next = state.rows.map((r) => {
        if (r.rowKey !== action.rowKey) return r
        const snap = pickSnapshot(r)
        return {
          ...r,
          txId: action.txId,
          status: "clean" as RowStatus,
          original: snap,
          errors: {},
        }
      })
      return { ...state, rows: next }
    }

    case "markSaveError": {
      const next = state.rows.map((r) =>
        r.rowKey === action.rowKey
          ? {
              ...r,
              status: "invalid" as RowStatus,
              errors: { ...r.errors, notes: action.message },
            }
          : r,
      )
      return { ...state, rows: next }
    }

    case "removeDeleted":
      return {
        ...state,
        pendingDeletes: state.pendingDeletes.filter(
          (d) => d.rowKey !== action.rowKey,
        ),
      }

    case "resolveAssetSentinel": {
      // Replace the sentinel in every row's assetId with the real asset id
      // returned by the create call. Done in-place so the row's status (new
      // / dirty) is preserved.
      const next = state.rows.map((r) =>
        r.assetId === action.sentinel
          ? {
              ...r,
              assetId: action.realAssetId,
              priceCurrency: action.priceCurrency,
            }
          : r,
      )
      return { ...state, rows: next }
    }

    default:
      return state
  }
}

export function useTransactionsSheetState() {
  const [state, dispatch] = useReducer(reduce, {
    rows: [],
    pendingDeletes: [],
  })

  const loadRows = useCallback((txs: TransactionWithDetails[]) => {
    dispatch({ kind: "load", txs })
  }, [])

  const editCell = useCallback(
    (rowKey: string, field: SheetField, value: string) => {
      dispatch({ kind: "edit", rowKey, field, value })
    },
    [],
  )

  const setRowAsset = useCallback(
    (rowKey: string, assetId: string, priceCurrency: string) => {
      dispatch({ kind: "setRowAsset", rowKey, assetId, priceCurrency })
    },
    [],
  )

  const addBlankRow = useCallback((defaults?: BlankRowDefaults) => {
    dispatch({ kind: "addBlank", defaults })
  }, [])

  const appendRows = useCallback((rows: Partial<SheetSnapshot>[]) => {
    dispatch({ kind: "appendRows", rows })
  }, [])

  const deleteRow = useCallback((rowKey: string) => {
    dispatch({ kind: "delete", rowKey })
  }, [])

  const discardAll = useCallback(() => {
    dispatch({ kind: "discardAll" })
  }, [])

  const validateAll = useCallback(() => {
    dispatch({ kind: "validateAll" })
  }, [])

  const commitSaveSuccess = useCallback((rowKey: string, txId: string) => {
    dispatch({ kind: "commitSaveSuccess", rowKey, txId })
  }, [])

  const markSaveError = useCallback((rowKey: string, message: string) => {
    dispatch({ kind: "markSaveError", rowKey, message })
  }, [])

  const removeDeleted = useCallback((rowKey: string) => {
    dispatch({ kind: "removeDeleted", rowKey })
  }, [])

  const resolveAssetSentinel = useCallback(
    (sentinel: string, realAssetId: string, priceCurrency: string) => {
      dispatch({
        kind: "resolveAssetSentinel",
        sentinel,
        realAssetId,
        priceCurrency,
      })
    },
    [],
  )

  const counts = useMemo<RowCounts>(() => {
    const c: RowCounts = {
      clean: 0,
      dirty: 0,
      new: 0,
      deleted: state.pendingDeletes.length,
      invalid: 0,
    }
    for (const r of state.rows) c[r.status]++
    return c
  }, [state.rows, state.pendingDeletes])

  const hasChanges =
    counts.dirty > 0 || counts.new > 0 || counts.deleted > 0 || counts.invalid > 0

  return {
    rows: state.rows,
    pendingDeletes: state.pendingDeletes,
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
    removeDeleted,
    resolveAssetSentinel,
  }
}
