import { useEffect, useMemo } from "react"
import { useTransactionData } from "@/contexts/TransactionDataContext"
import { useSnapshots } from "@/hooks/useSnapshots"
import { computePortfolioPnL, EMPTY_PNL } from "@/lib/pnl/portfolio"
import type { PriceCache } from "@/types/database"
import type { HoldingWithDetails } from "@/lib/queries/holdings"

/**
 * Compute P&L from holdings (which carry asset + platform details) and current
 * prices. A thin wrapper over the pure engine `computePortfolioPnL` — the hook
 * only supplies transactions/rates/snapshots from context and memoizes; all
 * P&L logic lives in the engine so the Dashboard and Portfolio share one
 * definition and can't diverge.
 */
export function usePnL(
  holdings: HoldingWithDetails[],
  prices: Record<string, PriceCache>,
) {
  const { transactions, rates, loading } = useTransactionData()
  const { snapshots } = useSnapshots()

  const result = useMemo(() => {
    if (loading) return EMPTY_PNL
    return computePortfolioPnL({
      holdings,
      prices,
      transactions,
      rates,
      snapshots,
    })
  }, [transactions, rates, holdings, prices, loading, snapshots])

  // Dev-time invariant: the canonical money-weighted total must equal the
  // decomposition. Fires loudly (not DEV-gated — we test on prod) if a future
  // transaction type breaks the identity. $0.01 tolerance covers float display.
  useEffect(() => {
    if (loading) return
    const moneyWeighted = result.totalCurrentValueUsd.minus(
      result.totalInvestedUsd,
    )
    const decomposed = result.totalUnrealizedPnlUsd
      .plus(result.totalRealizedPnlUsd)
      .plus(result.totalIncomeUsd)
    if (moneyWeighted.minus(decomposed).abs().gt(0.01)) {
      console.warn(
        "[usePnL] P&L reconciliation mismatch:",
        `value−invested=${moneyWeighted.toFixed(2)}`,
        `unrealized+realized+income=${decomposed.toFixed(2)}`,
      )
    }
  }, [result, loading])

  return { ...result, transactions, rates, loading }
}
