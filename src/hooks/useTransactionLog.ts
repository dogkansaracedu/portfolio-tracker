import { useEffect, useMemo, useRef } from "react"
import { useSearchParams } from "react-router"
import { useTransactions } from "@/hooks/useTransactions"
import { useTransactionData } from "@/contexts/TransactionDataContext"
import { normalizeToUsd } from "@/lib/pnl/currency"
import {
  collapseLinkedTransferIns,
  matchesAnyFilterType,
  transferPairParentIds,
} from "@/components/transactions/transactionRowModel"
import type { TransactionFilterType } from "@/lib/constants/transaction-types"
import type { TransactionWithDetails } from "@/lib/queries/transactions"

export interface TransactionLogFilters {
  dateFrom?: string
  dateTo?: string
  assetId?: string
  platformId?: string
  types?: TransactionFilterType[]
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
  const types = params.getAll("types") as TransactionFilterType[]
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

  // On the first visit with no filters in the URL, default to the current year
  // so we don't load the entire history. The ref guard ensures this applies
  // once per mount, so explicitly choosing "All Time" (which also clears the
  // params) doesn't bounce straight back to this year.
  const initialized = useRef(false)

  // Apply the default window *synchronously* on the first render with an empty
  // URL, so the first (and only) server fetch already carries `dateFrom`.
  // Seeding it via the effect below alone would fire an unfiltered full-history
  // fetch first, then refetch once the param lands — two requests for one view.
  const filters = useMemo(() => {
    const fromParams = filtersFromParams(searchParams)
    if (!initialized.current && searchParams.toString() === "") {
      return { ...fromParams, ...defaultFilters() }
    }
    return fromParams
  }, [searchParams])
  const setFilters = (next: TransactionLogFilters) =>
    setSearchParams(filtersToParams(next), { replace: true })
  const { rates, transactions: allTransactions } = useTransactionData()

  // Mirror the synchronous default into the URL so filters stay shareable and
  // survive reload. By the time this runs, `filters` already carries the
  // default, so the param write produces the same `serverFilters` and triggers
  // no extra fetch.
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

  // Which transfer_outs own a transfer_in child, derived from the *global*
  // history rather than the fetched slice — a date or platform filter can drop
  // the other side of a pair, and "is this an internal transfer?" must not
  // change with the filter set. No extra request: the SoT is already loaded.
  const pairParentIds = useMemo(
    () => transferPairParentIds(allTransactions),
    [allTransactions],
  )

  // Client-side filtering on the *derived* transaction type (Transfer matches a
  // linked pair; Deposit/Withdrawal only the lone ones), then transfer-pair
  // collapse: a linked transfer_in whose transfer_out parent is visible in the
  // same filtered list is folded into the parent's combined "A → B" row. When
  // the parent is filtered out (e.g. the platform filter matches only the
  // destination side), the transfer_in stays as its own row.
  const transactions = useMemo(() => {
    let result: TransactionWithDetails[] = rawTransactions

    if (filters.types && filters.types.length > 0) {
      result = result.filter((tx) =>
        matchesAnyFilterType(tx, filters.types!, pairParentIds),
      )
    }

    return collapseLinkedTransferIns(result)
  }, [rawTransactions, filters.types, pairParentIds])

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
