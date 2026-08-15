import BigNumber from "bignumber.js"
import { bn, BN_ZERO, BN_HUNDRED } from "@/lib/config"
import { MONTHS_PER_YEAR } from "@/lib/retirement/constants"
import { compoundFactor, contributionForMonth } from "@/lib/retirement/projection"
import type {
  ContributionEnhancer,
  RetirementScenarioInputs,
} from "@/lib/retirement/types"
import {
  BES_RETIREMENT_RIGHT_MIN_AGE,
  BES_RETIREMENT_RIGHT_MIN_YEARS,
  BES_RETIREMENT_RIGHT_VESTED_PCT,
  BES_STATE_CONTRIBUTION_CAP_BASIS_TRY,
  BES_STATE_CONTRIBUTION_RATE_PCT,
  BES_VESTING_SCHEDULE,
} from "@/lib/retirement/tax/constants"
import { impliedUsdTryRate } from "@/lib/retirement/tax/lots"

/**
 * BES state-contribution mechanics: the extra contribution stream the state
 * pays in, its annual cap, and the vesting that decides how much of it is the
 * participant's at exit. The projection core only sums the stream in; the cap
 * and the vesting live here with the exit-withholding rule that reads them.
 */

/**
 * The maximum state contribution for the `yearIndex`-th projection year, in TL
 * of that year: the minimum-wage-linked cap basis times the contribution rate,
 * grown by the scenario's TRY inflation. The basis is re-set every January, so
 * a multi-year plan needs the series, not the 2026 number.
 */
export function besStateContributionCapTry(
  inputs: RetirementScenarioInputs,
  yearIndex: number,
): BigNumber {
  return bn(BES_STATE_CONTRIBUTION_CAP_BASIS_TRY)
    .times(BES_STATE_CONTRIBUTION_RATE_PCT)
    .dividedBy(BN_HUNDRED)
    .times(compoundFactor(inputs.tryInflationPct, yearIndex))
}

/**
 * The state contribution stream: it matches `BES_STATE_CONTRIBUTION_RATE_PCT`
 * of every contribution until that projection year's cap is used up, then pays
 * nothing until the cap resets in January.
 *
 * The cap is a TL amount and the plan is USD-anchored, so each month is metered
 * in TL at that month's implied USD/TRY rate and the match converted back — the
 * cap therefore binds earlier or later depending on the depreciation
 * assumption, exactly as it would in reality.
 *
 * The returned enhancer carries the year-to-date state contribution as state.
 * It is safe to reuse across projection runs (a non-advancing month index
 * restarts the meter), but each band should still get its own.
 */
export function besContributionEnhancer(
  inputs: RetirementScenarioInputs,
): ContributionEnhancer {
  let meteredYearIndex = -1
  let previousMonthIndex = -1
  let usedTryThisYear = BN_ZERO

  return (monthIndex, baseContributionUsd) => {
    if (monthIndex <= previousMonthIndex) meteredYearIndex = -1
    previousMonthIndex = monthIndex

    const yearIndex = Math.floor(monthIndex / MONTHS_PER_YEAR)
    if (yearIndex !== meteredYearIndex) {
      meteredYearIndex = yearIndex
      usedTryThisYear = BN_ZERO
    }

    const rate = impliedUsdTryRate(monthIndex + 1, inputs.tryDepreciationPct)
    if (!rate.isGreaterThan(0)) return BN_ZERO

    const matchTry = baseContributionUsd
      .times(rate)
      .times(BES_STATE_CONTRIBUTION_RATE_PCT)
      .dividedBy(BN_HUNDRED)
    const remainingTry = besStateContributionCapTry(inputs, yearIndex).minus(
      usedTryThisYear,
    )
    if (!remainingTry.isGreaterThan(0)) return BN_ZERO

    const stateTry = BigNumber.min(matchTry, remainingTry)
    usedTryThisYear = usedTryThisYear.plus(stateTry)
    return stateTry.dividedBy(rate)
  }
}

/** How the money that went in splits between the participant and the state. */
export interface BesPrincipalSplit {
  participantUsd: BigNumber
  stateUsd: BigNumber
}

/**
 * The principal paid in over `accumulationMonths`, split by who paid it —
 * replaying the same contribution schedule and the same enhancer the projection
 * ran, so the split can never drift from the projected balance.
 *
 * SIMPLIFICATION: it replays the scenario's own monthly contribution. A
 * projection run with an overridden contribution (a solver, an insight) would
 * need its own split.
 */
export function besPrincipalSplitUsd(
  inputs: RetirementScenarioInputs,
  accumulationMonths: number,
): BesPrincipalSplit {
  const meter = besContributionEnhancer(inputs)
  let participantUsd = BN_ZERO
  let stateUsd = BN_ZERO

  for (let monthIndex = 0; monthIndex < accumulationMonths; monthIndex++) {
    const baseUsd = contributionForMonth(
      bn(inputs.monthlyContributionUsd),
      inputs.contributionGrowthPct,
      monthIndex,
    )
    participantUsd = participantUsd.plus(baseUsd)
    stateUsd = stateUsd.plus(meter(monthIndex, baseUsd))
  }

  return { participantUsd, stateUsd }
}

/** Retirement right = age 56 AND 10 years in the system, both at exit. */
export function besHasRetirementRight(ageAtExit: number, yearsInSystem: number): boolean {
  return (
    ageAtExit >= BES_RETIREMENT_RIGHT_MIN_AGE &&
    yearsInSystem >= BES_RETIREMENT_RIGHT_MIN_YEARS
  )
}

/**
 * The vested share of the state contribution: 100% on retirement right (also
 * death and disability, neither of which a plan projects), otherwise the
 * years-in-system tier.
 */
export function besVestedPct(ageAtExit: number, yearsInSystem: number): number {
  if (besHasRetirementRight(ageAtExit, yearsInSystem)) {
    return BES_RETIREMENT_RIGHT_VESTED_PCT
  }
  let vestedPct = 0
  for (const tier of BES_VESTING_SCHEDULE) {
    if (yearsInSystem >= tier.fromYears) vestedPct = tier.vestedPct
  }
  return vestedPct
}
