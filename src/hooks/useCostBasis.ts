import { useMemo } from "react"
import { BN_ZERO } from "@/lib/config"
import { useTransactionData } from "@/contexts/TransactionDataContext"
import { computeFIFOLots } from "@/lib/pnl/fifo"
import type { CostLot } from "@/lib/pnl/types"

/**
 * Get the current FIFO cost lots for a specific (asset, platform) pair.
 * Returns the open lots, total cost, and average cost per unit.
 */
export function useCostBasis(
  assetId: string | undefined,
  platformId: string | undefined,
) {
  const { transactions, rates, loading } = useTransactionData()

  const txForPair = useMemo(
    () =>
      transactions
        .filter((t) => t.asset_id === assetId && t.platform_id === platformId)
        .sort(
          (a, b) =>
            a.date.localeCompare(b.date) ||
            a.created_at.localeCompare(b.created_at)
        ),
    [transactions, assetId, platformId]
  )

  const result = useMemo(() => {
    if (!assetId || !platformId || loading) {
      return { lots: [] as CostLot[], totalCostUsd: 0, avgCostUsd: 0 }
    }

    const { lots } = computeFIFOLots(txForPair, rates)

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
  }, [assetId, platformId, txForPair, rates, loading])

  return { ...result, loading }
}
