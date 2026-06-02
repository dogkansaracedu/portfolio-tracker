import { useEffect, useMemo, useRef } from "react"
import { useSearchParams } from "react-router"
import { useTransactions } from "@/hooks/useTransactions"
import { useTransactionData } from "@/contexts/TransactionDataContext"
import { normalizeToUsd } from "@/lib/pnl/currency"
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

/** ISO date (YYYY-MM-DD) for Jan 1 of the current year — the start of the "This Year" range. */
export function thisYearStartISO(): string {
  return `${new Date().getFullYear()}-01-01`
}

/** Filters applied on a fresh visit: the current year, rather than the full history. */
function defaultFilters(): TransactionLogFilters {
  return { dateFrom: thisYearStartISO() }
}

function filtersFromParams(params: URLSearchParams): TransactionLogFilters {
  const types = params.getAll("types") as TransactionType[]
  return {
    dateFrom: params.get("dateFrom") ?? undefined,
    dateTo: params.get("dateTo") ?? undefined,
    assetId: params.get("assetId") ?? undefined,
    platformId: params.get("platformId") ?? undefined,
    types: types.length > 0 ? types : undefined,
  }
}

function filtersToParams(filters: TransactionLogFilters): URLSearchParams {
  const params = new URLSearchParams()
  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom)
  if (filters.dateTo) params.set("dateTo", filters.dateTo)
  if (filters.assetId) params.set("assetId", filters.assetId)
  if (filters.platformId) params.set("platformId", filters.platformId)
  filters.types?.forEach((t) => params.append("types", t))
  return params
}

export function useTransactionLog() {
  const [searchParams, setSearchParams] = useSearchParams()
  const filters = useMemo(() => filtersFromParams(searchParams), [searchParams])
  const setFilters = (next: TransactionLogFilters) =>
    setSearchParams(filtersToParams(next), { replace: true })
  const { rates } = useTransactionData()

  // On the first visit with no filters in the URL, default to the current year
  // so we don't load the entire history. The ref guard ensures this fires once
  // per mount, so explicitly choosing "All Time" (which also clears the params)
  // doesn't bounce straight back to this year.
  const initialized = useRef(false)
  useEffect(() => {
    if (initialized.current) return
    initialized.current = true
    if (searchParams.toString() === "") {
      setSearchParams(filtersToParams(defaultFilters()), { replace: true })
    }
  }, [searchParams, setSearchParams])

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
