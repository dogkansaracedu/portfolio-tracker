import { useState, useMemo, useEffect } from "react"
import { useTransactions } from "@/hooks/useTransactions"
import { useAuth } from "@/hooks/useAuth"
import { fetchAllExchangeRates } from "@/lib/queries/pnl"
import { normalizeToUsd } from "@/lib/pnl/currency"
import type { TransactionType, ExchangeRate } from "@/types/database"
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
  const { user } = useAuth()
  const [filters, setFilters] = useState<TransactionLogFilters>({})
  const [rates, setRates] = useState<ExchangeRate[]>([])

  useEffect(() => {
    if (!user) return
    fetchAllExchangeRates().then(setRates).catch(console.error)
  }, [user])

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
      const costUsd = normalizeToUsd(
        tx.total_cost,
        tx.price_currency,
        tx.date,
        rates,
      ).toNumber()
      if (tx.type === "buy") {
        totalBuyVolume += costUsd
      } else if (tx.type === "sell") {
        totalSellVolume += costUsd
      }
    }

    return {
      count: transactions.length,
      totalBuyVolume,
      totalSellVolume,
    }
  }, [transactions, rates])

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
