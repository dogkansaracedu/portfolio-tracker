import { useState } from "react"
import { Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useBudgetContext } from "@/contexts/BudgetContext"
import { useReportedWrite } from "@/hooks/useReportedWrite"
import { useDisplayCurrency } from "@/contexts/DisplayContext"
import { formatMoney } from "@/lib/prices"
import {
  SUPPORTED_FIAT_CURRENCIES,
  type FiatCurrency,
} from "@/lib/constants/currencies"
import {
  BUDGET_WRITE_FAILED,
  INCOME_ENTRY_DEFAULT_CURRENCY,
} from "@/components/budget/constants"
import { monthLabel } from "@/components/budget/display"

/**
 * The salary schedule: default monthly income rows with effective-from
 * months. The latest row at or before a month fills that month's income when
 * it has no explicit entry. Raises are appended as new rows (history stays).
 *
 * A row's amount is money in its OWN currency (what was typed, never
 * re-denominated), and it masks under the privacy toggle like every other
 * amount on the page.
 */
export function SalaryScheduleCard() {
  const { incomeDefaults, createDefault, removeDefault } = useBudgetContext()
  const { obfuscated } = useDisplayCurrency()
  const { error, reported } = useReportedWrite(BUDGET_WRITE_FAILED)
  const [month, setMonth] = useState("")
  const [amount, setAmount] = useState("")
  const [currency, setCurrency] = useState<FiatCurrency>(
    INCOME_ENTRY_DEFAULT_CURRENCY,
  )
  const [saving, setSaving] = useState(false)

  const parsed = Number(amount)
  const canAdd =
    month !== "" && amount.trim() !== "" && Number.isFinite(parsed) && parsed > 0

  const add = async () => {
    if (!canAdd || saving) return
    setSaving(true)
    try {
      // The fields clear only once the row lands: they used to clear inside a
      // `try` whose rejection nobody caught, so a refused append looked like
      // one that had been accepted and then vanished.
      const ok = await reported(
        createDefault({
          amount: parsed,
          currency,
          effective_from: `${month}-01`,
        }),
      )
      if (!ok) return
      setMonth("")
      setAmount("")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Salary schedule</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {incomeDefaults.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No default income yet — add your salary so months fill in without
            typing.
          </p>
        ) : (
          <ul className="space-y-1">
            {incomeDefaults.map((d) => (
              <li
                key={d.id}
                className="flex items-center justify-between gap-2 text-sm"
              >
                <span>
                  from <span className="font-medium">{monthLabel(d.effective_from.slice(0, 7))}</span>
                  {": "}
                  {formatMoney(d.amount, d.currency as FiatCurrency, obfuscated)} / month
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  aria-label="Delete this salary row"
                  onClick={() => void reported(removeDefault(d.id))}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="month"
            className="h-8 w-40"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            aria-label="Effective from month"
          />
          <Input
            type="number"
            className="h-8 w-32"
            placeholder="Amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            aria-label="Monthly income amount"
          />
          <Select
            value={currency}
            onValueChange={(v) => setCurrency(v as FiatCurrency)}
          >
            <SelectTrigger className="h-8 w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SUPPORTED_FIAT_CURRENCIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" disabled={!canAdd || saving} onClick={() => void add()}>
            Add
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
