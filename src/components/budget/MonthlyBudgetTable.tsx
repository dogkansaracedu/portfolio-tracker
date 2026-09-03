import { useMemo, useState } from "react"
import { Trash2 } from "lucide-react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { DISPLAY_LOCALE } from "@/lib/constants/app"
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
import { formatMoney, formatSignedPercent } from "@/lib/prices"
import { CURRENCY_SYMBOLS, type FiatCurrency } from "@/lib/constants/currencies"
import type { MonthlyBudgetRow } from "@/lib/budget"
import type { CashflowEntry } from "@/types/database"
import {
  BUDGET_SERIES_LABELS,
  DEFAULT_INCOME_LABEL,
  DEFAULT_VISIBLE_MONTHS,
  INCOME_EDIT_COPY,
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
 * → updates its amount in that entry's own currency; several → opens the
 * entry-list dialog (the cell's figure is their total, which is nobody's
 * amount to type over). Clearing the input deletes the single entry so the
 * month falls back to the salary default.
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
      : formatMoney(value.toNumber(), currency, obfuscated)

  const startEditing = (row: MonthlyBudgetRow) => {
    const monthEntries = entriesByMonth.get(row.month) ?? []
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
        {/* Below `sm` the five columns squeeze Spent — the column the page
            exists for — off the side, so Invested drops out of the row and
            rides under Income as a caption instead. */}
        {/* `Table` brings its own overflow container. Below `sm` the cells lose
            their side padding and the heads may wrap, which is what lets the
            four columns fit 326px without a sideways scroll. */}
        <Table className="max-sm:text-xs max-sm:[&_td]:px-1 max-sm:[&_th]:px-1 max-sm:[&_td]:whitespace-normal max-sm:[&_th]:whitespace-normal">
            <TableHeader>
              <TableRow>
                <TableHead>Month</TableHead>
                <TableHead className="text-right">Income</TableHead>
                <TableHead className="hidden text-right sm:table-cell">
                  {BUDGET_SERIES_LABELS.invested}
                </TableHead>
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
                    <TableCell className="whitespace-nowrap max-sm:whitespace-normal">
                      {monthLabel(row.month)}
                      {row.month === currentMonth && (
                        <Badge
                          variant="outline"
                          className="ml-2 max-sm:mt-1 max-sm:ml-0 max-sm:block max-sm:w-fit"
                        >
                          {IN_PROGRESS_LABEL}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {editing && monthEntries.length > 1 ? (
                        <>
                          {money(legFor(row, "income", currency))}
                          <MultiEntryDialog
                            monthLabel={monthLabel(row.month)}
                            entries={monthEntries}
                            onClose={() => setEditingMonth(null)}
                            onUpdate={updateEntry}
                            onRemove={removeEntry}
                          />
                        </>
                      ) : editing ? (
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
                          className="cursor-pointer underline-offset-4 hover:underline"
                          title={
                            monthEntries.length > 1
                              ? INCOME_EDIT_COPY.multiHint
                              : INCOME_EDIT_COPY.singleHint
                          }
                          onClick={() => startEditing(row)}
                        >
                          {money(legFor(row, "income", currency))}
                          {row.incomeSource === "default" && (
                            <span className="ml-1 text-xs text-muted-foreground max-sm:ml-0 max-sm:block">
                              ({DEFAULT_INCOME_LABEL})
                            </span>
                          )}
                        </button>
                      )}
                      <span className="block text-[0.6875rem] text-muted-foreground sm:hidden">
                        {BUDGET_SERIES_LABELS.invested}{" "}
                        {money(legFor(row, "invested", currency))}
                      </span>
                    </TableCell>
                    <TableCell className="hidden text-right sm:table-cell">
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

// ─── Multi-entry income editor ──────────────────────────────────────

/**
 * A month with several income entries: the cell shows their TOTAL, which is
 * nobody's amount — so it opens this list instead of a typed-over cell. One row
 * per entry (its own date and currency), each editable or deletable on the
 * spot. Removing the last one falls the month back to the salary default.
 *
 * A dialog, not a panel inside the cell: the months table scrolls sideways on a
 * phone, and a fixed-width panel wedged into a cell put its own controls off
 * screen. The dialog is a full-height sheet there and a card on the desktop.
 */
function MultiEntryDialog({
  monthLabel,
  entries,
  onClose,
  onUpdate,
  onRemove,
}: {
  monthLabel: string
  entries: CashflowEntry[]
  onClose: () => void
  onUpdate: (id: string, patch: { amount: number }) => Promise<unknown>
  onRemove: (id: string) => Promise<unknown>
}) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {INCOME_EDIT_COPY.listTitle} · {monthLabel}
          </DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-2 py-2 text-left">
          {entries.map((entry) => (
            <EntryRow
              key={entry.id}
              entry={entry}
              onUpdate={onUpdate}
              onRemove={onRemove}
            />
          ))}
          <p className="text-xs text-muted-foreground">
            {INCOME_EDIT_COPY.defaultNote}
          </p>
        </DialogBody>
        <DialogFooter>
          <Button onClick={onClose}>{INCOME_EDIT_COPY.done}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function EntryRow({
  entry,
  onUpdate,
  onRemove,
}: {
  entry: CashflowEntry
  onUpdate: (id: string, patch: { amount: number }) => Promise<unknown>
  onRemove: (id: string) => Promise<unknown>
}) {
  const [value, setValue] = useState(String(entry.amount))
  const [confirmOpen, setConfirmOpen] = useState(false)

  const commit = async () => {
    const amount = Number(value.trim())
    if (!Number.isFinite(amount) || amount <= 0 || amount === entry.amount) return
    await onUpdate(entry.id, { amount })
  }

  return (
    <div className="flex items-center gap-2">
      <span className="w-14 shrink-0 text-xs text-muted-foreground">
        {formatEntryDay(entry.date)}
      </span>
      <span className="shrink-0 text-xs text-muted-foreground">
        {CURRENCY_SYMBOLS[entry.currency as FiatCurrency] ?? entry.currency}
      </span>
      <Input
        type="number"
        aria-label={INCOME_EDIT_COPY.amountLabel}
        className="h-8 min-w-0 flex-1 text-right"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(e) => {
          if (e.key === "Enter") void commit()
        }}
      />
      {/* Deleting real income history asks first — the app's one delete
          convention, and the trash sits a thumb's width from the amount. */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={INCOME_EDIT_COPY.deleteLabel}
          onClick={() => setConfirmOpen(true)}
        >
          <Trash2 className="size-3.5" />
        </Button>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{INCOME_EDIT_COPY.deleteTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {INCOME_EDIT_COPY.deleteBody(
                formatEntryDay(entry.date),
                `${CURRENCY_SYMBOLS[entry.currency as FiatCurrency] ?? entry.currency}${entry.amount}`,
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                void onRemove(entry.id)
                setConfirmOpen(false)
              }}
            >
              {INCOME_EDIT_COPY.deleteConfirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

/** "05 Aug" — an entry's own day inside its month. */
function formatEntryDay(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString(DISPLAY_LOCALE, {
    day: "2-digit",
    month: "short",
  })
}
