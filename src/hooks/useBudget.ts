import { useMemo } from "react"
import { homeDayIso } from "@/lib/config"
import { computeMonthlyBudget, type MonthlyBudgetRow } from "@/lib/budget"
import { useBudgetContext } from "@/contexts/BudgetContext"
import { useTransactionData } from "@/contexts/TransactionDataContext"

export interface BudgetView {
  /** Most recent month first (the table's order). */
  rows: MonthlyBudgetRow[]
  /** "YYYY-MM" of today, per the home timezone — the in-progress row. */
  currentMonth: string
  loading: boolean
}

/**
 * Composes the budgeting rows (BudgetContext) with the portfolio transactions
 * and rates (TransactionDataContext) into the derived monthly view. The window
 * runs from the earliest budgeting- or portfolio-data month through the
 * current month; months before any data exist are not listed (Component 14).
 */
export function useBudget(): BudgetView {
  const { entries, incomeDefaults, loading: budgetLoading } = useBudgetContext()
  const { transactions, rates, loading: txLoading } = useTransactionData()

  const currentMonth = homeDayIso().slice(0, 7)

  const rows = useMemo(() => {
    // Transactions arrive grouped by (asset, platform), not globally
    // date-sorted, so the earliest month is a scan, not `[0]`. Entries and
    // defaults ARE date-ascending (their fetch order), so `[0]` suffices.
    let firstMonth: string | null = null
    const consider = (d: string | undefined) => {
      if (!d) return
      const month = d.slice(0, 7)
      if (firstMonth === null || month < firstMonth) firstMonth = month
    }
    for (const tx of transactions) consider(tx.date)
    consider(entries[0]?.date)
    consider(incomeDefaults[0]?.effective_from)
    if (firstMonth === null) return []

    const fromMonth: string = firstMonth
    return computeMonthlyBudget({
      entries,
      incomeDefaults,
      transactions,
      rates,
      fromMonth,
      toMonth: currentMonth,
    }).reverse()
  }, [entries, incomeDefaults, transactions, rates, currentMonth])

  return { rows, currentMonth, loading: budgetLoading || txLoading }
}
