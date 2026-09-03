import type { Theme } from "@/contexts/ThemeContext"

/** The three budget series, in fixed display order (chart bars and legend). */
export const BUDGET_SERIES = {
  income: "income",
  invested: "invested",
  spent: "spent",
} as const

export type BudgetSeries = (typeof BUDGET_SERIES)[keyof typeof BUDGET_SERIES]

export const BUDGET_SERIES_LABELS: Record<BudgetSeries, string> = {
  income: "Income",
  invested: "Invested",
  spent: "Spent",
}

/**
 * Categorical palette for the trend chart, validated per theme (lightness
 * band, chroma, CVD separation, contrast — dataviz six-checks). Dark mode is
 * its own steps, not a flip: the sub-3:1 light-mode contrast WARN is relieved
 * by the monthly table right above the chart.
 */
export const BUDGET_CHART_COLORS: Record<Theme, Record<BudgetSeries, string>> = {
  light: { income: "#3b82f6", invested: "#14b8a6", spent: "#f59e0b" },
  dark: { income: "#3b82f6", invested: "#0d9488", spent: "#d97706" },
}

/** Rendered wherever a derived figure is unknown — never a fake zero. */
export const NO_DATA_PLACEHOLDER = "—"

export const IN_PROGRESS_LABEL = "in progress"
export const DEFAULT_INCOME_LABEL = "default"

/** How many months the table shows before "Show all". */
export const DEFAULT_VISIBLE_MONTHS = 12

/** Copy for the income cell's editors. A month with several entries opens the
 *  list editor instead of a single amount input — the cell's total is not any
 *  one entry's amount, so it cannot be typed over. */
export const INCOME_EDIT_COPY = {
  singleHint: "Click to edit this month's income",
  multiHint: "Several income entries this month — click to edit them",
  listTitle: "Income entries",
  amountLabel: "Amount",
  deleteLabel: "Delete entry",
  defaultNote: "Falls back to the salary default when every entry is removed.",
} as const

/** Inline-created income entries are salary-like: TRY unless edited elsewhere. */
export const INCOME_ENTRY_DEFAULT_CURRENCY = "TRY" as const
