import BigNumber from "bignumber.js"
import { bn, BN_ZERO, BN_HUNDRED } from "@/lib/config"
import {
  DEFAULT_PROJECTION_BAND,
  MONTHS_PER_YEAR,
  PROJECTION_PHASE,
  WITHDRAWAL_STRATEGY,
} from "@/lib/retirement/constants"
import type {
  ContributionEnhancer,
  ExpectedReturnTriple,
  Projection,
  ProjectionBand,
  ProjectionMonth,
  RetirementScenarioInputs,
} from "@/lib/retirement/types"

/**
 * The projection core — the single month-by-month recurrence every retirement
 * figure resolves to (plan outcomes, comparison rows, Coast FIRE numbers,
 * sensitivity insights). Mirror of the "single P&L engine" rule: there is no
 * second growth path anywhere, and the inverse problems (required contribution,
 * months to target) are numeric solves against THIS function rather than
 * closed forms that could drift from it.
 *
 * See docs/components/GLOSSARY.md#projection-formula.
 */

const BN_ONE = new BigNumber(1)

/**
 * Monthly compounding of an annual rate: `(1+r)^(1/12) − 1` — never `r ÷ 12`.
 *
 * A fractional exponent is outside BigNumber's reach (`exponentiatedBy` takes
 * integers only), so this is a deliberate plain-number boundary, the same
 * tradeoff `solveXirr` and `computeCAGR` make.
 */
export function monthlyRateFromAnnualPct(annualRatePct: number): BigNumber {
  return compoundFactor(annualRatePct, 1 / MONTHS_PER_YEAR).minus(BN_ONE)
}

/** `(1 + pct/100)^years`, the growth (or inflation) factor over `years`. */
export function compoundFactor(annualPct: number, years: number): BigNumber {
  const base = 1 + annualPct / 100
  return bn(Math.pow(base, years))
}

/**
 * The contribution landing at the end of month `monthIndex`: the first month's
 * amount stepped up once every 12 months by `contributionGrowthPct`. Shared so
 * that anything needing the schedule outside the recurrence (the BES state
 * contribution, principal splits) reads the same one.
 */
export function contributionForMonth(
  monthlyContributionUsd: BigNumber,
  contributionGrowthPct: number,
  monthIndex: number,
): BigNumber {
  const step = BN_ONE.plus(bn(contributionGrowthPct).dividedBy(BN_HUNDRED))
  return monthlyContributionUsd.times(
    step.exponentiatedBy(Math.floor(monthIndex / MONTHS_PER_YEAR)),
  )
}

export function expectedReturnForBand(
  triple: ExpectedReturnTriple,
  band: ProjectionBand = DEFAULT_PROJECTION_BAND,
): number {
  return triple[band]
}

// ─── Scenario horizons ──────────────────────────────────────────────

/** Whole months from now to retirement age; 0 once retirement age is reached. */
export function monthsToRetirement(inputs: RetirementScenarioInputs): number {
  return wholeMonths(inputs.retirementAge - inputs.currentAge)
}

/** Whole months the depletion drawdown spans (retirement age → depletion age). */
export function monthsInRetirement(inputs: RetirementScenarioInputs): number {
  return wholeMonths(inputs.depletionAge - inputs.retirementAge)
}

export function yearsToRetirement(inputs: RetirementScenarioInputs): number {
  return Math.max(0, inputs.retirementAge - inputs.currentAge)
}

function wholeMonths(years: number): number {
  return Math.max(0, Math.round(years * MONTHS_PER_YEAR))
}

/**
 * The first retirement month's spending in nominal USD of the retirement date —
 * today's-USD spending inflated over the years to retirement. `P` in the
 * retirement target formula, and the drawdown's opening withdrawal.
 */
export function nominalMonthlySpendingAtRetirement(
  inputs: RetirementScenarioInputs,
): BigNumber {
  return bn(inputs.monthlySpendingUsd).times(
    compoundFactor(inputs.usdInflationPct, yearsToRetirement(inputs)),
  )
}

/** `null` starting amount means "seed from the live portfolio" — resolved upstream. */
export function resolveStartingAmountUsd(
  inputs: RetirementScenarioInputs,
  override?: BigNumber,
): BigNumber {
  return override ?? bn(inputs.startingAmountUsd ?? 0)
}

// ─── The recurrence ─────────────────────────────────────────────────

export interface ProjectionParams {
  startingAmountUsd: BigNumber
  /** First month's contribution; stepped up once a year by `contributionGrowthPct`. */
  monthlyContributionUsd: BigNumber
  contributionGrowthPct: number
  annualRatePct: number
  accumulationMonths: number
  /** Drawdown months appended after accumulation. 0 = accumulation only. */
  retirementMonths?: number
  /** First retirement month's spending, NOMINAL at the retirement date. */
  retirementSpendingUsd?: BigNumber
  /** Annual step-up of the withdrawal during the drawdown. */
  usdInflationPct?: number
  /** Option-specific extra stream (e.g. the BES state contribution). */
  contributionEnhancer?: ContributionEnhancer
}

/**
 * `V_(t+1) = V_t × (1 + r_m) + c_t` while accumulating,
 * `V_(t+1) = V_t × (1 + r_m) − w_t` while drawing down.
 *
 * Contributions and withdrawals land at month end (ordinary annuity), stepped
 * up once every 12 months — contributions by `contributionGrowthPct`,
 * withdrawals by `usdInflationPct`. The drawdown is not floored at zero: a plan
 * that overspends ends negative rather than silently solvent.
 */
export function projectGrowth(params: ProjectionParams): Projection {
  const growthFactor = BN_ONE.plus(monthlyRateFromAnnualPct(params.annualRatePct))
  const spendingStep = BN_ONE.plus(
    bn(params.usdInflationPct ?? 0).dividedBy(BN_HUNDRED),
  )
  const accumulationMonths = Math.max(0, Math.floor(params.accumulationMonths))
  const retirementMonths = Math.max(0, Math.floor(params.retirementMonths ?? 0))
  const firstWithdrawalUsd = params.retirementSpendingUsd ?? BN_ZERO

  const months: ProjectionMonth[] = []
  let valueUsd = params.startingAmountUsd
  let totalContributionsUsd = BN_ZERO

  for (let t = 0; t < accumulationMonths; t++) {
    const baseContributionUsd = contributionForMonth(
      params.monthlyContributionUsd,
      params.contributionGrowthPct,
      t,
    )
    const contributionUsd = params.contributionEnhancer
      ? baseContributionUsd.plus(
          params.contributionEnhancer(t, baseContributionUsd),
        )
      : baseContributionUsd
    valueUsd = valueUsd.times(growthFactor).plus(contributionUsd)
    totalContributionsUsd = totalContributionsUsd.plus(contributionUsd)
    months.push({
      monthIndex: t,
      phase: PROJECTION_PHASE.accumulation,
      contributionUsd,
      withdrawalUsd: BN_ZERO,
      valueUsd,
    })
  }

  for (let k = 0; k < retirementMonths; k++) {
    const withdrawalUsd = firstWithdrawalUsd.times(
      spendingStep.exponentiatedBy(Math.floor(k / MONTHS_PER_YEAR)),
    )
    valueUsd = valueUsd.times(growthFactor).minus(withdrawalUsd)
    months.push({
      monthIndex: accumulationMonths + k,
      phase: PROJECTION_PHASE.retirement,
      contributionUsd: BN_ZERO,
      withdrawalUsd,
      valueUsd,
    })
  }

  return { months, finalValueUsd: valueUsd, totalContributionsUsd }
}

// ─── Scenario adapter ───────────────────────────────────────────────

export interface ScenarioProjectionOptions {
  /** Which leg of the expected-return triple to run; defaults to the base case. */
  band?: ProjectionBand
  /** Resolved starting value (the scenario's own may be null = live portfolio). */
  startingAmountUsd?: BigNumber
  /** Overrides the scenario's monthly contribution (solvers, insights). */
  monthlyContributionUsd?: BigNumber
  /** Overrides the months-to-retirement horizon (solvers, insights). */
  accumulationMonths?: number
  /** Overrides the primary expected return (Compare options bring their own). */
  annualRatePct?: number
  /** Continue past retirement with the drawdown — capital depletion only. */
  includeRetirementDrawdown?: boolean
  contributionEnhancer?: ContributionEnhancer
}

/**
 * `projectGrowth` fed from a saved scenario: horizon from the ages, rate from
 * the primary expected return's chosen band, and — for a capital-depletion plan
 * that asks for it — the post-retirement drawdown to the depletion age.
 * Capital preservation never draws down (the principal is meant to survive).
 */
export function projectScenario(
  inputs: RetirementScenarioInputs,
  options: ScenarioProjectionOptions = {},
): Projection {
  const drawdown =
    options.includeRetirementDrawdown === true &&
    inputs.withdrawalStrategy === WITHDRAWAL_STRATEGY.depletion

  return projectGrowth({
    startingAmountUsd: resolveStartingAmountUsd(inputs, options.startingAmountUsd),
    monthlyContributionUsd:
      options.monthlyContributionUsd ?? bn(inputs.monthlyContributionUsd),
    contributionGrowthPct: inputs.contributionGrowthPct,
    annualRatePct:
      options.annualRatePct ??
      expectedReturnForBand(inputs.primaryExpectedReturn, options.band),
    accumulationMonths: options.accumulationMonths ?? monthsToRetirement(inputs),
    retirementMonths: drawdown ? monthsInRetirement(inputs) : 0,
    retirementSpendingUsd: drawdown
      ? nominalMonthlySpendingAtRetirement(inputs)
      : undefined,
    usdInflationPct: inputs.usdInflationPct,
    contributionEnhancer: options.contributionEnhancer,
  })
}
