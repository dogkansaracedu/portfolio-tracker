import BigNumber from "bignumber.js"
import { bn, BN_ZERO, BN_HUNDRED } from "@/lib/config"
import { MONTHS_PER_YEAR } from "@/lib/retirement/constants"
import { compoundFactor } from "@/lib/retirement/projection"
import type {
  RetirementTaxEstimate,
  TaxRule,
  TaxRuleId,
  TaxRuleInput,
} from "@/lib/retirement/types"
import {
  bracketIndexationFactor,
  progressiveTaxTry,
} from "@/lib/retirement/tax/brackets"
import {
  BES_EXIT_WITHHOLDING_PCT,
  BES_RETIREMENT_RIGHT_MIN_YEARS,
  FOREIGN_EQUITY_GAIN_EXEMPTION_TRY,
  TAX_RULE_ID,
  TRY_DEPOSIT_ASSUMED_WITHHOLDING_PCT,
  YI_UFE_INDEXATION_MIN_INCREASE_PCT,
} from "@/lib/retirement/tax/constants"
import {
  besHasRetirementRight,
  besPrincipalSplitUsd,
  besVestedPct,
} from "@/lib/retirement/tax/bes"
import {
  buildExitPosition,
  exitValueTry,
  impliedUsdTryRate,
  totalCostTry,
  tryToUsdAtExit,
  type ExitPosition,
} from "@/lib/retirement/tax/lots"

/**
 * The tax rules: `(projection outcome × scenario assumptions) → retirement tax
 * estimate`. Every rate, threshold and condition they read comes from
 * `tax/constants.ts`, which transcribes docs/retirement-tax-rules.md with its
 * legal citations — no rate is written here.
 *
 * Every rule floors its tax at zero (a loss is not a refund) and reports in its
 * note which rate or condition applied, because the UI presents all of this as
 * an estimate under current law, never as a fact about the future.
 */

/** Percentages in an estimate note are quoted to one decimal. */
const NOTE_DECIMALS = 1

function estimate(taxUsd: BigNumber, note: string): RetirementTaxEstimate {
  return { taxUsd: taxUsd.isGreaterThan(0) ? taxUsd : BN_ZERO, note }
}

function pct(value: BigNumber | number, decimals = NOTE_DECIMALS): string {
  return bn(value).toFixed(decimals)
}

function effectiveRatePct(tax: BigNumber, base: BigNumber): BigNumber {
  if (!base.isGreaterThan(0)) return BN_ZERO
  return tax.dividedBy(base).times(BN_HUNDRED)
}

function yearsHeld(position: ExitPosition, monthsFromNow: number): number {
  return (position.exitMonths - monthsFromNow) / MONTHS_PER_YEAR
}

// ─── Foreign (US) equity — değer artış kazancı ──────────────────────

/**
 * GVK mük. 80/1: the gain is computed IN TRY — cost converted at the
 * acquisition-date rate, sale at the disposal-date rate — with each lot's cost
 * uplifted by the Yİ-ÜFE increase over its own holding period, but only where
 * that increase clears the ≥10% gate. The result runs through the progressive
 * non-employment tariff with thresholds indexed to the exit year.
 *
 * That the TRY figures come from the scenario's depreciation and inflation
 * assumptions rather than published index series is the whole point of the
 * estimate: it is why the same USD gain can be a large or a small taxable TRY
 * gain, and it is also why the output is a projection, not a tax computation.
 * The scenario's TRY inflation stands in for Yİ-ÜFE.
 */
const foreignEquityCapitalGains: TaxRule = ({ projection, inputs }) => {
  const position = buildExitPosition(projection)
  const saleTry = exitValueTry(position, inputs.tryDepreciationPct)

  let indexedCostTry = BN_ZERO
  let indexedLots = 0
  for (const lot of position.lots) {
    const costTry = lot.costUsd.times(
      impliedUsdTryRate(lot.monthsFromNow, inputs.tryDepreciationPct),
    )
    const indexFactor = compoundFactor(
      inputs.tryInflationPct,
      yearsHeld(position, lot.monthsFromNow),
    )
    const increasePct = indexFactor.minus(1).times(BN_HUNDRED)
    const gateMet = increasePct.isGreaterThanOrEqualTo(
      YI_UFE_INDEXATION_MIN_INCREASE_PCT,
    )
    indexedCostTry = indexedCostTry.plus(gateMet ? costTry.times(indexFactor) : costTry)
    if (gateMet) indexedLots += 1
  }

  const gainTry = saleTry
    .minus(indexedCostTry)
    .minus(FOREIGN_EQUITY_GAIN_EXEMPTION_TRY)
  const indexationNote = `${indexedLots}/${position.lots.length} lots cleared the ${YI_UFE_INDEXATION_MIN_INCREASE_PCT}% Yİ-ÜFE indexation gate`

  if (!gainTry.isGreaterThan(0)) {
    return estimate(
      BN_ZERO,
      `No taxable TRY gain after indexation (${indexationNote}) — nothing to declare.`,
    )
  }

  const indexation = bracketIndexationFactor(
    inputs.tryInflationPct,
    position.exitMonths,
  )
  const taxTry = progressiveTaxTry(gainTry, indexation)
  return estimate(
    tryToUsdAtExit(taxTry, position, inputs.tryDepreciationPct),
    `Değer artış kazancı on a TRY gain, progressive tariff with thresholds indexed ${pct(indexation.times(BN_HUNDRED).minus(BN_HUNDRED), 0)}% to the exit year; ${indexationNote}; effective ${pct(effectiveRatePct(taxTry, gainTry))}% of the TRY gain.`,
  )
}

// ─── Physical gold ──────────────────────────────────────────────────

/**
 * An individual's non-commercial physical gold gain falls into none of GVK's
 * seven income categories, so there is no tax and — the point worth stating —
 * no holding period to satisfy either.
 */
const goldUntaxed: TaxRule = () =>
  estimate(
    BN_ZERO,
    "Physical gold: no income tax for a non-commercial individual (outside GVK's seven income categories) and no holding-period condition.",
  )

// ─── BES exit withholding ───────────────────────────────────────────

/**
 * Stopaj at exit, on the irat (investment return) portion only: the base is the
 * balance less the participant's own principal and less the VESTED state
 * contribution principal. The rate is a tier of the exit condition — retirement
 * right (56 + 10 years) is the cheapest at 5%.
 *
 * SIMPLIFICATION: below full vesting the unvested state contribution and its
 * returns are actually forfeited at exit, but the projected balance still holds
 * them, so a short-horizon estimate overstates both the payout and the tax. At
 * a retirement horizon vesting is 100% and nothing is forfeited.
 */
const besExitWithholding: TaxRule = ({ projection, inputs }) => {
  const position = buildExitPosition(projection)
  const yearsInSystem = Math.floor(position.exitMonths / MONTHS_PER_YEAR)
  const ageAtExit = inputs.currentAge + position.exitMonths / MONTHS_PER_YEAR
  const retirementRight = besHasRetirementRight(ageAtExit, yearsInSystem)

  const ratePct = retirementRight
    ? BES_EXIT_WITHHOLDING_PCT.retirementRight
    : yearsInSystem >= BES_RETIREMENT_RIGHT_MIN_YEARS
      ? BES_EXIT_WITHHOLDING_PCT.tenYearsNoRetirementRight
      : BES_EXIT_WITHHOLDING_PCT.belowTenYears

  const split = besPrincipalSplitUsd(inputs, position.exitMonths)
  const vestedPct = besVestedPct(ageAtExit, yearsInSystem)
  const vestedStateUsd = split.stateUsd.times(vestedPct).dividedBy(BN_HUNDRED)
  const principalUsd = position.startingAmountUsd
    .plus(split.participantUsd)
    .plus(vestedStateUsd)
  const iratUsd = position.exitValueUsd.minus(principalUsd)

  const condition = retirementRight
    ? "retirement right (age 56 + 10 years)"
    : `${yearsInSystem} years of contributions, no retirement right`
  const vesting = `${vestedPct}% of the state contribution vested`

  if (!iratUsd.isGreaterThan(0)) {
    return estimate(
      BN_ZERO,
      `No irat above principal — nothing to withhold (${condition}; ${vesting}).`,
    )
  }

  return estimate(
    iratUsd.times(ratePct).dividedBy(BN_HUNDRED),
    `BES exit withholding ${ratePct}% — ${condition}; charged on the irat only (balance less participant principal and vested state contribution), ${vesting}.`,
  )
}

// ─── TRY deposit interest withholding ───────────────────────────────

/**
 * Stopaj on TRY deposit interest. The base is the NOMINAL TRY interest — the
 * lira principal is fixed in lira, so the interest that compensates for
 * depreciation is fully taxable, which is exactly why a TRY deposit's after-tax
 * USD outcome degrades as the depreciation assumption rises.
 *
 * SIMPLIFICATION: in reality the withholding is taken at every maturity, so the
 * saver loses the compounding on tax already paid. This applies the tier once,
 * to the whole accumulated interest at exit — a slightly optimistic estimate.
 * The tier itself (`TRY_DEPOSIT_ASSUMED_WITHHOLDING_PCT`) assumes deposits
 * rolled at maturities over one year.
 */
const tryDepositWithholding: TaxRule = ({ projection, inputs }) => {
  const position = buildExitPosition(projection)
  const interestTry = exitValueTry(position, inputs.tryDepreciationPct).minus(
    totalCostTry(position, inputs.tryDepreciationPct),
  )

  if (!interestTry.isGreaterThan(0)) {
    return estimate(BN_ZERO, "No TRY interest accrued — nothing to withhold.")
  }

  const taxTry = interestTry
    .times(TRY_DEPOSIT_ASSUMED_WITHHOLDING_PCT)
    .dividedBy(BN_HUNDRED)
  return estimate(
    tryToUsdAtExit(taxTry, position, inputs.tryDepreciationPct),
    `TRY deposit stopaj ${TRY_DEPOSIT_ASSUMED_WITHHOLDING_PCT}% (maturity over one year) on the nominal TRY interest; estimate applies the rate once at exit rather than at every maturity.`,
  )
}

// ─── Custom flat rate ───────────────────────────────────────────────

/**
 * The escape hatch for a user-defined option: one effective rate on the USD
 * gain, no TRY modeling. It is the user's own assumption and is labeled as one.
 */
const flatRate: TaxRule = ({ projection, option }) => {
  const position = buildExitPosition(projection)
  const gainUsd = position.exitValueUsd.minus(position.costUsd)
  const ratePct = option.flatTaxRatePct ?? 0

  if (!gainUsd.isGreaterThan(0) || ratePct <= 0) {
    return estimate(
      BN_ZERO,
      `Flat effective rate ${pct(ratePct)}% on the gain — no tax due.`,
    )
  }

  return estimate(
    gainUsd.times(ratePct).dividedBy(BN_HUNDRED),
    `Flat effective rate ${pct(ratePct)}% on the USD gain — a user-entered assumption, not a sourced rule.`,
  )
}

// ─── Registry ───────────────────────────────────────────────────────

export const TAX_RULES: Record<TaxRuleId, TaxRule> = {
  [TAX_RULE_ID.foreignEquityCapitalGains]: foreignEquityCapitalGains,
  [TAX_RULE_ID.goldUntaxed]: goldUntaxed,
  [TAX_RULE_ID.besExitWithholding]: besExitWithholding,
  [TAX_RULE_ID.tryDepositWithholding]: tryDepositWithholding,
  [TAX_RULE_ID.flatRate]: flatRate,
}

/** Adding an option never means editing another option's rule — just look it up. */
export function taxRuleFor(taxRuleId: TaxRuleId): TaxRule {
  return TAX_RULES[taxRuleId]
}

export function estimateRetirementTax(input: TaxRuleInput): RetirementTaxEstimate {
  return taxRuleFor(input.option.taxRuleId)(input)
}
