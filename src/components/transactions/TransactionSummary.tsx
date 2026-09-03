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
      {/* One strip below `lg`: on a phone so the first transaction card is in
          the first screen, and up to `lg` because the 240px sidebar appears at
          `md` and leaves the three cards ~125px of content each — not enough
          for a converted ₺ volume at `text-2xl`. Three columns of ~110px hold
          the longest ₺ string here. */}
      <Card size="sm" className="lg:hidden">
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

      {/* `lg` and up: the three stat cards, where the content beside the
          sidebar is wide enough to hold them. */}
      <div className="hidden gap-4 lg:grid lg:grid-cols-3">
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
