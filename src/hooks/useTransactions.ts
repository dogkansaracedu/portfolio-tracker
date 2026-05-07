import { useState, useEffect, useCallback } from "react"
import { useAuth } from "@/hooks/useAuth"
import { useTransactionModal } from "@/contexts/TransactionContext"
import { useTransactionData } from "@/contexts/TransactionDataContext"
import {
  fetchTransactions,
  createTransaction,
  updateTransaction as updateTransactionQuery,
  deleteTransaction,
  type TransactionWithDetails,
  type TransactionFilters,
} from "@/lib/queries/transactions"
import { recalculateBalance } from "@/lib/balance"
import { supabase } from "@/lib/supabase"
import type { TransactionInsert, TransactionUpdate } from "@/types/database"

/**
 * If a transaction is denominated in a non-USD currency, ensure
 * `exchange_rates` carries the TCMB rate for that day so cost-basis
 * conversions don't fall back to a stale older row. Called fire-and-await
 * before `bumpTxVersion` so consumers re-render with the right rate already
 * cached. Failures are non-fatal — the transaction is already saved.
 */
async function ensureHistoricalRate(
  priceCurrency: string | null | undefined,
  feeCurrency: string | null | undefined,
  date: string | null | undefined,
): Promise<void> {
  const isNonUsd = (c: string | null | undefined) =>
    !!c && c.toUpperCase() !== "USD"
  if (!isNonUsd(priceCurrency) && !isNonUsd(feeCurrency)) return
  const day = (date ?? "").slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return
  try {
    await supabase.functions.invoke("fetch-historical-rate", {
      body: { date: day },
    })
  } catch (err) {
    console.warn("fetch-historical-rate failed:", err)
  }
}

export function useTransactions(filters?: TransactionFilters) {
  const { user } = useAuth()
  const { txVersion, bumpTxVersion } = useTransactionModal()
  const { refresh } = useTransactionData()
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

  // Re-fetch on filter changes AND whenever any consumer bumps txVersion.
  useEffect(() => {
    load()
  }, [load, txVersion])

  const addTransaction = async (data: Omit<TransactionInsert, "user_id">) => {
    if (!user) throw new Error("Not authenticated")

    const tx = await createTransaction({ ...data, user_id: user.id })
    await ensureHistoricalRate(tx.price_currency, tx.fee_currency, tx.date)
    await recalculateBalance(user.id, tx.asset_id, tx.platform_id)
    if (tx.related_asset_id) {
      await recalculateBalance(user.id, tx.asset_id, tx.related_asset_id)
    }
    await refresh()
    bumpTxVersion()
    return tx
  }

  const editTransaction = async (
    id: string,
    data: TransactionUpdate,
    /** original asset/platform so we can recalculate balances on either side
     * if they changed. */
    original: { assetId: string; platformId: string },
  ) => {
    if (!user) throw new Error("Not authenticated")
    const updated = await updateTransactionQuery(id, data)
    await ensureHistoricalRate(
      updated.price_currency,
      updated.fee_currency,
      updated.date,
    )
    // Recalc original (in case asset/platform changed) and current.
    await recalculateBalance(user.id, original.assetId, original.platformId)
    if (
      updated.asset_id !== original.assetId ||
      updated.platform_id !== original.platformId
    ) {
      await recalculateBalance(user.id, updated.asset_id, updated.platform_id)
    }
    await refresh()
    bumpTxVersion()
    return updated
  }

  const removeTransaction = async (
    id: string,
    assetId: string,
    platformId: string,
  ) => {
    if (!user) throw new Error("Not authenticated")
    await deleteTransaction(id)
    await recalculateBalance(user.id, assetId, platformId)
    await refresh()
    bumpTxVersion()
  }

  return {
    transactions,
    loading,
    error,
    addTransaction,
    editTransaction,
    removeTransaction,
    refetch: load,
  }
}
