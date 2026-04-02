import { useState, useEffect, useCallback } from "react"
import { useAuth } from "@/hooks/useAuth"
import {
  fetchTransactions,
  createTransaction,
  deleteTransaction,
  type TransactionWithDetails,
  type TransactionFilters,
} from "@/lib/queries/transactions"
import { recalculateBalance } from "@/lib/balance"
import type { TransactionInsert } from "@/types/database"

export function useTransactions(filters?: TransactionFilters) {
  const { user } = useAuth()
  const [transactions, setTransactions] = useState<TransactionWithDetails[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    setError(null)
    try {
      const data = await fetchTransactions(user.id, filters)
      setTransactions(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load transactions")
    } finally {
      setLoading(false)
    }
  }, [user, filters?.assetId, filters?.type, filters?.dateFrom, filters?.dateTo])

  useEffect(() => {
    load()
  }, [load])

  const addTransaction = async (data: Omit<TransactionInsert, "user_id">) => {
    if (!user) throw new Error("Not authenticated")

    const tx = await createTransaction({ ...data, user_id: user.id })

    // Recalculate balance for affected asset(s)
    await recalculateBalance(tx.asset_id)

    // If it's a transfer, also recalculate the related asset
    if (tx.related_asset_id) {
      await recalculateBalance(tx.related_asset_id)
    }

    await load()
    return tx
  }

  const removeTransaction = async (id: string, assetId: string) => {
    await deleteTransaction(id)
    await recalculateBalance(assetId)
    await load()
  }

  return {
    transactions,
    loading,
    error,
    addTransaction,
    removeTransaction,
    refetch: load,
  }
}
