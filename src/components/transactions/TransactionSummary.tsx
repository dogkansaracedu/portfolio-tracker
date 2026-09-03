import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useDisplayMoney } from "@/hooks/useDisplayMoney"
import type { TransactionLogSummary } from "@/hooks/useTransactionLog"

interface Props {
  summary: TransactionLogSummary
}

const SUMMARY_LABELS = {
  count: "Transactions",
  buyVolume: "Buy Volume",
  sellVolume: "Sell Volume",
} as const

export function TransactionSummary({ summary }: Props) {
  // The volumes are accumulated in USD (the anchor every figure in this app is
  // computed in), so they go through the display edge that re-denominates a
  // USD amount — re-symbolling them would print the dollar figure behind a
  // lira sign. Turnover, not P&L: the gain/loss palette on this page belongs
  // to the realized figures alone.
  const { money } = useDisplayMoney()
  const figures = [
    { label: SUMMARY_LABELS.count, value: String(summary.count) },
    {
      label: SUMMARY_LABELS.buyVolume,
      value: money(summary.totalBuyVolume),
    },
    {
      label: SUMMARY_LABELS.sellVolume,
      value: money(summary.totalSellVolume),
    },
  ]

  return (
    <>
      {/* Phone: one strip, so the first transaction card is in the first
          screen. Three columns of ~110px hold the longest ₺ string. */}
      <Card size="sm" className="sm:hidden">
        <CardContent>
          {/* The count needs three digits; the two volumes need every pixel
              a converted ₺ figure asks for, so the count column shrinks to
              its content instead of taking an equal third. */}
          <div className="grid grid-cols-[auto_1fr_1fr] gap-2">
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
              {/* The 240px sidebar arrives at `md` and leaves each card
                  ~125px of content — which a converted ₺ volume overflows at
                  `text-2xl`. The figure steps down for that band only; from
                  `lg` there is room again, and below `md` there is no sidebar
                  yet. */}
              <p className="text-2xl font-bold tabular-nums md:text-lg lg:text-2xl">
                {figure.value}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  )
}
