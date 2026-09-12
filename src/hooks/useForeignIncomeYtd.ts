import { useCallback, useMemo } from "react"
import { BN_ZERO, homeDayIso } from "@/lib/config"
import { useAssets } from "@/hooks/useAssets"
import { useTransactionData } from "@/contexts/TransactionDataContext"
import {
  foreignIncomeEntries,
  foreignIncomeFingerprint,
  foreignIncomePayerAssetId,
  foreignDeclarableAssetIds,
  type ForeignIncomeEntry,
} from "@/lib/pnl/foreign-income"
import { foreignIncomeDeclarationThresholdTry } from "@/lib/constants/tax"

export interface ForeignIncomeYear {
  /** Foreign, non-withheld dividend+interest, converted to TRY. */
  ytdTry: number
  threshold: number | null
  year: number
  pct: number | null
  crossed: boolean
  entries: ForeignIncomeEntry[]
  fingerprint: string
  availableYears: number[]
  loading: boolean
  error: string | null
  retry: () => Promise<void>
}

export function useForeignIncomeForYear(year: number): ForeignIncomeYear {
  const {
    assets,
    loading: assetsLoading,
    error: assetsError,
    refetch: refetchAssets,
  } = useAssets()
  const {
    transactions,
    rates,
    loading: txLoading,
    error: txError,
    refresh: refreshTransactions,
  } = useTransactionData()
  const threshold = foreignIncomeDeclarationThresholdTry(year)
  const currentYear = Number(homeDayIso().slice(0, 4))

  const retry = useCallback(async () => {
    await Promise.all([refetchAssets(), refreshTransactions()])
  }, [refetchAssets, refreshTransactions])

  return useMemo(() => {
    const declarable = foreignDeclarableAssetIds(assets)
    const entries = foreignIncomeEntries(transactions, rates, year, declarable)
    const ytdTry = entries
      .reduce((sum, entry) => sum.plus(entry.amountTry), BN_ZERO)
      .toNumber()
    const availableYears = [
      ...new Set([
        currentYear,
        currentYear - 1,
        ...transactions
          .filter(
            (transaction) =>
              (transaction.type === "dividend" ||
                transaction.type === "interest") &&
              declarable.has(foreignIncomePayerAssetId(transaction)),
          )
          .map((transaction) => Number(transaction.date.slice(0, 4)))
          .filter(Number.isFinite),
      ]),
    ].sort((a, b) => b - a)

    const needsRates = entries.some(
      ({ transaction }) => transaction.price_currency.toUpperCase() !== "TRY",
    )
    const missingRates = needsRates && rates.length === 0
    const error =
      assetsError ??
      txError ??
      (missingRates
        ? "Exchange rates are unavailable, so the TRY total cannot be verified."
        : null)

    return {
      ytdTry,
      threshold,
      year,
      pct: threshold && threshold > 0 ? (ytdTry / threshold) * 100 : null,
      crossed: threshold !== null && ytdTry > threshold,
      entries,
      fingerprint: foreignIncomeFingerprint(entries),
      availableYears,
      loading: assetsLoading || txLoading,
      error,
      retry,
    }
  }, [
    assets,
    transactions,
    rates,
    year,
    threshold,
    currentYear,
    assetsLoading,
    txLoading,
    assetsError,
    txError,
    retry,
  ])
}

/** Dashboard convenience wrapper for the current tax year. */
export function useForeignIncomeYtd(): ForeignIncomeYear {
  const year = Number(homeDayIso().slice(0, 4))
  return useForeignIncomeForYear(year)
}
