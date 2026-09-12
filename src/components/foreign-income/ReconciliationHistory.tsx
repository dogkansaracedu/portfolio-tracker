import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { formatCurrency } from "@/lib/prices"
import type { ForeignIncomeReconciliation } from "@/types/database"

function formatCheckedAt(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value))
}

export function ReconciliationHistory({
  reconciliations,
}: {
  reconciliations: ForeignIncomeReconciliation[]
}) {
  if (reconciliations.length === 0) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle>Comparison history</CardTitle>
        <CardDescription>
          Previous checks are kept as an audit trail; a new save never replaces
          an older one.
        </CardDescription>
      </CardHeader>
      <CardContent className="divide-y">
        {reconciliations.map((row, index) => {
          const difference =
            Number(row.statement_amount_try) - Number(row.recorded_amount_try)
          return (
            <div
              key={row.id}
              className="grid gap-2 py-3 first:pt-0 last:pb-0 sm:grid-cols-[minmax(10rem,1fr)_repeat(3,minmax(7rem,auto))] sm:items-center"
            >
              <div>
                <p className="text-sm font-medium">
                  {formatCheckedAt(row.reconciled_at)}
                  {index === 0 && (
                    <span className="ml-2 text-xs font-normal text-primary">
                      Latest
                    </span>
                  )}
                </p>
                {row.note && (
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                    {row.note}
                  </p>
                )}
              </div>
              <div>
                <p className="text-xs text-muted-foreground">App total</p>
                <p className="text-sm font-medium tabular-nums">
                  {formatCurrency(Number(row.recorded_amount_try), "TRY")}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Statement</p>
                <p className="text-sm font-medium tabular-nums">
                  {formatCurrency(Number(row.statement_amount_try), "TRY")}
                </p>
              </div>
              <div className="sm:text-right">
                <p className="text-xs text-muted-foreground">Difference</p>
                <p className="text-sm font-medium tabular-nums">
                  {formatCurrency(difference, "TRY")}
                </p>
              </div>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
