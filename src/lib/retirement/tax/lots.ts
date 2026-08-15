import BigNumber from "bignumber.js"
import { bn, BN_ZERO } from "@/lib/config"
import { MONTHS_PER_YEAR, PROJECTION_PHASE } from "@/lib/retirement/constants"
import { compoundFactor } from "@/lib/retirement/projection"
import type { Projection, ProjectionMonth } from "@/lib/retirement/types"
import { ASSUMED_USD_TRY_SPOT_RATE } from "@/lib/retirement/tax/constants"

/**
 * The lot view of a projection, shared by every rule that computes a taxable
 * gain: the exit position (when the taxable event happens and what it is worth)
 * decomposed into the acquisition lots that make it up, plus the TRY conversion
 * path the scenario's depreciation assumption implies.
 *
 * ASSUMPTION-DRIVEN PROXY: a projection has no transaction history — it has a
 * contribution schedule. Each month's contribution is modeled as one lot bought
 * at that month's implied USD/TRY rate, and the exit value is split across the
 * lots in proportion to how long each compounded. It reproduces the real filing
 * arithmetic (lot-by-lot TRY cost, lot-by-lot indexation) over an assumed
 * price/FX path, not a real one — every figure it feeds is an estimate.
 */

const BN_ONE = new BigNumber(1)

/** Working precision of the compounded growth series — matches `bn()`'s. */
const GROWTH_FACTOR_DECIMALS = 20

/** One acquisition lot of the exit position. */
export interface TaxableLot {
  /** Months from now the lot was acquired (a month-end contribution sits at t+1). */
  monthsFromNow: number
  costUsd: BigNumber
  /** The share of the exit value this lot grew into. */
  exitValueUsd: BigNumber
}

/** A projection resolved to the taxable event at the end of accumulation. */
export interface ExitPosition {
  /** Months from now the taxable exit happens (end of the accumulation phase). */
  exitMonths: number
  exitValueUsd: BigNumber
  /** The pre-existing balance the plan started from, USD. */
  startingAmountUsd: BigNumber
  /** Starting amount + every contribution (participant and enhancer alike). */
  costUsd: BigNumber
  lots: TaxableLot[]
}

/**
 * TL per USD `monthsFromNow` months out, compounding the scenario's annual
 * TRY-depreciation assumption off today's spot. A depreciation of −100%/yr or
 * worse has no meaningful factor, so spot passes through.
 */
export function impliedUsdTryRate(
  monthsFromNow: number,
  tryDepreciationPct: number,
): BigNumber {
  const spot = bn(ASSUMED_USD_TRY_SPOT_RATE)
  const factor = compoundFactor(tryDepreciationPct, monthsFromNow / MONTHS_PER_YEAR)
  if (!factor.isGreaterThan(0)) return spot
  return spot.times(factor)
}

/**
 * The month-on-month growth factor the projection actually ran at, read back
 * out of the recurrence (`V_t = V_(t−1) × g + c_t − w_t`) rather than taken
 * from the option's expected return — the tax rule contract carries no band, so
 * deriving it from the numbers is the only way the two can never disagree.
 */
function impliedMonthlyGrowthFactor(months: ProjectionMonth[]): BigNumber {
  for (let t = 1; t < months.length; t++) {
    const previousValueUsd = months[t - 1].valueUsd
    if (previousValueUsd.isGreaterThan(0)) {
      return months[t].valueUsd
        .plus(months[t].withdrawalUsd)
        .minus(months[t].contributionUsd)
        .dividedBy(previousValueUsd)
    }
  }
  return BN_ONE
}

/**
 * Decompose a projection into its taxable exit position. The taxable event is
 * the end of accumulation — a drawdown that follows is spending, not a second
 * disposal, so retirement months are ignored here.
 */
export function buildExitPosition(projection: Projection): ExitPosition {
  const accumulation = projection.months.filter(
    (month) => month.phase === PROJECTION_PHASE.accumulation,
  )
  const exitMonths = accumulation.length
  const growthFactor = impliedMonthlyGrowthFactor(accumulation)

  const startingAmountUsd = resolveStartingAmount(accumulation, growthFactor)
  const exitValueUsd =
    exitMonths > 0 ? accumulation[exitMonths - 1].valueUsd : startingAmountUsd

  const lots: TaxableLot[] = []
  if (startingAmountUsd.isGreaterThan(0)) {
    lots.push({ monthsFromNow: 0, costUsd: startingAmountUsd, exitValueUsd: BN_ZERO })
  }
  for (const month of accumulation) {
    if (!month.contributionUsd.isGreaterThan(0)) continue
    lots.push({
      monthsFromNow: month.monthIndex + 1,
      costUsd: month.contributionUsd,
      exitValueUsd: BN_ZERO,
    })
  }

  return {
    exitMonths,
    exitValueUsd,
    startingAmountUsd,
    costUsd: lots.reduce((sum, lot) => sum.plus(lot.costUsd), BN_ZERO),
    lots: allocateExitValue(lots, exitMonths, growthFactor, exitValueUsd),
  }
}

/** `V_0 = start × g + c_0` inverted; a degenerate growth factor means no seed. */
function resolveStartingAmount(
  accumulation: ProjectionMonth[],
  growthFactor: BigNumber,
): BigNumber {
  if (accumulation.length === 0 || !growthFactor.isGreaterThan(0)) return BN_ZERO
  const seeded = accumulation[0].valueUsd
    .minus(accumulation[0].contributionUsd)
    .dividedBy(growthFactor)
  return seeded.isGreaterThan(0) ? seeded : BN_ZERO
}

/**
 * Split the exit value across the lots by compounded weight — lot `l` carries
 * `cost × g^(exitMonths − acquired)`, which sums back to the exit value by
 * construction of the recurrence. Normalising by the weight total keeps the
 * split exact even when the derived growth factor is imprecise; a degenerate
 * weight total falls back to splitting by cost.
 */
function allocateExitValue(
  lots: TaxableLot[],
  exitMonths: number,
  growthFactor: BigNumber,
  exitValueUsd: BigNumber,
): TaxableLot[] {
  const compounded = compoundedGrowth(growthFactor, exitMonths)
  const weights = lots.map((lot) =>
    lot.costUsd.times(compounded[exitMonths - lot.monthsFromNow]),
  )
  let total = weights.reduce((sum, weight) => sum.plus(weight), BN_ZERO)
  let shares = weights
  if (!total.isGreaterThan(0)) {
    shares = lots.map((lot) => lot.costUsd)
    total = shares.reduce((sum, share) => sum.plus(share), BN_ZERO)
  }
  if (!total.isGreaterThan(0)) return lots

  return lots.map((lot, index) => ({
    ...lot,
    exitValueUsd: exitValueUsd.times(shares[index]).dividedBy(total),
  }))
}

/**
 * `g^0 … g^months`, built iteratively and clipped to the configured internal
 * precision at every step. `exponentiatedBy` is exact for integer exponents, so
 * a derived 20-decimal growth factor raised to the 240th power carries
 * thousands of digits — accurate far beyond the point of usefulness, and slow.
 */
function compoundedGrowth(growthFactor: BigNumber, months: number): BigNumber[] {
  const usable = growthFactor.isGreaterThan(0) ? growthFactor : BN_ONE
  const powers: BigNumber[] = [BN_ONE]
  for (let step = 1; step <= months; step++) {
    powers.push(
      powers[step - 1].times(usable).decimalPlaces(GROWTH_FACTOR_DECIMALS),
    )
  }
  return powers
}

/** Total TRY cost of the lots, each converted at its own acquisition-date rate. */
export function totalCostTry(
  position: ExitPosition,
  tryDepreciationPct: number,
): BigNumber {
  return position.lots.reduce(
    (sum, lot) =>
      sum.plus(lot.costUsd.times(impliedUsdTryRate(lot.monthsFromNow, tryDepreciationPct))),
    BN_ZERO,
  )
}

/** The exit value in TRY at the exit-date implied rate. */
export function exitValueTry(
  position: ExitPosition,
  tryDepreciationPct: number,
): BigNumber {
  return position.exitValueUsd.times(
    impliedUsdTryRate(position.exitMonths, tryDepreciationPct),
  )
}

/** A TRY amount at the exit date brought back to the USD anchor. */
export function tryToUsdAtExit(
  amountTry: BigNumber,
  position: ExitPosition,
  tryDepreciationPct: number,
): BigNumber {
  const rate = impliedUsdTryRate(position.exitMonths, tryDepreciationPct)
  if (!rate.isGreaterThan(0)) return BN_ZERO
  return amountTry.dividedBy(rate)
}
