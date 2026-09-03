import type {
  ProjectionBand,
  ProjectionPhase,
  WithdrawalStrategy,
} from "@/lib/retirement"

/**
 * Every string, id and colour the Retirement views render. Labels are the
 * GLOSSARY term verbatim (term-singularity rule, docs/components/GLOSSARY.md);
 * the hints are the glossary's own one-line explainers, surfaced as tooltips.
 */

export const RETIREMENT_TAB = {
  plan: "plan",
  compare: "compare",
} as const

export type RetirementTab = (typeof RETIREMENT_TAB)[keyof typeof RETIREMENT_TAB]

export const RETIREMENT_TAB_LABELS: Record<RetirementTab, string> = {
  [RETIREMENT_TAB.plan]: "Plan",
  [RETIREMENT_TAB.compare]: "Compare",
}

export const VALUE_VIEW = { nominal: "nominal", real: "real" } as const

export type ValueView = (typeof VALUE_VIEW)[keyof typeof VALUE_VIEW]

export const VALUE_VIEW_LABELS: Record<ValueView, string> = {
  [VALUE_VIEW.nominal]: "Nominal",
  [VALUE_VIEW.real]: "Real",
}

/** The glossary's label for the real view — never a synonym. */
export const TODAYS_PURCHASING_POWER = "today's purchasing power"

/** One spelling of an age wherever it is read as a label ("Age 52"). */
export const AGE_LABEL = "Age"

/**
 * The Plan tab is four questions, and each mode's label IS the question — the
 * headline under it is the answer, and (where the retirement age is an input
 * rather than the answer) the verdict banner says yes or no in words.
 */
export const PLAN_MODE = {
  earliestRetirement: "earliest-retirement",
  coast: "coast",
  requiredContribution: "required-contribution",
  finalValue: "final-value",
} as const

export type PlanMode = (typeof PLAN_MODE)[keyof typeof PLAN_MODE]

export const PLAN_MODE_LABELS: Record<PlanMode, string> = {
  [PLAN_MODE.earliestRetirement]: "When can I retire?",
  [PLAN_MODE.coast]: "When can I stop contributing?",
  [PLAN_MODE.requiredContribution]: "How much should I contribute?",
  [PLAN_MODE.finalValue]: "What will I have?",
}

/** The label above each answer. The final-value one names the retirement age. */
export const PLAN_HEADLINE_LABELS = {
  [PLAN_MODE.earliestRetirement]: "Earliest retirement age",
  [PLAN_MODE.coast]: "You can stop contributing at",
  [PLAN_MODE.requiredContribution]: "Required monthly contribution",
  [PLAN_MODE.finalValue]: (age: string) => `Projected value at age ${age}`,
} as const

/** The verdict banner's fixed halves; the figures around them are interpolated. */
export const VERDICT_LABELS = {
  works: "This plan works",
  fallsShort: "This plan falls short",
  /** Introduces the escape routes under a falling-short verdict. */
  routes: "Any one of these closes it:",
  alreadyCoasting: "You are coasting",
} as const

/** The two coast markers a chart can carry, labelled with their own ages. */
export const COAST_LINE_LABELS = {
  planned: (age: string) => `Planned coast: ${age}`,
  earliest: (age: string) => `Could coast at: ${age}`,
} as const

export const EARLIEST_RETIREMENT_LINE_LABEL = (age: string) =>
  `Earliest retirement: ${age}`

export const RETIREMENT_AGE_LINE_LABEL = (age: string) => `Retirement age ${age}`

/** The target line carries its own value — an unlabelled dashed rule at an
 *  arbitrary height says nothing about how far away the target is. */
export const RETIREMENT_TARGET_LINE_LABEL = (value: string) =>
  `Retirement target ${value}`

/** A projection spent to zero: said in the cell, the tooltip and on the chart
 *  as a marker, because a floored 0 alone reads as "no data". */
export const DEPLETED_AT_LABEL = (age: string) => `Depleted at age ${age}`

export const COAST_CHART_TITLE = "Coast FIRE number vs. projected portfolio"
export const COAST_DATE_MARKER_LABEL = "Coast date"

/** The Coast FIRE stat strip inside "when can I stop contributing?". */
export const COAST_STRIP_LABELS = {
  coastFireNumber: "Coast FIRE number",
  coastFireGap: "Coast FIRE gap",
  retirementTarget: "Retirement target",
  coasting: "Coasting",
} as const

/** The suggested-contribution table under "how much should I contribute?". */
export const SUGGESTIONS_TITLE = "What other contributions would buy"
export const SUGGESTIONS_CAPTION =
  "Round monthly amounts around the required figure, each solved the same way as the answer above."
export const SUGGESTION_COLUMN_LABELS = {
  contribution: "Monthly contribution",
  earliestRetirement: "Earliest retirement",
  coastAge: "Could coast at",
  reachesTarget: (age: string) => `Reaches target at ${age}`,
} as const

export const SUGGESTION_REACHES_LABELS = { yes: "Yes", no: "No" } as const

/**
 * The suggested amounts: fractions of the required contribution, rounded to a
 * round number so the row reads like a decision, not like a solver output.
 */
export const SUGGESTION_MULTIPLIERS = [0.75, 1, 1.25, 1.5] as const
export const SUGGESTION_ROUNDING_USD = 250
export const SUGGESTION_SMALL_ROUNDING_USD = 50
/** Below this the $250 step would swallow the differences between rows. */
export const SUGGESTION_SMALL_THRESHOLD_USD = 1000

export const BAND_LABELS: Record<ProjectionBand, string> = {
  pessimistic: "Pessimistic",
  base: "Base",
  optimistic: "Optimistic",
}

export const PROJECTION_PHASE_LABELS: Record<ProjectionPhase, string> = {
  contributing: "Contributing",
  coasting: "Coasting",
  retirement: "Retirement",
}

/** The age contributions stop — the plan coasts from there to retirement. */
export const CONTRIBUTION_END_AGE_LABEL = "Contribution end age"

/** The milestones table under the Plan chart. */
export const MILESTONES_TITLE = "How much will I have at each age"
export const MILESTONES_CAPTION =
  "Projected portfolio value at the ages that frame the plan, then every five years to the chart horizon."
export const MILESTONE_COLUMN_LABELS = {
  age: "Age",
  phase: "Phase",
} as const

export const WITHDRAWAL_STRATEGY_LABELS: Record<WithdrawalStrategy, string> = {
  capital_preservation: "Capital preservation",
  capital_depletion: "Capital depletion",
}

/**
 * The depletion-age field means two things: the age a depleting plan is spent
 * to zero by, and — under preservation — how far past retirement the chart is
 * drawn. Label and hint follow the loaded strategy.
 */
export const DEPLETION_AGE_LABELS: Record<WithdrawalStrategy, string> = {
  capital_preservation: "Show until age",
  capital_depletion: "Depletion age",
}

export const DEPLETION_AGE_HINTS: Record<WithdrawalStrategy, string> = {
  capital_preservation:
    "How far past retirement the projection is drawn — a chart horizon only; it does not change the retirement target.",
  capital_depletion:
    "The age the portfolio is deliberately spent to zero by, which also sets the retirement target.",
}

/** An answer that has already happened — "you can stop contributing NOW". */
export const NOW_LABEL = "Now"

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
  contributionEndAge:
    "When monthly contributions stop. Growth alone carries the plan from here to retirement (coasting). Defaults to your retirement age.",
  usdInflation:
    "Deflates nominal figures to today's purchasing power and inflates retirement spending to the retirement date.",
  tryAssumptions:
    "TRY-linked options convert their TRY return to USD growth through the depreciation assumption; TRY inflation drives their taxable gain.",
} as const

/**
 * The safe withdrawal rate only sets the target under capital preservation;
 * under capital depletion the target is the spending annuity to the depletion
 * age, so the field is inert and says so (mirror of DEPLETION_AGE_HINTS).
 */
export const SAFE_WITHDRAWAL_RATE_HINTS: Record<WithdrawalStrategy, string> = {
  capital_preservation: GLOSSARY_HINTS.safeWithdrawalRate,
  capital_depletion:
    "Not used under capital depletion — the target comes from spending until the depletion age.",
}

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

/** The scenario picker: prompt when nothing is loaded, and the default marker. */
export const SCENARIO_PICKER_PLACEHOLDER = "Select a scenario"
export const DEFAULT_SCENARIO_SUFFIX = " (default)"

/**
 * The phone summary the collapsed scenario panel shows in place of its twelve
 * inputs — "$1,000/mo · retire at 60 · 4% SWR — Edit".
 */
export const SCENARIO_SUMMARY = {
  perMonthSuffix: "/mo",
  retireAt: "retire at",
  swrSuffix: "% SWR",
  separator: " · ",
  edit: "Edit",
} as const
