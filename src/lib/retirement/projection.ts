import BigNumber from "bignumber.js"
import { bn, BN_ZERO, BN_HUNDRED, DECIMALS } from "@/lib/config"
import {
  DEFAULT_PROJECTION_BAND,
  MONTHS_PER_YEAR,
  PROJECTION_PHASE,
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
 * amount stepped up once every 12 months by `contributionGrowthPct`, and zero
 * once the plan starts coasting (`contributingMonths` months in). Shared so that
 * anything needing the schedule outside the recurrence (the BES state
 * contribution, principal splits) reads the same one — including the coasting
 * window, which no caller has to re-derive.
 */
export function contributionForMonth(
  monthlyContributionUsd: BigNumber,
  contributionGrowthPct: number,
  monthIndex: number,
  contributingMonths?: number,
): BigNumber {
  if (contributingMonths !== undefined && monthIndex >= contributingMonths) {
    return BN_ZERO
  }
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

/**
 * Whole months contributions run for: now → contribution end age, never past
 * retirement. The months between this and `monthsToRetirement` are the coasting
 * window (growth only, no flows).
 */
export function monthsToContributionEnd(
  inputs: RetirementScenarioInputs,
): number {
  return Math.min(
    wholeMonths(inputs.contributionEndAge - inputs.currentAge),
    monthsToRetirement(inputs),
  )
}

/** Whole months the drawdown spans (retirement age → depletion age). */
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
  /** Pre-retirement months: the contributing months plus the coasting ones. */
  accumulationMonths: number
  /**
   * How many of the pre-retirement months carry a contribution; the rest coast
   * (growth only). Defaults to `accumulationMonths` — contribute to retirement.
   */
  contributingMonths?: number
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
 * `V_(t+1) = V_t × (1 + r_m) + c_t` while contributing,
 * `V_(t+1) = V_t × (1 + r_m)` while coasting,
 * `V_(t+1) = V_t × (1 + r_m) − w_t` while drawing down.
 *
 * Contributions and withdrawals land at month end (ordinary annuity), stepped
 * up once every 12 months — contributions by `contributionGrowthPct`,
 * withdrawals by `usdInflationPct`. Coasting months carry neither: `c_t` is zero
 * from `contributingMonths` on, which is the whole of the coasting phase — no
 * separate loop, so nothing can diverge between the two pre-retirement phases.
 * The drawdown is not floored at zero: a plan that overspends ends negative
 * rather than silently solvent.
 */
export function projectGrowth(params: ProjectionParams): Projection {
  const growthFactor = BN_ONE.plus(monthlyRateFromAnnualPct(params.annualRatePct))
  const spendingStep = BN_ONE.plus(
    bn(params.usdInflationPct ?? 0).dividedBy(BN_HUNDRED),
  )
  const accumulationMonths = Math.max(0, Math.floor(params.accumulationMonths))
  const contributingMonths = Math.min(
    accumulationMonths,
    Math.max(0, Math.floor(params.contributingMonths ?? accumulationMonths)),
  )
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
      contributingMonths,
    )
    const contributionUsd = params.contributionEnhancer
      ? baseContributionUsd.plus(
          params.contributionEnhancer(t, baseContributionUsd),
        )
      : baseContributionUsd
    // Rounded to DECIMALS.projection every month, and the drawdown below does
    // the same. `times` is exact, so an unrounded running value gains the
    // growth factor's full decimal expansion each month (19,197 decimal places
    // by the 1,200-month horizon `solveMonthsToTarget` scans) and the cost of a
    // projection turns quadratic in its horizon — measured 45x slower over one
    // Plan-tab edit's worth of solving. At 10 decimal places the accumulated
    // rounding error over 1,200 months is bounded far below a cent, i.e. below
    // anything this component displays or compares.
    valueUsd = valueUsd
      .times(growthFactor)
      .plus(contributionUsd)
      .decimalPlaces(DECIMALS.projection)
    totalContributionsUsd = totalContributionsUsd.plus(contributionUsd)
    months.push({
      monthIndex: t,
      phase:
        t < contributingMonths
          ? PROJECTION_PHASE.contributing
          : PROJECTION_PHASE.coasting,
      contributionUsd,
      withdrawalUsd: BN_ZERO,
      valueUsd,
    })
  }

  for (let k = 0; k < retirementMonths; k++) {
    const withdrawalUsd = firstWithdrawalUsd.times(
      spendingStep.exponentiatedBy(Math.floor(k / MONTHS_PER_YEAR)),
    )
    valueUsd = valueUsd
      .times(growthFactor)
      .minus(withdrawalUsd)
      .decimalPlaces(DECIMALS.projection)
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
  /** Continue past retirement with the drawdown, under either strategy. */
  includeRetirementDrawdown?: boolean
  contributionEnhancer?: ContributionEnhancer
}

/**
 * `projectGrowth` fed from a saved scenario: horizon from the ages, rate from
 * the primary expected return's chosen band, contributions stopping at the
 * contribution end age (the plan coasts from there to retirement), and — when
 * asked for — the post-retirement drawdown, running to the depletion age.
 *
 * The drawdown is the same withdrawal stream under both withdrawal strategies;
 * only the retirement target differs between them. Under capital preservation
 * the depletion age is a horizon to draw to, not a prediction of running out.
 */
export function projectScenario(
  inputs: RetirementScenarioInputs,
  options: ScenarioProjectionOptions = {},
): Projection {
  const drawdown = options.includeRetirementDrawdown === true
  const accumulationMonths =
    options.accumulationMonths ?? monthsToRetirement(inputs)

  return projectGrowth({
    startingAmountUsd: resolveStartingAmountUsd(inputs, options.startingAmountUsd),
    monthlyContributionUsd:
      options.monthlyContributionUsd ?? bn(inputs.monthlyContributionUsd),
    contributionGrowthPct: inputs.contributionGrowthPct,
    annualRatePct:
      options.annualRatePct ??
      expectedReturnForBand(inputs.primaryExpectedReturn, options.band),
    accumulationMonths,
    // The contribution end age binds regardless of the horizon override: a
    // solver looking a century ahead still stops contributing when the plan does.
    contributingMonths: Math.min(
      monthsToContributionEnd(inputs),
      accumulationMonths,
    ),
    retirementMonths: drawdown ? monthsInRetirement(inputs) : 0,
    retirementSpendingUsd: drawdown
      ? nominalMonthlySpendingAtRetirement(inputs)
      : undefined,
    usdInflationPct: inputs.usdInflationPct,
    contributionEnhancer: options.contributionEnhancer,
  })
}
