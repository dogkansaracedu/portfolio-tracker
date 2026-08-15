import type BigNumber from "bignumber.js"
import { PROJECTION_BAND, RETURN_CURRENCY } from "@/lib/retirement/constants"
import {
  expectedReturnForBand,
  monthsToRetirement,
  projectScenario,
} from "@/lib/retirement/projection"
import { toReal, usdRateFromTryRate } from "@/lib/retirement/real"
import type {
  ComparisonBandResult,
  ComparisonOption,
  ComparisonResult,
  ContributionEnhancer,
  Projection,
  ProjectionBand,
  RetirementScenarioInputs,
} from "@/lib/retirement/types"
import { besContributionEnhancer } from "@/lib/retirement/tax/bes"
import { TAX_RULE_ID } from "@/lib/retirement/tax/constants"
import { estimateRetirementTax } from "@/lib/retirement/tax/rules"

/**
 * The Compare view's runner: one contribution plan through N options, three
 * bands each. Same flows into every option — only the growth rate and the tax
 * rule differ, so a row's advantage is never an artefact of a different plan.
 *
 * The comparison stops at retirement: the taxable exit is the end of
 * accumulation, and what happens to the money afterwards is the Plan tab's
 * drawdown, not a second disposal.
 */

const BANDS: ProjectionBand[] = [
  PROJECTION_BAND.pessimistic,
  PROJECTION_BAND.base,
  PROJECTION_BAND.optimistic,
]

export interface RunComparisonOptions {
  /** Resolved starting value (the scenario's own may be null = live portfolio). */
  startingAmountUsd?: BigNumber
}

export function runComparison(
  inputs: RetirementScenarioInputs,
  options: RunComparisonOptions = {},
): ComparisonResult[] {
  return inputs.options.map((option) => runOption(inputs, option, options))
}

function runOption(
  inputs: RetirementScenarioInputs,
  option: ComparisonOption,
  runOptions: RunComparisonOptions,
): ComparisonResult {
  const projections = {} as Record<ProjectionBand, Projection>
  const results = {} as Record<ProjectionBand, ComparisonBandResult>

  for (const band of BANDS) {
    const projection = projectScenario(inputs, {
      band,
      startingAmountUsd: runOptions.startingAmountUsd,
      annualRatePct: usdAnnualRatePct(inputs, option, band),
      contributionEnhancer: contributionEnhancerFor(inputs, option),
      includeRetirementDrawdown: false,
    })
    projections[band] = projection
    results[band] = bandResult(inputs, option, projection)
  }

  return { option, projections, results }
}

/**
 * A TRY-quoted expected return is stored TRY-quoted and converted here — the
 * projection core only ever grows USD.
 */
function usdAnnualRatePct(
  inputs: RetirementScenarioInputs,
  option: ComparisonOption,
  band: ProjectionBand,
): number {
  const ratePct = expectedReturnForBand(option.expectedReturn, band)
  return option.returnCurrency === RETURN_CURRENCY.try
    ? usdRateFromTryRate(ratePct, inputs.tryDepreciationPct)
    : ratePct
}

/** Only BES pays an extra contribution stream in; each band gets its own meter. */
function contributionEnhancerFor(
  inputs: RetirementScenarioInputs,
  option: ComparisonOption,
): ContributionEnhancer | undefined {
  return option.taxRuleId === TAX_RULE_ID.besExitWithholding
    ? besContributionEnhancer(inputs)
    : undefined
}

function bandResult(
  inputs: RetirementScenarioInputs,
  option: ComparisonOption,
  projection: Projection,
): ComparisonBandResult {
  const taxEstimate = estimateRetirementTax({ projection, inputs, option })
  const afterTaxFinalValueUsd = projection.finalValueUsd.minus(taxEstimate.taxUsd)

  return {
    grossFinalValueUsd: projection.finalValueUsd,
    taxEstimate,
    afterTaxFinalValueUsd,
    afterTaxRealFinalValueUsd: toReal(
      afterTaxFinalValueUsd,
      monthsToRetirement(inputs),
      inputs.usdInflationPct,
    ),
  }
}
