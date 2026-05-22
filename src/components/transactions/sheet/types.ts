import type { TransactionType } from "@/types/database"
import type { TransactionWithDetails } from "@/lib/queries/transactions"

export type RowStatus =
  | "clean"
  | "dirty"
  | "new"
  | "deleted"
  | "invalid"

export type SheetField =
  | "date"
  | "assetId"
  | "platformId"
  | "type"
  | "amount"
  | "unitPrice"
  | "priceCurrency"
  | "fee"
  | "notes"

export interface SheetRow {
  rowKey: string
  txId: string | null
  date: string
  assetId: string
  platformId: string
  type: TransactionType
  amount: string
  unitPrice: string
  priceCurrency: string
  fee: string
  notes: string
  status: RowStatus
  /** Snapshot of fields at load time. Null for `new` rows. Used to compute
   *  dirty-vs-clean transitions and to power Discard. */
  original: SheetSnapshot | null
  errors: Partial<Record<SheetField, string>>
}

export type SheetSnapshot = Pick<
  SheetRow,
  | "date"
  | "assetId"
  | "platformId"
  | "type"
  | "amount"
  | "unitPrice"
  | "priceCurrency"
  | "fee"
  | "notes"
>

export type RowCounts = Record<RowStatus, number>

export interface SheetState {
  rows: SheetRow[]
  /** Rows the user deleted whose txId we still need at save time. They are
   *  not rendered in the grid; the reducer keeps them here so Save can issue
   *  a DELETE for each. */
  pendingDeletes: { rowKey: string; txId: string }[]
}

export function snapshotFromTx(tx: TransactionWithDetails): SheetSnapshot {
  return {
    date: tx.date.slice(0, 10),
    assetId: tx.asset_id,
    platformId: tx.platform_id,
    type: tx.type,
    amount: String(tx.amount),
    unitPrice: String(tx.unit_price),
    priceCurrency: tx.price_currency || "USD",
    fee: tx.fee ? String(tx.fee) : "",
    notes: tx.notes ?? "",
  }
}
