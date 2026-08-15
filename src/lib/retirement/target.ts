import BigNumber from "bignumber.js"
import { bn, BN_ZERO, BN_HUNDRED } from "@/lib/config"
import { MONTHS_PER_YEAR, WITHDRAWAL_STRATEGY } from "@/lib/retirement/constants"
import {
  compoundFactor,
  expectedReturnForBand,
  monthlyRateFromAnnualPct,
  monthsInRetirement,
  nominalMonthlySpendingAtRetirement,
  yearsToRetirement,
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

/**
 * The inverse of `computeRetirementTarget`: the monthly spending, in TODAY's
 * USD, that a portfolio of `valueAtRetirementUsd` at retirement age supports
 * under the scenario's withdrawal strategy. Lives beside the target formulas
 * rather than in `solvers.ts` because it is that formula read backwards — the
 * two must never drift, and a round-trip test pins them together.
 *
 * Both directions are closed forms of the same expressions:
 *   preservation: `spending = value × SWR ÷ 12`, de-inflated to today;
 *   depletion:    the growing annuity solved for its first payment `P`
 *                 (`P = value × (r_m − g_m) ÷ (1 − q^m)`, `P = value ÷ m` when
 *                 `r_m = g_m`), then de-inflated to today.
 *
 * Degenerate inputs return zero, exactly as `computeRetirementTarget` does for
 * the same scenario: a non-positive SWR withdraws nothing, a depletion age at
 * or before retirement funds nothing, and a portfolio at or below zero supports
 * no spending at all.
 */
export function solveSupportedSpending(
  inputs: RetirementScenarioInputs,
  valueAtRetirementUsd: BigNumber,
  options: RetirementTargetOptions = {},
): BigNumber {
  if (!valueAtRetirementUsd.isGreaterThan(0)) return BN_ZERO

  const firstMonthSpendingUsd = (() => {
    if (inputs.withdrawalStrategy === WITHDRAWAL_STRATEGY.preservation) {
      const swr = bn(inputs.safeWithdrawalRatePct).dividedBy(BN_HUNDRED)
      if (!swr.isGreaterThan(0)) return BN_ZERO
      return valueAtRetirementUsd.times(swr).dividedBy(MONTHS_PER_YEAR)
    }

    const months = monthsInRetirement(inputs)
    if (months <= 0) return BN_ZERO

    const monthlyRate = monthlyRateFromAnnualPct(
      expectedReturnForBand(inputs.primaryExpectedReturn, options.band),
    )
    const monthlyInflation = monthlyRateFromAnnualPct(inputs.usdInflationPct)
    if (monthlyRate.isEqualTo(monthlyInflation)) {
      return valueAtRetirementUsd.dividedBy(months)
    }

    const ratio = BN_ONE.plus(monthlyInflation).dividedBy(BN_ONE.plus(monthlyRate))
    const annuityFactor = BN_ONE.minus(ratio.exponentiatedBy(months))
    if (annuityFactor.isZero()) return BN_ZERO
    return valueAtRetirementUsd
      .times(monthlyRate.minus(monthlyInflation))
      .dividedBy(annuityFactor)
  })()

  // The spending input is entered in today's USD and inflated to retirement by
  // `nominalMonthlySpendingAtRetirement`; coming back, deflate by the same factor.
  const inflationFactor = compoundFactor(
    inputs.usdInflationPct,
    yearsToRetirement(inputs),
  )
  if (!inflationFactor.isGreaterThan(0)) return BN_ZERO
  return firstMonthSpendingUsd.dividedBy(inflationFactor)
}
