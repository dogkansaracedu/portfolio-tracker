import type BigNumber from "bignumber.js"
import { bn, BN_ZERO } from "@/lib/config"
import { MONTHS_PER_YEAR } from "@/lib/retirement/constants"
import {
  projectScenario,
  resolveStartingAmountUsd,
  type ScenarioProjectionOptions,
} from "@/lib/retirement/projection"
import type { RetirementScenarioInputs } from "@/lib/retirement/types"

/**
 * The two inverse plan modes, solved numerically against `projectScenario`
 * itself — never a closed form that could drift from the recurrence the charts
 * draw. Both return null when the target is unreachable under the assumptions;
 * the UI renders "—" rather than a fabricated number (same null contract as
 * `solveXirr`).
 */

/** Bisection stops when the contribution bracket is narrower than this (USD). */
const CONTRIBUTION_TOLERANCE_USD = 1e-6

/** Beyond this monthly contribution the answer is "not reachable", not a number. */
const MAX_MONTHLY_CONTRIBUTION_USD = 1e12

const MAX_BISECTION_ITERATIONS = 200

/** How far "time to target" is allowed to look ahead — a century of months. */
export const MAX_SOLVE_MONTHS = 100 * MONTHS_PER_YEAR

/** Accumulation-only: the target is a value AT retirement, before any drawdown. */
function accumulationOptions(
  options: ScenarioProjectionOptions,
): ScenarioProjectionOptions {
  return { ...options, includeRetirementDrawdown: false }
}

/**
 * The monthly contribution whose projection reaches `target` by the end of the
 * horizon (the scenario's months to retirement unless overridden).
 *
 * Bisected on the contribution, whose effect on the final value is monotone
 * (each month's contribution enters the sum with a positive weight). Returns
 * the bracket's upper bound, so projecting the answer back always meets the
 * target rather than landing a hair under it. Zero when the starting amount
 * already gets there; null when no contribution inside
 * `MAX_MONTHLY_CONTRIBUTION_USD` does.
 */
export function solveRequiredContribution(
  target: BigNumber,
  inputs: RetirementScenarioInputs,
  options: ScenarioProjectionOptions = {},
): BigNumber | null {
  const projectOptions = accumulationOptions(options)
  const targetUsd = target.toNumber()

  const finalValueFor = (contributionUsd: number): number =>
    projectScenario(inputs, {
      ...projectOptions,
      monthlyContributionUsd: bn(contributionUsd),
    }).finalValueUsd.toNumber()

  let lo = 0
  if (finalValueFor(lo) >= targetUsd) return BN_ZERO

  let hi = 1
  while (finalValueFor(hi) < targetUsd) {
    hi *= 2
    if (hi > MAX_MONTHLY_CONTRIBUTION_USD) return null
  }

  for (let i = 0; i < MAX_BISECTION_ITERATIONS; i++) {
    if (hi - lo < CONTRIBUTION_TOLERANCE_USD) break
    const mid = (lo + hi) / 2
    if (finalValueFor(mid) >= targetUsd) hi = mid
    else lo = mid
  }
  return bn(hi)
}

/**
 * Months from now until the projected portfolio first meets `target` at the
 * given contribution — 0 when the starting amount is already there, null when
 * it never gets there within `MAX_SOLVE_MONTHS`.
 *
 * Scanned month by month over one projection rather than bisected on the
 * horizon: months are integers, and a scan returns the FIRST crossing even when
 * the path is not monotone (a negative expected return, or a contribution too
 * small to outrun it, can cross more than once).
 */
export function solveMonthsToTarget(
  contributionUsd: BigNumber,
  target: BigNumber,
  inputs: RetirementScenarioInputs,
  options: ScenarioProjectionOptions = {},
): number | null {
  const startingAmountUsd = resolveStartingAmountUsd(
    inputs,
    options.startingAmountUsd,
  )
  if (startingAmountUsd.isGreaterThanOrEqualTo(target)) return 0

  const projection = projectScenario(inputs, {
    ...accumulationOptions(options),
    monthlyContributionUsd: contributionUsd,
    accumulationMonths: options.accumulationMonths ?? MAX_SOLVE_MONTHS,
  })

  for (const month of projection.months) {
    if (month.valueUsd.isGreaterThanOrEqualTo(target)) return month.monthIndex + 1
  }
  return null
}
