import { Card, CardContent } from "@/components/ui/card"
import { useDisplayMoney } from "@/hooks/useDisplayMoney"
import { gainLossClass } from "@/lib/prices"

interface Props {
  incomeUsd: number
  taxesUsd: number
  feesUsd: number
}

/** Lifetime income (dividends + interest), taxes withheld, and fees paid on
 *  this asset — booked sums over its transactions. Zero cards are omitted. */
export function AssetIncomeCosts({ incomeUsd, taxesUsd, feesUsd }: Props) {
  // USD-anchored sums, rendered in the display currency like every other
  // money figure on this page.
  const { money } = useDisplayMoney()

  const cards = [
    incomeUsd !== 0 && {
      label: "Income (dividends + interest)",
      value: money(incomeUsd),
      className: gainLossClass(true),
    },
    taxesUsd !== 0 && {
      label: "Taxes withheld",
      value: `-${money(taxesUsd)}`,
      className: "text-muted-foreground",
    },
    feesUsd !== 0 && {
      label: "Fees paid",
      value: `-${money(feesUsd)}`,
      className: "text-muted-foreground",
    },
  ].filter(Boolean) as { label: string; value: string; className: string }[]

  if (cards.length === 0) return null

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {cards.map((c) => (
        <Card key={c.label} size="sm">
          <CardContent>
            <p className="text-xs text-muted-foreground">{c.label}</p>
            <p className={`mt-1 tabular-nums text-sm font-semibold ${c.className}`}>
              {c.value}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
