import { CheckCircle2, CircleAlert, Clock3 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import {
  foreignIncomeReconciliationState,
  type ForeignIncomeReconciliationStatus,
} from "@/lib/foreign-income-reconciliation"
import { formatCurrency } from "@/lib/prices"
import { cn } from "@/lib/utils"
import type { ForeignIncomeReconciliation } from "@/types/database"

const STATUS_COPY: Record<
  ForeignIncomeReconciliationStatus,
  { label: string; detail: string }
> = {
  "not-started": {
    label: "Not checked",
    detail: "Compare the recorded total with your tax worksheet.",
  },
  matched: {
    label: "Matched",
    detail: "The verified and recorded totals agree.",
  },
  difference: {
    label: "Difference found",
    detail: "Review the included payments or your verified total.",
  },
  stale: {
    label: "Review again",
    detail: "Income transactions changed after the last check.",
  },
}

function statusStyle(status: ForeignIncomeReconciliationStatus) {
  if (status === "matched") {
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
  }
  if (status === "difference" || status === "stale") {
    return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
  }
  return ""
}

function formatCheckedAt(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value))
}

interface Props {
  year: number
  recordedTry: number
  fingerprint: string
  paymentCount: number
  reconciliation: ForeignIncomeReconciliation | null
}

export function ReconciliationSummary({
  year,
  recordedTry,
  fingerprint,
  paymentCount,
  reconciliation,
}: Props) {
  const state = foreignIncomeReconciliationState(
    reconciliation,
    recordedTry,
    fingerprint,
  )

  return (
    <div className="grid gap-3 md:grid-cols-3">
      <Card size="sm">
        <CardContent>
          <p className="text-xs font-medium text-muted-foreground">
            App total · {year}
          </p>
          <p className="mt-1 text-xl font-semibold tabular-nums">
            {formatCurrency(recordedTry, "TRY")}
          </p>
          <p className="text-xs text-muted-foreground">
            {paymentCount} included {paymentCount === 1 ? "payment" : "payments"}
          </p>
        </CardContent>
      </Card>

      <Card size="sm">
        <CardContent>
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-muted-foreground">
              Reconciliation
            </p>
            <Badge variant="outline" className={statusStyle(state.status)}>
              {state.status === "matched" ? (
                <CheckCircle2 data-icon="inline-start" />
              ) : state.status === "not-started" ? (
                <Clock3 data-icon="inline-start" />
              ) : (
                <CircleAlert data-icon="inline-start" />
              )}
              {STATUS_COPY[state.status].label}
            </Badge>
          </div>
          <p className="mt-2 text-sm font-medium">
            {reconciliation
              ? `Checked ${formatCheckedAt(reconciliation.reconciled_at)}`
              : "No saved comparison"}
          </p>
          <p className="text-xs text-muted-foreground">
            {STATUS_COPY[state.status].detail}
          </p>
        </CardContent>
      </Card>

      <Card size="sm">
        <CardContent>
          <p className="text-xs font-medium text-muted-foreground">
            Current difference
          </p>
          <p
            className={cn(
              "mt-1 text-xl font-semibold tabular-nums",
              state.status === "matched"
                ? "text-emerald-600"
                : state.status === "difference" || state.status === "stale"
                  ? "text-amber-600"
                  : "text-muted-foreground",
            )}
          >
            {reconciliation
              ? formatCurrency(state.differenceTry.toNumber(), "TRY")
              : "—"}
          </p>
          <p className="text-xs text-muted-foreground">
            Statement total minus current app total
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
