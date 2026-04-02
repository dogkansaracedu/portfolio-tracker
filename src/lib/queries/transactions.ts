import { supabase } from "@/lib/supabase"
import type {
  Transaction,
  TransactionInsert,
  TransactionUpdate,
} from "@/types/database"

export interface TransactionWithDetails extends Transaction {
  assets: { name: string; ticker: string; category: string }
  platforms: { name: string; color: string }
}

export interface TransactionFilters {
  assetId?: string
  platformId?: string
  type?: string
  dateFrom?: string
  dateTo?: string
}

export async function fetchTransactions(
  userId: string,
  filters?: TransactionFilters,
): Promise<TransactionWithDetails[]> {
  let query = supabase
    .from("transactions")
    .select("*, assets(name, ticker, category), platforms(name, color)")
    .eq("user_id", userId)
    .order("date", { ascending: false })
    .order("created_at", { ascending: false })

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
