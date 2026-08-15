import type BigNumber from "bignumber.js"
import type { Transaction, ExchangeRate } from "@/types/database"
import { bn, BN_ZERO, BN_HUNDRED } from "@/lib/config"
import { applyTxToInvested } from "@/lib/performance"
import { MIN_ANNUALIZATION_YEARS } from "@/lib/mwr"
import {
  solveXirrLog1p,
  deannualizeLog1p,
  yearsBetween,
  type XirrFlow,
} from "@/lib/xirr"

export interface AssetReturnRates {
  /** Money-weighted lifetime total for the asset: value − net invested. */
  totalPnlUsd: BigNumber
  /** Cumulative money-weighted (XIRR) return over the asset's own lifespan —
   *  "what each dollar earned for the time it was in". Exact at any age, so
   *  it is NOT gated on history length; this is the asset's headline %.
   *  Null when the solver has no answer (degenerate flows). */
  mwrCumulativePct: BigNumber | null
  /** The annualized "%/yr" reading of the same solve — null under
   *  MIN_ANNUALIZATION_YEARS of history (annualizing a short book is noise;
   *  same gate as the dashboard's lifetime chip). */
  mwrAnnualizedPct: BigNumber | null
}

/**
 * Per-asset return rates, from one asset's transactions and its live value.
 *
 * The flows feeding the XIRR are the per-tx deltas of `applyTxToInvested` —
 * the canonical net-invested rule — evaluated over the ASSET boundary. Note
 * the boundary is deliberately different from the portfolio MWR's
 * (`externalCashFlowUsd`): there, a buy's paired cash leg cancels it (money
 * never left the portfolio); here the buy IS money entering the asset.
 * Dividends/interest stay neutral (income, not capital), so reinvested income
 * surfaces as return, exactly as in the engine's decomposition. Sold-out
 * assets work naturally: terminal value 0 against the historical flows.
 *
 * No peak-based % here: at the asset level the user reads the % as "what did
 * my dollars earn", which is the money-weighted question — the peak-invested
 * denominator stays a portfolio-headline convention (lib/pnl/totals.ts).
 */
export function computeAssetReturnRates(
  transactions: Transaction[],
  rates: ExchangeRate[],
  currentValueUsd: BigNumber,
  todayIso: string,
): AssetReturnRates {
  const sorted = [...transactions].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
  )

  let cum = BN_ZERO
  const flows: XirrFlow[] = []
  for (const tx of sorted) {
    const next = applyTxToInvested(tx, rates, cum)
    const delta = next.minus(cum)
    if (!delta.isZero()) {
      flows.push({ date: tx.date.slice(0, 10), amountUsd: delta })
    }
    cum = next
  }

  const totalPnlUsd = currentValueUsd.minus(cum)

  let mwrCumulativePct: BigNumber | null = null
  let mwrAnnualizedPct: BigNumber | null = null
  if (flows.length > 0) {
    const today = todayIso.slice(0, 10)
    const years = yearsBetween(flows[0].date, today)
    const logGrowth =
      years > 0 ? solveXirrLog1p(flows, currentValueUsd, today) : null
    if (logGrowth !== null) {
      mwrCumulativePct = deannualizeLog1p(logGrowth, years).times(BN_HUNDRED)
      if (years >= MIN_ANNUALIZATION_YEARS) {
        mwrAnnualizedPct = bn(Math.expm1(logGrowth)).times(BN_HUNDRED)
      }
    }
  }

  return { totalPnlUsd, mwrCumulativePct, mwrAnnualizedPct }
}
