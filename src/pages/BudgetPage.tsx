import { useMemo } from "react"
import { PageHeading } from "@/components/common/PageHeading"
import { Skeleton } from "@/components/ui/skeleton"
import { useBudget } from "@/hooks/useBudget"
import { useDisplayCurrency } from "@/contexts/DisplayContext"
import { BudgetTrendChart } from "@/components/budget/BudgetTrendChart"
import { MonthlyBudgetTable } from "@/components/budget/MonthlyBudgetTable"
import { SalaryScheduleCard } from "@/components/budget/SalaryScheduleCard"
import { DEFAULT_VISIBLE_MONTHS } from "@/components/budget/constants"

/**
 * Component 14 — Budgeting. Monthly earned / invested / spent, where only
 * income is entered (inline in the table, or via the salary schedule) and the
 * rest is derived from portfolio transactions. Follows the app-wide display
 * currency; spending isn't a loss, so no gain/loss coloring here.
 */
export default function BudgetPage() {
  const { rows, currentMonth, loading } = useBudget()
  const { currency } = useDisplayCurrency()

  // The chart mirrors the table's default window, oldest month on the left.
  const chartRows = useMemo(
    () => rows.slice(0, DEFAULT_VISIBLE_MONTHS).slice().reverse(),
    [rows],
  )

  return (
    <div className="space-y-6">
      <PageHeading
        title="Budget"
        subtitle="What each month earned, what went into the portfolio, and what the difference says about your spending."
      />

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-80 w-full" />
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nothing to show yet — record a transaction or add your salary below.
        </p>
      ) : (
        <>
          <BudgetTrendChart rows={chartRows} currency={currency} />
          <MonthlyBudgetTable
            rows={rows}
            currentMonth={currentMonth}
            currency={currency}
          />
        </>
      )}

      <SalaryScheduleCard />
    </div>
  )
}
