import { useState, useEffect, useMemo } from "react"
import { BN_ZERO } from "@/lib/config"
import { fetchTransactionsForPnL, fetchAllExchangeRates } from "@/lib/queries/pnl"
import { computeFIFOLots } from "@/lib/pnl/fifo"
import type { Transaction, ExchangeRate } from "@/types/database"
import type { CostLot } from "@/lib/pnl/types"

/**
 * Get the current FIFO cost lots for a specific asset.
 * Returns the open lots, total cost, and average cost per unit.
 */
export function useCostBasis(assetId: string | undefined) {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [rates, setRates] = useState<ExchangeRate[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!assetId) {
      setLoading(false)
      return
    }

    const load = async () => {
      setLoading(true)
      try {
        const [txs, exchangeRates] = await Promise.all([
          fetchTransactionsForPnL(assetId),
          fetchAllExchangeRates(),
        ])
        setTransactions(txs)
        setRates(exchangeRates)
      } catch (err) {
        console.error("Failed to load cost basis:", err)
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [assetId])

  const result = useMemo(() => {
    if (!assetId || loading) {
      return { lots: [] as CostLot[], totalCostUsd: 0, avgCostUsd: 0 }
    }

    const { lots } = computeFIFOLots(transactions, rates)

    const totalCostUsd = lots.reduce(
      (sum, lot) => sum.plus(lot.amount.times(lot.unitPriceUsd)),
      BN_ZERO,
    )

    const totalAmount = lots.reduce(
      (sum, lot) => sum.plus(lot.amount),
      BN_ZERO,
    )

    const avgCostUsd = totalAmount.isZero()
      ? 0
      : totalCostUsd.div(totalAmount).toNumber()

    return { lots, totalCostUsd: totalCostUsd.toNumber(), avgCostUsd }
  }, [assetId, transactions, rates, loading])

  return { ...result, loading }
}
