import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatCurrency } from "@/lib/prices"
import type { TransactionLogSummary } from "@/hooks/useTransactionLog"

interface Props {
  summary: TransactionLogSummary
  currency: "USD" | "TRY"
}

const SUMMARY_LABELS = {
  count: "Transactions",
  buyVolume: "Buy Volume",
  sellVolume: "Sell Volume",
} as const

export function TransactionSummary({ summary, currency }: Props) {
  // Volumes are turnover, not P&L: the gain/loss palette on this page belongs
  // to the realized figures alone.
  const figures = [
    { label: SUMMARY_LABELS.count, value: String(summary.count) },
    {
      label: SUMMARY_LABELS.buyVolume,
      value: formatCurrency(summary.totalBuyVolume, currency),
    },
    {
      label: SUMMARY_LABELS.sellVolume,
      value: formatCurrency(summary.totalSellVolume, currency),
    },
  ]

  return (
    <>
      {/* Phone: one strip, so the first transaction card is in the first
          screen. Three columns of ~110px hold the longest ₺ string. */}
      <Card size="sm" className="sm:hidden">
        <CardContent>
          <div className="grid grid-cols-3 gap-2">
            {figures.map((figure) => (
              <div key={figure.label} className="flex flex-col gap-0.5">
                <span className="text-[0.6875rem] text-muted-foreground">
                  {figure.label}
                </span>
                <span className="text-xs font-semibold tabular-nums">
                  {figure.value}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* `sm` and up: the three stat cards. */}
      <div className="hidden gap-4 sm:grid sm:grid-cols-3">
        {figures.map((figure) => (
          <Card key={figure.label} size="sm">
            <CardHeader>
              <CardTitle className="text-sm text-muted-foreground">
                {figure.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold tabular-nums">{figure.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  )
}
