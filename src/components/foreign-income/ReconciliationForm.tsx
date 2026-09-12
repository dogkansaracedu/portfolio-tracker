import { useState, type FormEvent } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { formatCurrency } from "@/lib/prices"
import { cn } from "@/lib/utils"
import type {
  ForeignIncomeReconciliation,
  ForeignIncomeReconciliationInsert,
} from "@/types/database"

interface Props {
  reconciliation: ForeignIncomeReconciliation | null
  recordedTry: number
  recordedFingerprint: string
  saving: boolean
  error: string | null
  save: (
    data: Omit<
      ForeignIncomeReconciliationInsert,
      "user_id" | "tax_year"
    >,
  ) => Promise<ForeignIncomeReconciliation>
}

export function ReconciliationForm({
  reconciliation,
  recordedTry,
  recordedFingerprint,
  saving,
  error,
  save,
}: Props) {
  const [statementAmount, setStatementAmount] = useState(
    reconciliation ? String(reconciliation.statement_amount_try) : "",
  )
  const [note, setNote] = useState(reconciliation?.note ?? "")
  const enteredAmount =
    statementAmount.trim() === "" ? null : Number(statementAmount)
  const amountValid =
    enteredAmount !== null && Number.isFinite(enteredAmount) && enteredAmount >= 0
  const liveDifference = amountValid ? enteredAmount - recordedTry : null

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!amountValid) return
    try {
      await save({
        statement_amount_try: enteredAmount.toFixed(2),
        recorded_amount_try: recordedTry.toFixed(2),
        recorded_fingerprint: recordedFingerprint,
        note: note.trim() || null,
      })
      toast.success("Foreign income comparison saved")
    } catch {
      // The hook owns the inline error message; keeping the form open preserves
      // the user's verified amount and note for a retry.
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Compare with your records</CardTitle>
        <CardDescription>
          Enter the verified TRY total from your statement or tax worksheet.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="foreign-income-statement-total">
              Statement or worksheet total (TRY)
            </Label>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-sm text-muted-foreground">
                ₺
              </span>
              <Input
                id="foreign-income-statement-total"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                className="pl-7 max-lg:h-10"
                value={statementAmount}
                onChange={(event) => setStatementAmount(event.target.value)}
                placeholder="0.00"
                aria-invalid={statementAmount !== "" && !amountValid}
                aria-describedby="foreign-income-amount-help foreign-income-amount-error"
              />
            </div>
            <p
              id="foreign-income-amount-help"
              className="text-xs text-muted-foreground"
            >
              Enter the TRY total from the external record you are comparing.
            </p>
            <p
              id="foreign-income-amount-error"
              className="text-xs text-destructive"
              aria-live="polite"
            >
              {statementAmount !== "" && !amountValid
                ? "Enter zero or a positive amount."
                : ""}
            </p>
          </div>

          <div className="rounded-lg border bg-muted/30 p-3">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="text-muted-foreground">App total</span>
              <span className="font-medium tabular-nums">
                {formatCurrency(recordedTry, "TRY")}
              </span>
            </div>
            <div className="mt-1 flex items-center justify-between gap-3 text-sm">
              <span className="text-muted-foreground">Difference</span>
              <span
                aria-live="polite"
                className={cn(
                  "font-semibold tabular-nums",
                  liveDifference === null || Math.abs(liveDifference) < 0.01
                    ? "text-foreground"
                    : "text-amber-600",
                )}
              >
                {liveDifference === null
                  ? "—"
                  : formatCurrency(liveDifference, "TRY")}
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="foreign-income-reconciliation-note">
              Note{" "}
              <span className="font-normal text-muted-foreground">
                (optional)
              </span>
            </Label>
            <Textarea
              id="foreign-income-reconciliation-note"
              maxLength={1000}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Statement source, missing payment, or follow-up…"
            />
          </div>

          {error && (
            <p className="text-sm text-red-500" role="alert">
              {error}
            </p>
          )}
          <Button
            type="submit"
            className="max-lg:min-h-10"
            disabled={!amountValid || saving}
          >
            {saving ? "Saving…" : "Save comparison"}
          </Button>
          <p className="text-xs text-muted-foreground">
            Saving adds a dated history entry and never changes transactions or
            balances.
          </p>
        </form>
      </CardContent>
    </Card>
  )
}
