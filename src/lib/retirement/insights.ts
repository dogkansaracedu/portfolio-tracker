import type BigNumber from "bignumber.js"
import { bn, BN_HUNDRED } from "@/lib/config"
import {
  SENSITIVITY_INPUT,
  SENSITIVITY_KIND,
  SENSITIVITY_METRIC,
  SENSITIVITY_UNIT,
  WITHDRAWAL_STRATEGY,
} from "@/lib/retirement/constants"
import type { ScenarioProjectionOptions } from "@/lib/retirement/projection"
import {
  solveMonthsToTarget,
  solveRequiredContribution,
} from "@/lib/retirement/solvers"
import { computeRetirementTarget } from "@/lib/retirement/target"
import type { RetirementScenarioInputs } from "@/lib/retirement/types"

/**
 * Sensitivity insights — "how far does one input move one output". Every value
 * here is a solver run over the same projection core the charts draw, so an
 * insight can never disagree with a chart.
 *
 * Structured data only: no sentences, no formatted currency. The UI phrases
 * them (and applies the display-currency / obfuscation conventions).
 */

export type SensitivityInsightKind =
  (typeof SENSITIVITY_KIND)[keyof typeof SENSITIVITY_KIND]

export type SensitivityInput =
  (typeof SENSITIVITY_INPUT)[keyof typeof SENSITIVITY_INPUT]

export type SensitivityUnit =
  (typeof SENSITIVITY_UNIT)[keyof typeof SENSITIVITY_UNIT]

/** Months are plain integers; money stays BigNumber. Nulls = not reachable. */
export type SensitivityEffect =
  | {
      metric: typeof SENSITIVITY_METRIC.monthsToTarget
      baseMonths: number | null
      changedMonths: number | null
      /** base − changed; positive = the change gets you there sooner. */
      monthsSaved: number | null
    }
  | {
      metric: typeof SENSITIVITY_METRIC.requiredMonthlyContributionUsd
      baseUsd: BigNumber | null
      changedUsd: BigNumber | null
      /** changed − base; positive = the change costs more per month. */
      deltaUsd: BigNumber | null
    }

export interface SensitivityInsight {
  kind: SensitivityInsightKind
  changedInput: SensitivityInput
  unit: SensitivityUnit
  baseValue: BigNumber
  changedValue: BigNumber
  effect: SensitivityEffect
}

/** Contribution steps the Plan tab reports, in percent above the plan. */
export const CONTRIBUTION_STEP_PCTS = [25, 50] as const

/** Retirement-age shifts the Plan tab reports, in years. */
export const RETIREMENT_AGE_SHIFT_YEARS = [-5, 5] as const

/**
 * The insight set: contribution steps (+25% / +50% → months saved reaching the
 * retirement target) and retirement-age shifts (±5 years → required monthly
 * contribution). An age shift re-derives its own target — retiring later
 * inflates spending further and shortens the drawdown — so the required
 * contribution it reports is the one that actually funds that retirement.
 *
 * Shifts that fall outside the scenario's own age ordering (at or before the
 * current age, at or past the depletion age) are skipped rather than solved
 * into nonsense.
 */
export function computeSensitivityInsights(
  inputs: RetirementScenarioInputs,
  options: ScenarioProjectionOptions = {},
): SensitivityInsight[] {
  const insights: SensitivityInsight[] = []
  const target = computeRetirementTarget(inputs, { band: options.band })
  const baseContributionUsd = bn(inputs.monthlyContributionUsd)
  const baseMonths = solveMonthsToTarget(
    baseContributionUsd,
    target,
    inputs,
    options,
  )

  for (const stepPct of CONTRIBUTION_STEP_PCTS) {
    const changedContributionUsd = baseContributionUsd.times(
      BN_HUNDRED.plus(stepPct).dividedBy(BN_HUNDRED),
    )
    const changedMonths = solveMonthsToTarget(
      changedContributionUsd,
      target,
      inputs,
      options,
    )
    insights.push({
      kind: SENSITIVITY_KIND.contributionStep,
      changedInput: SENSITIVITY_INPUT.monthlyContributionUsd,
      unit: SENSITIVITY_UNIT.usdPerMonth,
      baseValue: baseContributionUsd,
      changedValue: changedContributionUsd,
      effect: {
        metric: SENSITIVITY_METRIC.monthsToTarget,
        baseMonths,
        changedMonths,
        monthsSaved:
          baseMonths === null || changedMonths === null
            ? null
            : baseMonths - changedMonths,
      },
    })
  }

  const baseRequiredUsd = solveRequiredContribution(target, inputs, options)

  for (const shiftYears of RETIREMENT_AGE_SHIFT_YEARS) {
    const retirementAge = inputs.retirementAge + shiftYears
    if (retirementAge <= inputs.currentAge) continue
    if (
      inputs.withdrawalStrategy === WITHDRAWAL_STRATEGY.depletion &&
      retirementAge >= inputs.depletionAge
    ) {
      continue
    }
    const shifted: RetirementScenarioInputs = { ...inputs, retirementAge }
    const shiftedTarget = computeRetirementTarget(shifted, { band: options.band })
    const changedUsd = solveRequiredContribution(shiftedTarget, shifted, options)
    insights.push({
      kind: SENSITIVITY_KIND.retirementAgeShift,
      changedInput: SENSITIVITY_INPUT.retirementAge,
      unit: SENSITIVITY_UNIT.years,
      baseValue: bn(inputs.retirementAge),
      changedValue: bn(retirementAge),
      effect: {
        metric: SENSITIVITY_METRIC.requiredMonthlyContributionUsd,
        baseUsd: baseRequiredUsd,
        changedUsd,
        deltaUsd:
          baseRequiredUsd === null || changedUsd === null
            ? null
            : changedUsd.minus(baseRequiredUsd),
      },
    })
  }

  return insights
}
