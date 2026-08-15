import BigNumber from "bignumber.js"
import { bn, BN_ZERO, BN_HUNDRED } from "@/lib/config"
import { MONTHS_PER_YEAR, WITHDRAWAL_STRATEGY } from "@/lib/retirement/constants"
import {
  expectedReturnForBand,
  monthlyRateFromAnnualPct,
  monthsInRetirement,
  nominalMonthlySpendingAtRetirement,
} from "@/lib/retirement/projection"
import type {
  ProjectionBand,
  RetirementScenarioInputs,
} from "@/lib/retirement/types"

/**
 * The retirement target — the portfolio value required AT retirement age, in
 * nominal USD of that date. Spending is entered in today's USD and inflated to
 * retirement first (see `nominalMonthlySpendingAtRetirement`).
 *
 * See docs/components/GLOSSARY.md#retirement-target-formula.
 */

const BN_ONE = new BigNumber(1)

export interface RetirementTargetOptions {
  /** Which leg of the primary expected return discounts the depletion annuity. */
  band?: ProjectionBand
}

/**
 * Capital preservation: `target = annual spending at retirement ÷ SWR`.
 * Capital depletion: present value at retirement of the inflation-growing
 * spending stream up to the depletion age — a growing annuity, which collapses
 * to `P × m` in the degenerate `r_m = g_m` case (growth exactly cancels
 * inflation, so every month costs the same in retirement-date dollars).
 *
 * Degenerate inputs (non-positive SWR, a depletion age at or before retirement)
 * fund nothing and return zero rather than an infinity the UI would have to
 * decode.
 */
export function computeRetirementTarget(
  inputs: RetirementScenarioInputs,
  options: RetirementTargetOptions = {},
): BigNumber {
  const firstMonthSpendingUsd = nominalMonthlySpendingAtRetirement(inputs)

  if (inputs.withdrawalStrategy === WITHDRAWAL_STRATEGY.preservation) {
    const swr = bn(inputs.safeWithdrawalRatePct).dividedBy(BN_HUNDRED)
    if (!swr.isGreaterThan(0)) return BN_ZERO
    return firstMonthSpendingUsd.times(MONTHS_PER_YEAR).dividedBy(swr)
  }

  const months = monthsInRetirement(inputs)
  if (months <= 0) return BN_ZERO

  const monthlyRate = monthlyRateFromAnnualPct(
    expectedReturnForBand(inputs.primaryExpectedReturn, options.band),
  )
  const monthlyInflation = monthlyRateFromAnnualPct(inputs.usdInflationPct)
  if (monthlyRate.isEqualTo(monthlyInflation)) {
    return firstMonthSpendingUsd.times(months)
  }

  const ratio = BN_ONE.plus(monthlyInflation).dividedBy(BN_ONE.plus(monthlyRate))
  return firstMonthSpendingUsd
    .times(BN_ONE.minus(ratio.exponentiatedBy(months)))
    .dividedBy(monthlyRate.minus(monthlyInflation))
}
