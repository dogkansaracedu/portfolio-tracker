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
import { formatCurrency } from "@/lib/prices"
import {
  SUPPORTED_FIAT_CURRENCIES,
  type FiatCurrency,
} from "@/lib/constants/currencies"
import { INCOME_ENTRY_DEFAULT_CURRENCY } from "@/components/budget/constants"
import { monthLabel } from "@/components/budget/display"

/**
 * The salary schedule: default monthly income rows with effective-from
 * months. The latest row at or before a month fills that month's income when
 * it has no explicit entry. Raises are appended as new rows (history stays).
 */
export function SalaryScheduleCard() {
  const { incomeDefaults, createDefault, removeDefault } = useBudgetContext()
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
      await createDefault({
        amount: parsed,
        currency,
        effective_from: `${month}-01`,
      })
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
                  {formatCurrency(d.amount, d.currency as FiatCurrency)} / month
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  aria-label="Delete this salary row"
                  onClick={() => void removeDefault(d.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}

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
