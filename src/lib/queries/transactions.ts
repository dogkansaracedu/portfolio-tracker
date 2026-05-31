import { supabase } from "@/lib/supabase"
import type {
  Transaction,
  TransactionInsert,
  TransactionUpdate,
} from "@/types/database"

export interface TransactionWithDetails extends Transaction {
  assets: { name: string; ticker: string; category: string; icon_url: string | null }
  platforms: { name: string; color: string }
}

export interface TransactionFilters {
  assetId?: string
  platformId?: string
  type?: string
  dateFrom?: string
  dateTo?: string
  /** When true, include rows whose `linked_tx_id IS NOT NULL` (cash side
   *  rows). Defaults to false — main transaction list shows parents only.
   *  Asset-filtered views typically pass true so cash flow appears. */
  includeLinkedChildren?: boolean
}

export async function fetchTransactions(
  userId: string,
  filters?: TransactionFilters,
): Promise<TransactionWithDetails[]> {
  let query = supabase
    .from("transactions")
    .select("*, assets!transactions_asset_id_fkey(name, ticker, category, icon_url), platforms(name, color)")
    .eq("user_id", userId)
    .order("date", { ascending: false })
    .order("created_at", { ascending: false })

  // Default: hide cash rows from the main list. When the caller is
  // viewing a specific asset (typically by passing assetId), they
  // probably want to see all rows touching that asset including the
  // auto-paired cash rows. The caller can also force include by
  // setting includeLinkedChildren explicitly.
  const showLinkedChildren =
    filters?.includeLinkedChildren ?? Boolean(filters?.assetId)

  if (!showLinkedChildren) {
    query = query.is("linked_tx_id", null)
  }

  if (filters?.assetId) {
    query = query.eq("asset_id", filters.assetId)
  }
  if (filters?.platformId) {
    query = query.eq("platform_id", filters.platformId)
  }
  if (filters?.type) {
    query = query.eq("type", filters.type)
  }
  if (filters?.dateFrom) {
    query = query.gte("date", filters.dateFrom)
  }
  if (filters?.dateTo) {
    query = query.lte("date", filters.dateTo)
  }

  const { data, error } = await query

  if (error) throw error

  return (data ?? []) as unknown as TransactionWithDetails[]
}

export async function fetchTransactionsByAsset(
  assetId: string,
): Promise<Transaction[]> {
  const { data, error } = await supabase
    .from("transactions")
    .select("*")
    .eq("asset_id", assetId)
    .order("date", { ascending: true })

  if (error) throw error
  return data ?? []
}

/**
 * Batch-fetch the linked child rows for a list of parent ids. Used by
 * the main transactions list to render the cash subtitle line under
 * each parent.
 */
export async function fetchLinkedChildrenForParents(
  parentIds: string[],
): Promise<Map<string, TransactionWithDetails>> {
  if (parentIds.length === 0) return new Map()
  const { data, error } = await supabase
    .from("transactions")
    .select("*, assets!transactions_asset_id_fkey(name, ticker, category, icon_url), platforms(name, color)")
    .in("linked_tx_id", parentIds)
  if (error) throw error
  const out = new Map<string, TransactionWithDetails>()
  for (const row of (data ?? []) as unknown as TransactionWithDetails[]) {
    if (row.linked_tx_id) out.set(row.linked_tx_id, row)
  }
  return out
}

/**
 * Fetch a single linked child for a parent. Used by the edit flow to
 * reconcile parent edits with the existing child.
 */
export async function fetchLinkedChild(
  parentId: string,
): Promise<Transaction | null> {
  const { data, error } = await supabase
    .from("transactions")
    .select("*")
    .eq("linked_tx_id", parentId)
    .maybeSingle()
  if (error) throw error
  return (data as Transaction | null) ?? null
}

export async function createTransaction(
  data: TransactionInsert,
): Promise<Transaction> {
  const { data: created, error } = await supabase
    .from("transactions")
    .insert(data)
    .select()
    .single()

  if (error) throw error
  return created
}

export async function updateTransaction(
  id: string,
  data: TransactionUpdate,
): Promise<Transaction> {
  const { data: updated, error } = await supabase
    .from("transactions")
    .update(data)
    .eq("id", id)
    .select()
    .single()

  if (error) throw error
  return updated
}

export async function deleteTransaction(id: string): Promise<void> {
  const { error } = await supabase.from("transactions").delete().eq("id", id)
  if (error) throw error
}

/** Payload row for the bulk_insert_transactions RPC. Mirrors the JSONB
 *  shape the function expects — keep this lockstep with the SQL function
 *  in 20260524000000_bulk_insert_transactions.sql. */
export interface BulkInsertRow {
  asset_id: string
  platform_id: string
  type: string
  date: string
  amount: number | string
  unit_price: number | string
  price_currency: string
  total_cost: number | string
  fee: number | string
  fee_currency: string | null
  related_asset_id: string | null
  notes: string | null
  /** Optional cash-funding platform for buys. When set, the function also
   *  inserts the linked cash_debit child on that platform. */
  funding_platform_id?: string | null
}

export interface BulkInsertResult {
  row_index: number
  tx_id: string
}

/**
 * Insert N transactions in a single round-trip. The RPC handles:
 *  - Parent inserts (one per row)
 *  - Auto-paired cash children for sells (always) and funded buys
 *  - Holdings balance recompute for every (asset, platform) touched
 * All atomic. On any error, the entire batch rolls back.
 */
export async function bulkInsertTransactions(
  rows: BulkInsertRow[],
): Promise<BulkInsertResult[]> {
  if (rows.length === 0) return []
  const { data, error } = await supabase.rpc("bulk_insert_transactions", {
    p_rows: rows,
  })
  if (error) throw error
  return (data ?? []) as BulkInsertResult[]
}
