import type {
  ProjectionBand,
  ReturnCurrency,
  WithdrawalStrategy,
} from "@/lib/retirement/types"

/**
 * Shared literals of the retirement engine. Every union member of the type
 * contract has exactly one spelling, here — nothing downstream writes
 * `"capital_depletion"` as a bare string.
 */

export const MONTHS_PER_YEAR = 12

export const WITHDRAWAL_STRATEGY = {
  preservation: "capital_preservation",
  depletion: "capital_depletion",
} as const satisfies Record<string, WithdrawalStrategy>

/** The currency an option's expected return is quoted in (GLOSSARY: expected return). */
export const RETURN_CURRENCY = {
  usd: "USD",
  try: "TRY",
} as const satisfies Record<string, ReturnCurrency>

export const PROJECTION_PHASE = {
  accumulation: "accumulation",
  retirement: "retirement",
} as const

export const PROJECTION_BAND = {
  pessimistic: "pessimistic",
  base: "base",
  optimistic: "optimistic",
} as const satisfies Record<string, ProjectionBand>

/** Single-line outputs (tables, insights, solvers) use the base case. */
export const DEFAULT_PROJECTION_BAND: ProjectionBand = PROJECTION_BAND.base

export const SENSITIVITY_KIND = {
  contributionStep: "contribution_step",
  retirementAgeShift: "retirement_age_shift",
} as const

export const SENSITIVITY_INPUT = {
  monthlyContributionUsd: "monthlyContributionUsd",
  retirementAge: "retirementAge",
} as const

export const SENSITIVITY_UNIT = {
  usdPerMonth: "usd_per_month",
  years: "years",
} as const

export const SENSITIVITY_METRIC = {
  monthsToTarget: "monthsToTarget",
  requiredMonthlyContributionUsd: "requiredMonthlyContributionUsd",
} as const
