import { useState, useMemo } from "react"
import { useTransactions } from "@/hooks/useTransactions"
import { useAssets } from "@/hooks/useAssets"
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
  const { assets } = useAssets()

  // Pass date and asset filters to the server query
  const serverFilters = useMemo(
    () => ({
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
      assetId: filters.assetId,
    }),
    [filters.dateFrom, filters.dateTo, filters.assetId]
  )

  const { transactions: rawTransactions, loading, error, refetch } =
    useTransactions(serverFilters)

  // Build a set of asset IDs belonging to the selected platform
  const platformAssetIds = useMemo(() => {
    if (!filters.platformId) return null
    const ids = new Set<string>()
    for (const asset of assets) {
      if (asset.platform_id === filters.platformId) {
        ids.add(asset.id)
      }
    }
    return ids
  }, [filters.platformId, assets])

  // Client-side filtering for platformId and types
  const transactions = useMemo(() => {
    let result: TransactionWithDetails[] = rawTransactions

    if (platformAssetIds) {
      result = result.filter((tx) => platformAssetIds.has(tx.asset_id))
    }

    if (filters.types && filters.types.length > 0) {
      result = result.filter((tx) => filters.types!.includes(tx.type))
    }

    return result
  }, [rawTransactions, filters.types, platformAssetIds])

  const summary = useMemo<TransactionLogSummary>(() => {
    let totalBuyVolume = 0
    let totalSellVolume = 0

    for (const tx of transactions) {
      if (tx.type === "buy") {
        totalBuyVolume += tx.total_cost
      } else if (tx.type === "sell") {
        totalSellVolume += tx.total_cost
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
