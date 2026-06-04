import { useMemo } from "react"
import { bn } from "@/lib/config"
import { useHoldings } from "@/hooks/useHoldings"
import { usePrices } from "@/hooks/usePrices"
import { usePnL } from "@/hooks/usePnL"
import { summarizePnLTotals } from "@/lib/pnl/totals"

export interface PnLSummary {
  totalValueUsd: number
  totalValueTry: number
  totalUnrealizedPnlUsd: number
  totalRealizedPnlUsd: number
  totalIncomeUsd: number
  totalPnlUsd: number
  totalPnlTry: number
  totalPnlPct: number
  loading: boolean
}

/**
 * Shared current-day P&L surface for the Portfolio summary and Dashboard hero.
 * Built on usePnL: unrealized (current holdings) + realized (full history).
 * The Dashboard chart stays snapshot-derived; only the "now" figure uses this.
 */
export function usePnLSummary(): PnLSummary {
  const { holdings, loading: holdingsLoading } = useHoldings()
  const { prices, rates, loading: pricesLoading } = usePrices()
  const {
    totalCurrentValueUsd,
    totalUnrealizedPnlUsd,
    totalRealizedPnlUsd,
    totalIncomeUsd,
    totalInvestedUsd,
    loading: pnlLoading,
  } = usePnL(holdings, prices)

  const usdTry = rates?.usd_try ?? 0

  return useMemo(() => {
    const { totalPnlUsd, totalPnlPct } = summarizePnLTotals({
      totalCurrentValueUsd,
      totalInvestedUsd,
    })
    const rate = bn(usdTry)
    return {
      totalValueUsd: totalCurrentValueUsd.toNumber(),
      totalValueTry: totalCurrentValueUsd.times(rate).toNumber(),
      totalUnrealizedPnlUsd: totalUnrealizedPnlUsd.toNumber(),
      totalRealizedPnlUsd: totalRealizedPnlUsd.toNumber(),
      totalIncomeUsd: totalIncomeUsd.toNumber(),
      totalPnlUsd: totalPnlUsd.toNumber(),
      totalPnlTry: totalPnlUsd.times(rate).toNumber(),
      totalPnlPct: totalPnlPct.toNumber(),
      loading: holdingsLoading || pricesLoading || pnlLoading,
    }
  }, [
    totalCurrentValueUsd,
    totalUnrealizedPnlUsd,
    totalRealizedPnlUsd,
    totalIncomeUsd,
    totalInvestedUsd,
    usdTry,
    holdingsLoading,
    pricesLoading,
    pnlLoading,
  ])
}
