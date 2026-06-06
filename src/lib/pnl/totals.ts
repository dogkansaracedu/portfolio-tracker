import { bn, BN_HUNDRED } from "@/lib/config"

export interface PnLTotalsInput {
  totalCurrentValueUsd: ReturnType<typeof bn>
  totalInvestedUsd: ReturnType<typeof bn>
  /**
   * Peak net invested (running max of the net-invested ledger,
   * `computePeakInvestedUsd`). The % denominator — see why below.
   */
  peakInvestedUsd: ReturnType<typeof bn>
}

export interface PnLTotals {
  totalPnlUsd: ReturnType<typeof bn>
  /** null = no base to take a % on (nothing ever deployed) → render "—". */
  totalPnlPct: ReturnType<typeof bn> | null
}

/**
 * Total P&L = current value − net invested capital (money-weighted). This is the
 * canonical, USD-anchored definition: every dollar of value today vs every
 * dollar actually deployed, so it captures FX gains and losses on fiat cash
 * (EUR/TRY vs USD) — not just tradeable-asset gains. Equivalent to
 * unrealized + realized once fiat carries its FX P&L (see the fiat branch in
 * usePnL). Shared by the Portfolio summary and Dashboard hero so both render the
 * identical headline.
 *
 * The **%** is taken over PEAK net invested, not the current balance: net
 * invested is a running balance that shrinks on withdrawal, which would let
 * pulling out your own money change your return % (and explode it near zero /
 * flip it negative). Peak — the most capital ever at work at once — keeps the %
 * stable and makes a sell read the same whether its proceeds are withdrawn or
 * kept as cash. Returns null when peak ≤ 0 (nothing was ever deployed) so the
 * caller renders "—" instead of 0% / NaN.
 */
export function summarizePnLTotals(input: PnLTotalsInput): PnLTotals {
  const totalPnlUsd = input.totalCurrentValueUsd.minus(input.totalInvestedUsd)
  const totalPnlPct = input.peakInvestedUsd.gt(0)
    ? totalPnlUsd.div(input.peakInvestedUsd).times(BN_HUNDRED)
    : null
  return { totalPnlUsd, totalPnlPct }
}
