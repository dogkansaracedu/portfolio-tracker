import type { ProjectionBand, WithdrawalStrategy } from "@/lib/retirement"

/**
 * Every string, id and colour the Retirement views render. Labels are the
 * GLOSSARY term verbatim (term-singularity rule, docs/components/GLOSSARY.md);
 * the hints are the glossary's own one-line explainers, surfaced as tooltips.
 */

export const RETIREMENT_TAB = {
  plan: "plan",
  compare: "compare",
  coastFire: "coast-fire",
} as const

export type RetirementTab = (typeof RETIREMENT_TAB)[keyof typeof RETIREMENT_TAB]

export const RETIREMENT_TAB_LABELS: Record<RetirementTab, string> = {
  [RETIREMENT_TAB.plan]: "Plan",
  [RETIREMENT_TAB.compare]: "Compare",
  [RETIREMENT_TAB.coastFire]: "Coast FIRE",
}

export const VALUE_VIEW = { nominal: "nominal", real: "real" } as const

export type ValueView = (typeof VALUE_VIEW)[keyof typeof VALUE_VIEW]

export const VALUE_VIEW_LABELS: Record<ValueView, string> = {
  [VALUE_VIEW.nominal]: "Nominal",
  [VALUE_VIEW.real]: "Real",
}

/** The glossary's label for the real view — never a synonym. */
export const TODAYS_PURCHASING_POWER = "today's purchasing power"

export const PLAN_MODE = {
  finalValue: "final-value",
  requiredContribution: "required-contribution",
  timeToTarget: "time-to-target",
} as const

export type PlanMode = (typeof PLAN_MODE)[keyof typeof PLAN_MODE]

export const PLAN_MODE_LABELS: Record<PlanMode, string> = {
  [PLAN_MODE.finalValue]: "Final value",
  [PLAN_MODE.requiredContribution]: "Required contribution",
  [PLAN_MODE.timeToTarget]: "Time to target",
}

export const BAND_LABELS: Record<ProjectionBand, string> = {
  pessimistic: "Pessimistic",
  base: "Base",
  optimistic: "Optimistic",
}

export const WITHDRAWAL_STRATEGY_LABELS: Record<WithdrawalStrategy, string> = {
  capital_preservation: "Capital preservation",
  capital_depletion: "Capital depletion",
}

/** The "—" convention: a solve with no answer never renders a fabricated number. */
export const EMPTY_FIGURE = "—"
export const NOT_REACHABLE = "Not reachable under these assumptions"

export const TAX_ESTIMATE_CAPTION =
  "Tax figures are estimates under current law, not advice."
export const INDEXATION_EFFECT_CAPTION =
  "Counter-intuitive but correct: when TRY inflation outpaces TRY depreciation, cost-basis indexation can shrink the taxable TRY gain to zero — while inflation-matching depreciation exposes the full real gain to tax."
export const BASE_CASE_CAPTION =
  "Single-line figures use the base case expected return."
export const BAND_CAPTION =
  "Line = base case; shaded = pessimistic to optimistic."

/** One-line glossary explainers, surfaced inline next to each advanced term. */
export const GLOSSARY_HINTS = {
  projection:
    "A deterministic month-by-month compound-growth forecast under stated assumptions — a projection, never a prediction.",
  expectedReturn:
    "An assumed annual compound growth rate, compounded monthly as (1+r)^(1/12) − 1.",
  expectedReturnBand:
    "Every projection runs three times — pessimistic / base / optimistic expected returns — and renders as a base line inside a shaded band.",
  nominalAndReal:
    "Nominal = amounts as they will read at that future date. Real = deflated to today's purchasing power by the USD-inflation assumption.",
  safeWithdrawalRate:
    "The percentage of the retirement-date portfolio withdrawn in the first year of retirement (inflation-adjusted thereafter) under capital preservation.",
  withdrawalStrategy:
    "Capital preservation withdraws at the safe withdrawal rate and keeps the principal; capital depletion spends the portfolio to zero by the depletion age.",
  retirementTarget:
    "The portfolio value required at retirement age, in nominal USD of that date (spending entered in today's USD is inflated to retirement first).",
  coastFireNumber:
    "The portfolio value needed today such that expected growth alone — with no further contributions — reaches the retirement target by retirement age.",
  coastFireGap:
    "Coast FIRE number − current portfolio value. Positive = still short; zero or negative = coasting.",
  coastDate:
    "The first month the projected portfolio (with planned contributions) meets the then-current Coast FIRE number.",
  sensitivityInsight:
    "How far one input change moves one output — each a solver run over the same projection core the charts draw.",
  retirementTaxEstimate:
    "Estimated Turkish tax due at exit, computed from this scenario's assumptions — an estimate under current law.",
  startingAmount:
    "Where the projection starts. Defaults to the live portfolio's current total value.",
  contributionGrowth:
    "Annual step-up of the monthly contribution, applied once every twelve months.",
  usdInflation:
    "Deflates nominal figures to today's purchasing power and inflates retirement spending to the retirement date.",
  tryAssumptions:
    "TRY-linked options convert their TRY return to USD growth through the depreciation assumption; TRY inflation drives their taxable gain.",
} as const

/**
 * Categorical series colours for the Compare view, assigned in fixed order and
 * never cycled (dataviz: colour follows the entity, not its rank). Light and
 * dark are the same hues re-stepped for each surface.
 */
export const OPTION_SERIES_COLORS = {
  light: ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300"],
  dark: ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300"],
} as const

/** The Coast FIRE curve's own hue — slot 2, so it never collides with var(--primary). */
export const COAST_CURVE_COLOR = { light: "#eb6834", dark: "#d95926" } as const

/** Monthly projections run to 700+ points; charts sample down to this many. */
export const CHART_MAX_POINTS = 240

export const DEFAULT_SCENARIO_NAME = "My plan"
