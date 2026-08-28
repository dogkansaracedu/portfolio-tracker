import type { bn } from "@/lib/config"

export interface PnLTotalsInput {
  totalCurrentValueUsd: ReturnType<typeof bn>
  totalInvestedUsd: ReturnType<typeof bn>
}

export interface PnLTotals {
  totalPnlUsd: ReturnType<typeof bn>
}

/**
 * Total P&L = current value − net invested capital (money-weighted). This is the
 * canonical, USD-anchored definition: every dollar of value today vs every
 * dollar actually deployed, so it captures FX gains and losses on fiat cash
 * (EUR/TRY vs USD) — not just tradeable-asset gains. Equivalent to
 * unrealized + realized once fiat carries its FX P&L (see the fiat branch in
 * usePnL). Shared by the Portfolio summary and Dashboard hero so both render the
 * identical headline dollars.
 *
 * Dollars only: the % companion everywhere is the lifetime cumulative
 * money-weighted return (`computeLifetimeMwrCumulativePct`, `lib/mwr.ts`). The
 * old peak-net-invested % was removed 2026-08-28 along with all peak-invested
 * calculations.
 */
export function summarizePnLTotals(input: PnLTotalsInput): PnLTotals {
  return {
    totalPnlUsd: input.totalCurrentValueUsd.minus(input.totalInvestedUsd),
  }
}
