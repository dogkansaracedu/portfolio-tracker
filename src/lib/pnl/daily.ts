import type BigNumber from "bignumber.js"
import { BN_HUNDRED } from "@/lib/config"

/**
 * Day's % return on the capital that was at work during the period.
 *
 * Returns `null` when there's no sensible base (denominator <= 0) — e.g. a
 * fully netted-out / zero-base position — so callers render "—" instead of a
 * misleading 0% / NaN / huge number. Mirrors the divide-by-zero guards used
 * throughout the P&L code (e.g. usePnL `costBasisUsd.isZero()`).
 */
export function dailyReturnPct(
  returnUsd: BigNumber,
  denomUsd: BigNumber,
): BigNumber | null {
  if (denomUsd.lte(0)) return null
  return returnUsd.div(denomUsd).times(BN_HUNDRED)
}

export interface DailyReturnInput {
  /** Current USD value of the asset (or holding). */
  currentValueUsd: BigNumber
  /** USD value at the previous snapshot ("yesterday's close"). 0 if not held then. */
  prevValueUsd: BigNumber
  /**
   * Net USD cash deployed into it since the previous snapshot (buys/fees add,
   * sells/dividends subtract, transfers net out). Produced by
   * `computeCurrentInvestedUsd(periodTxs, rates)`.
   */
  periodInvestedUsd: BigNumber
}

export interface DailyReturn {
  /** Money-weighted day P&L = currentValue − prevValue − periodInvested. */
  dailyReturnUsd: BigNumber
  /**
   * Base the percentage is taken on = prevValue + periodInvested. Carried so a
   * group rollup can sum denominators and call `dailyReturnPct(Σreturn, Σdenom)`.
   */
  denomUsd: BigNumber
  dailyReturnPct: BigNumber | null
}

/**
 * Money-weighted daily return: the canonical Total P&L definition
 * (value − net invested, see `lib/pnl/totals.ts`) applied over a single day.
 *
 * Subtracting the period's deployed cash removes principal, leaving only price
 * movement — including the intraday move on a position opened today, measured
 * from its purchase price. Pure; used at both asset and (asset, platform)
 * granularity, and its `denomUsd` lets group rollups reuse `dailyReturnPct`.
 */
export function computeDailyReturn(input: DailyReturnInput): DailyReturn {
  const dailyReturnUsd = input.currentValueUsd
    .minus(input.prevValueUsd)
    .minus(input.periodInvestedUsd)
  const denomUsd = input.prevValueUsd.plus(input.periodInvestedUsd)
  return {
    dailyReturnUsd,
    denomUsd,
    dailyReturnPct: dailyReturnPct(dailyReturnUsd, denomUsd),
  }
}
