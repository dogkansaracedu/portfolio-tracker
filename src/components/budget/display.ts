import type { FiatCurrency } from "@/lib/constants/currencies"
import type { MonthlyBudgetRow } from "@/lib/budget"
import type BigNumber from "bignumber.js"

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
]

/** "2026-08" → "Aug 2026" (no Date parsing — the string is already a month). */
export function monthLabel(month: string): string {
  const [y, m] = month.split("-")
  return `${MONTH_LABELS[Number(m) - 1]} ${y}`
}

/** The row's leg for the app-wide display currency; null legs stay null. */
export function legFor(
  row: MonthlyBudgetRow,
  field: "income" | "invested" | "spent",
  currency: FiatCurrency,
): BigNumber | null {
  if (field === "income") return currency === "TRY" ? row.incomeTry : row.incomeUsd
  if (field === "invested")
    return currency === "TRY" ? row.investedTry : row.investedUsd
  return currency === "TRY" ? row.spentTry : row.spentUsd
}
