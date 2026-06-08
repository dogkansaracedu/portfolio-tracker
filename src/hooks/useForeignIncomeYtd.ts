import { useMemo } from "react"
import { homeDayIso } from "@/lib/config"
import { useAssets } from "@/hooks/useAssets"
import { useTransactionData } from "@/contexts/TransactionDataContext"
import {
  computeForeignIncomeTry,
  foreignDeclarableAssetIds,
} from "@/lib/pnl/foreign-income"
import { FOREIGN_INCOME_DECLARATION_THRESHOLD_TRY } from "@/lib/constants/tax"

export interface ForeignIncomeYtd {
  /** Foreign, non-withheld dividend+interest YTD, converted to TRY. */
  ytdTry: number
  threshold: number
  /** Calendar (tax) year this covers, e.g. 2026. */
  year: number
  /** ytd / threshold × 100 (can exceed 100). */
  pct: number
  /** True once ytdTry exceeds the threshold. */
  crossed: boolean
  loading: boolean
}

/**
 * Year-to-date foreign-declarable income vs the Turkish 22k threshold. Wires the
 * Plan-1 pure helpers to live data; the calendar year comes from the portfolio's
 * home timezone (homeDayIso) so it flips at the right local midnight.
 */
export function useForeignIncomeYtd(): ForeignIncomeYtd {
  const { assets, loading: assetsLoading } = useAssets()
  const { transactions, rates, loading: txLoading } = useTransactionData()
  const threshold = FOREIGN_INCOME_DECLARATION_THRESHOLD_TRY
  const year = Number(homeDayIso().slice(0, 4))

  return useMemo(() => {
    const declarable = foreignDeclarableAssetIds(assets)
    const ytdTry = computeForeignIncomeTry(
      transactions,
      rates,
      year,
      declarable,
    ).toNumber()
    return {
      ytdTry,
      threshold,
      year,
      pct: threshold > 0 ? (ytdTry / threshold) * 100 : 0,
      crossed: ytdTry > threshold,
      loading: assetsLoading || txLoading,
    }
  }, [assets, transactions, rates, year, threshold, assetsLoading, txLoading])
}
