import { useState, useMemo } from "react"
import { useTransactions } from "@/hooks/useTransactions"
import type { TransactionType } from "@/types/database"
import type { TransactionWithDetails } from "@/lib/queries/transactions"

export interface TransactionLogFilters {
  dateFrom?: string
  dateTo?: string
  assetId?: string
  platformId?: string
  types?: TransactionType[]
}

export interface TransactionLogSummary {
  count: number
  totalBuyVolume: number
  totalSellVolume: number
}

export function useTransactionLog() {
  const [filters, setFilters] = useState<TransactionLogFilters>({})

  // Pass date, asset, and platform filters to the server query
  const serverFilters = useMemo(
    () => ({
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
      assetId: filters.assetId,
      platformId: filters.platformId,
    }),
    [filters.dateFrom, filters.dateTo, filters.assetId, filters.platformId],
  )

  const { transactions: rawTransactions, loading, error, refetch } =
    useTransactions(serverFilters)

  // Client-side filtering for transaction types only
  const transactions = useMemo(() => {
    let result: TransactionWithDetails[] = rawTransactions

    if (filters.types && filters.types.length > 0) {
      result = result.filter((tx) => filters.types!.includes(tx.type))
    }

    return result
  }, [rawTransactions, filters.types])

  const summary = useMemo<TransactionLogSummary>(() => {
    let totalBuyVolume = 0
    let totalSellVolume = 0

    for (const tx of transactions) {
      const cost = tx.price_currency === "USD" ? tx.total_cost : 0
      if (tx.type === "buy") {
        totalBuyVolume += cost
      } else if (tx.type === "sell") {
        totalSellVolume += cost
      }
    }

    return {
      count: transactions.length,
      totalBuyVolume,
      totalSellVolume,
    }
  }, [transactions])

  return {
    transactions,
    loading,
    error,
    filters,
    setFilters,
    summary,
    refetch,
  }
}
