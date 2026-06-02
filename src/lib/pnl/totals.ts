import { bn, BN_ZERO, BN_HUNDRED } from "@/lib/config"

export interface PnLTotalsInput {
  totalUnrealizedPnlUsd: ReturnType<typeof bn>
  totalRealizedPnlUsd: ReturnType<typeof bn>
  totalInvestedUsd: ReturnType<typeof bn>
}

export interface PnLTotals {
  totalPnlUsd: ReturnType<typeof bn>
  totalPnlPct: ReturnType<typeof bn>
}

/**
 * Total P&L = unrealized + realized, % over |net invested|. Shared by the
 * Portfolio summary and Dashboard hero so both render the identical headline.
 */
export function summarizePnLTotals(input: PnLTotalsInput): PnLTotals {
  const totalPnlUsd = input.totalUnrealizedPnlUsd.plus(input.totalRealizedPnlUsd)
  const investedAbs = input.totalInvestedUsd.abs()
  const totalPnlPct = investedAbs.isZero()
    ? BN_ZERO
    : totalPnlUsd.div(investedAbs).times(BN_HUNDRED)
  return { totalPnlUsd, totalPnlPct }
}
