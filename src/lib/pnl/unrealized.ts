import BigNumber from "bignumber.js"
import type { CostLot, UnrealizedPnLResult } from "./types"
import { bn, BN_ZERO, BN_HUNDRED } from "@/lib/config"

/**
 * Compute unrealized P&L from remaining FIFO lots and current market price.
 */
export function computeUnrealizedPnL(
  lots: CostLot[],
  currentPriceUsd: number,
  balance: number,
): UnrealizedPnLResult {
  const costBasisUsd = lots.reduce(
    (sum: BigNumber, lot) => sum.plus(lot.amount.times(lot.unitPriceUsd)),
    BN_ZERO,
  )

  const currentValueUsd = bn(balance).times(bn(currentPriceUsd))

  const unrealizedPnlUsd = currentValueUsd.minus(costBasisUsd)

  const unrealizedPnlPct = costBasisUsd.isZero()
    ? BN_ZERO
    : unrealizedPnlUsd.div(costBasisUsd).times(BN_HUNDRED)

  return {
    costBasisUsd,
    currentValueUsd,
    unrealizedPnlUsd,
    unrealizedPnlPct,
  }
}
