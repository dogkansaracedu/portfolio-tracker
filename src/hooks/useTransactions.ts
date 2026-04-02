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
  }, [user, filters?.assetId, filters?.platformId, filters?.type, filters?.dateFrom, filters?.dateTo])

  useEffect(() => {
    load()
  }, [load])

  const addTransaction = async (data: Omit<TransactionInsert, "user_id">) => {
    if (!user) throw new Error("Not authenticated")

    const tx = await createTransaction({ ...data, user_id: user.id })

    // Recalculate balance for the affected (asset, platform) holding
    await recalculateBalance(user.id, tx.asset_id, tx.platform_id)

    // If it's a transfer, also recalculate the destination/source platform holding.
    // related_asset_id is re-used to reference the counterpart asset row for transfers.
    // For transfer_out the counterpart transfer_in has the same asset_id but different platform.
    // The related_asset_id field may store the counterpart platform_id for transfers.
    if (tx.related_asset_id) {
      await recalculateBalance(user.id, tx.asset_id, tx.related_asset_id)
    }

    await load()
    return tx
  }

  const removeTransaction = async (
    id: string,
    assetId: string,
    platformId: string,
  ) => {
    if (!user) throw new Error("Not authenticated")
    await deleteTransaction(id)
    await recalculateBalance(user.id, assetId, platformId)
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
