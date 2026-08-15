import type BigNumber from "bignumber.js";

// Type contract for Component 13 (Retirement Planning).
// Names follow docs/components/GLOSSARY.md verbatim (term-singularity rule).
// Saved inputs are plain JSON-serializable values; computed outputs are BigNumber.

/** Pessimistic / base / optimistic annual expected return, in percent per year. */
export interface ExpectedReturnTriple {
  pessimistic: number;
  base: number;
  optimistic: number;
}

export type ProjectionBand = keyof ExpectedReturnTriple;

export type WithdrawalStrategy = "capital_preservation" | "capital_depletion";

export type ReturnCurrency = "USD" | "TRY";

/**
 * Tax rule identifiers. Rules themselves live in src/lib/retirement/tax/ and
 * are data-driven from docs/retirement-tax-rules.md.
 */
export type TaxRuleId =
  | "foreign_equity_capital_gains"
  | "gold_untaxed"
  | "bes_exit_withholding"
  | "try_deposit_withholding"
  | "flat_rate";

/** A comparison option: a named growth + tax profile the contribution plan runs through. */
export interface ComparisonOption {
  id: string;
  name: string;
  expectedReturn: ExpectedReturnTriple;
  /** TRY returns convert to USD growth via the scenario's TRY-depreciation assumption. */
  returnCurrency: ReturnCurrency;
  taxRuleId: TaxRuleId;
  /** Effective tax rate in percent — only read by the "flat_rate" rule. */
  flatTaxRatePct?: number;
}

/** JSON-serializable saved inputs of a retirement scenario (persisted as-is in the scenario row). */
export interface RetirementScenarioInputs {
  /** null = seed from the live portfolio's current total value. */
  startingAmountUsd: number | null;
  monthlyContributionUsd: number;
  /** Annual step-up of the monthly contribution, percent. */
  contributionGrowthPct: number;
  currentAge: number;
  retirementAge: number;
  /** Only meaningful when withdrawalStrategy = "capital_depletion". */
  depletionAge: number;
  /** Desired retirement spending, today's USD per month. */
  monthlySpendingUsd: number;
  safeWithdrawalRatePct: number;
  withdrawalStrategy: WithdrawalStrategy;
  /** The user's own growth assumption — drives Plan and Coast FIRE. */
  primaryExpectedReturn: ExpectedReturnTriple;
  usdInflationPct: number;
  tryInflationPct: number;
  tryDepreciationPct: number;
  /** Options the Compare view runs the plan through. */
  options: ComparisonOption[];
}

export interface ProjectionMonth {
  /** 0 = the first month from now. */
  monthIndex: number;
  phase: "accumulation" | "retirement";
  /** Contribution added this month (0 in retirement). */
  contributionUsd: BigNumber;
  /** Withdrawal taken this month (0 in accumulation). */
  withdrawalUsd: BigNumber;
  /** End-of-month portfolio value. */
  valueUsd: BigNumber;
}

/** Output of the single projection core (GLOSSARY: projection formula). */
export interface Projection {
  months: ProjectionMonth[];
  finalValueUsd: BigNumber;
  totalContributionsUsd: BigNumber;
}

/**
 * Option-specific extra contribution stream (e.g. the BES state contribution),
 * returned in USD for the given month. Implemented by tax/option modules;
 * the projection core only sums it in.
 */
export type ContributionEnhancer = (
  monthIndex: number,
  baseContributionUsd: BigNumber,
) => BigNumber;

export interface TaxRuleInput {
  projection: Projection;
  inputs: RetirementScenarioInputs;
  option: ComparisonOption;
}

/** GLOSSARY: retirement tax estimate — always an estimate under current law. */
export interface RetirementTaxEstimate {
  taxUsd: BigNumber;
  /** Which rate/condition applied, for display (e.g. exit-withholding tier). */
  note: string;
}

export type TaxRule = (input: TaxRuleInput) => RetirementTaxEstimate;

/** One band's outcome for one comparison option. */
export interface ComparisonBandResult {
  grossFinalValueUsd: BigNumber;
  taxEstimate: RetirementTaxEstimate;
  afterTaxFinalValueUsd: BigNumber;
  /** After-tax final value in today's purchasing power (USD inflation). */
  afterTaxRealFinalValueUsd: BigNumber;
}

/**
 * The Compare view's unit of output: one contribution plan run through one
 * option, all three bands. Produced by runComparison (src/lib/retirement/compare.ts).
 */
export interface ComparisonResult {
  option: ComparisonOption;
  projections: Record<ProjectionBand, Projection>;
  results: Record<ProjectionBand, ComparisonBandResult>;
}
