import { bn, BN_ZERO, BN_HUNDRED } from "@/lib/config"

export interface PnLTotalsInput {
  totalCurrentValueUsd: ReturnType<typeof bn>
  totalInvestedUsd: ReturnType<typeof bn>
}

export interface PnLTotals {
  totalPnlUsd: ReturnType<typeof bn>
  totalPnlPct: ReturnType<typeof bn>
}

/**
 * Total P&L = current value − net invested capital (money-weighted), % over
 * |net invested|. This is the canonical, USD-anchored definition: every dollar
 * of value today vs every dollar actually deployed, so it captures FX gains and
 * losses on fiat cash (EUR/TRY vs USD) — not just tradeable-asset gains.
 * Equivalent to unrealized + realized once fiat carries its FX P&L (see the
 * fiat branch in usePnL). Shared by the Portfolio summary and Dashboard hero so
 * both render the identical headline, AND so the hero's live "now" point equals
 * `total_usd − net_invested` at every snapshot — making the P&L chart's period
 * delta the true value change, not an artifact of mixing two P&L methods.
 */
export function summarizePnLTotals(input: PnLTotalsInput): PnLTotals {
  const totalPnlUsd = input.totalCurrentValueUsd.minus(input.totalInvestedUsd)
  const investedAbs = input.totalInvestedUsd.abs()
  const totalPnlPct = investedAbs.isZero()
    ? BN_ZERO
    : totalPnlUsd.div(investedAbs).times(BN_HUNDRED)
  return { totalPnlUsd, totalPnlPct }
}
