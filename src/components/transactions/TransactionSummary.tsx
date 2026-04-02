import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatCurrency } from "@/lib/prices"
import type { TransactionLogSummary } from "@/hooks/useTransactionLog"

interface Props {
  summary: TransactionLogSummary
  currency: "USD" | "TRY"
}

export function TransactionSummary({ summary, currency }: Props) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <Card size="sm">
        <CardHeader>
          <CardTitle className="text-sm text-muted-foreground">
            Transactions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold tabular-nums">{summary.count}</p>
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle className="text-sm text-muted-foreground">
            Buy Volume
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold tabular-nums text-green-600">
            {formatCurrency(summary.totalBuyVolume, currency)}
          </p>
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle className="text-sm text-muted-foreground">
            Sell Volume
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold tabular-nums text-red-600">
            {formatCurrency(summary.totalSellVolume, currency)}
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
