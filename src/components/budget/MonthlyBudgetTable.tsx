import { useMemo, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useBudgetContext } from "@/contexts/BudgetContext"
import { useDisplayCurrency } from "@/contexts/DisplayContext"
import { formatCurrency, formatSignedPercent, obfuscate } from "@/lib/prices"
import { CURRENCY_SYMBOLS, type FiatCurrency } from "@/lib/constants/currencies"
import type { MonthlyBudgetRow } from "@/lib/budget"
import type { CashflowEntry } from "@/types/database"
import {
  DEFAULT_INCOME_LABEL,
  DEFAULT_VISIBLE_MONTHS,
  INCOME_ENTRY_DEFAULT_CURRENCY,
  IN_PROGRESS_LABEL,
  NO_DATA_PLACEHOLDER,
} from "@/components/budget/constants"
import { legFor, monthLabel } from "@/components/budget/display"

interface Props {
  /** Newest month first. */
  rows: MonthlyBudgetRow[]
  currentMonth: string
  currency: FiatCurrency
}

/**
 * The monthly table: month · income · invested · spent · savings rate, in the
 * app-wide display currency. The income cell edits the month's underlying
 * entry: no entry → creates one dated the 1st (TRY, salary-like); exactly one
 * → updates its amount in that entry's own currency; several → read-only here
 * (too ambiguous for an inline cell). Clearing the input deletes the single
 * entry so the month falls back to the salary default.
 */
export function MonthlyBudgetTable({ rows, currentMonth, currency }: Props) {
  const { entries, createEntry, updateEntry, removeEntry } = useBudgetContext()
  const { obfuscated } = useDisplayCurrency()
  const [showAll, setShowAll] = useState(false)
  const [editingMonth, setEditingMonth] = useState<string | null>(null)
  const [draft, setDraft] = useState("")

  const entriesByMonth = useMemo(() => {
    const map = new Map<string, CashflowEntry[]>()
    for (const e of entries) {
      const month = e.date.slice(0, 7)
      const list = map.get(month)
      if (list) list.push(e)
      else map.set(month, [e])
    }
    return map
  }, [entries])

  const visible = showAll ? rows : rows.slice(0, DEFAULT_VISIBLE_MONTHS)

  const money = (value: ReturnType<typeof legFor>) =>
    value === null
      ? NO_DATA_PLACEHOLDER
      : obfuscate(formatCurrency(value.toNumber(), currency), obfuscated)

  const startEditing = (row: MonthlyBudgetRow) => {
    const monthEntries = entriesByMonth.get(row.month) ?? []
    if (monthEntries.length > 1) return
    setEditingMonth(row.month)
    setDraft(monthEntries.length === 1 ? String(monthEntries[0].amount) : "")
  }

  const commit = async (month: string) => {
    setEditingMonth(null)
    const monthEntries = entriesByMonth.get(month) ?? []
    const trimmed = draft.trim()
    const amount = Number(trimmed)

    if (monthEntries.length === 1) {
      const entry = monthEntries[0]
      if (trimmed === "") {
        await removeEntry(entry.id)
      } else if (Number.isFinite(amount) && amount > 0 && amount !== entry.amount) {
        await updateEntry(entry.id, { amount })
      }
      return
    }
    if (trimmed !== "" && Number.isFinite(amount) && amount > 0) {
      await createEntry({
        date: `${month}-01`,
        type: "income",
        amount,
        currency: INCOME_ENTRY_DEFAULT_CURRENCY,
        note: null,
      })
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Months</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Month</TableHead>
                <TableHead className="text-right">Income</TableHead>
                <TableHead className="text-right">Invested</TableHead>
                <TableHead className="text-right">Spent</TableHead>
                <TableHead className="text-right">Savings rate</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((row) => {
                const monthEntries = entriesByMonth.get(row.month) ?? []
                const editing = editingMonth === row.month
                const entryCurrency =
                  monthEntries[0]?.currency ?? INCOME_ENTRY_DEFAULT_CURRENCY
                return (
                  <TableRow key={row.month}>
                    <TableCell className="whitespace-nowrap">
                      {monthLabel(row.month)}
                      {row.month === currentMonth && (
                        <Badge variant="outline" className="ml-2">
                          {IN_PROGRESS_LABEL}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {editing ? (
                        <span className="inline-flex items-center justify-end gap-1">
                          <span className="text-xs text-muted-foreground">
                            {CURRENCY_SYMBOLS[entryCurrency as FiatCurrency] ??
                              entryCurrency}
                          </span>
                          <Input
                            autoFocus
                            type="number"
                            className="h-7 w-32 text-right"
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                            onBlur={() => void commit(row.month)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") void commit(row.month)
                              if (e.key === "Escape") setEditingMonth(null)
                            }}
                          />
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="cursor-pointer underline-offset-4 hover:underline disabled:cursor-default disabled:no-underline"
                          disabled={monthEntries.length > 1}
                          title={
                            monthEntries.length > 1
                              ? "Several income entries this month — edit them individually"
                              : "Click to edit this month's income"
                          }
                          onClick={() => startEditing(row)}
                        >
                          {money(legFor(row, "income", currency))}
                          {row.incomeSource === "default" && (
                            <span className="ml-1 text-xs text-muted-foreground">
                              ({DEFAULT_INCOME_LABEL})
                            </span>
                          )}
                        </button>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {money(legFor(row, "invested", currency))}
                    </TableCell>
                    <TableCell className="text-right">
                      {money(legFor(row, "spent", currency))}
                    </TableCell>
                    <TableCell className="text-right">
                      {row.savingsRatePct === null
                        ? NO_DATA_PLACEHOLDER
                        : formatSignedPercent(row.savingsRatePct.toNumber())}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
        {rows.length > DEFAULT_VISIBLE_MONTHS && (
          <Button
            variant="ghost"
            size="sm"
            className="mt-2"
            onClick={() => setShowAll((v) => !v)}
          >
            {showAll
              ? "Show recent months"
              : `Show all ${rows.length} months`}
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
