import type { CostLot, UnrealizedPnLResult } from "./types"

/**
 * Compute unrealized P&L from remaining FIFO lots and current market price.
 */
export function computeUnrealizedPnL(
  lots: CostLot[],
  currentPriceUsd: number,
  balance: number,
): UnrealizedPnLResult {
  const costBasisUsd = lots.reduce(
    (sum, lot) => sum + lot.amount * lot.unitPriceUsd,
    0,
  )

  const currentValueUsd = balance * currentPriceUsd

  const unrealizedPnlUsd = currentValueUsd - costBasisUsd

  const unrealizedPnlPct =
    costBasisUsd > 0 ? (unrealizedPnlUsd / costBasisUsd) * 100 : 0

  return {
    costBasisUsd,
    currentValueUsd,
    unrealizedPnlUsd,
    unrealizedPnlPct,
  }
}
