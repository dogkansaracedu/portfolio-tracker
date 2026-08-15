import { Card, CardContent } from "@/components/ui/card"
import { useDisplayCurrency } from "@/contexts/DisplayContext"
import { formatCurrency, gainLossClass, obfuscate } from "@/lib/prices"

interface Props {
  incomeUsd: number
  taxesUsd: number
  feesUsd: number
}

/** Lifetime income (dividends + interest), taxes withheld, and fees paid on
 *  this asset — booked sums over its transactions. Zero cards are omitted. */
export function AssetIncomeCosts({ incomeUsd, taxesUsd, feesUsd }: Props) {
  const { obfuscated } = useDisplayCurrency()
  const o = (v: string) => obfuscate(v, obfuscated)

  const cards = [
    incomeUsd !== 0 && {
      label: "Income (dividends + interest)",
      value: `+${formatCurrency(incomeUsd, "USD")}`,
      className: gainLossClass(true),
    },
    taxesUsd !== 0 && {
      label: "Taxes withheld",
      value: `−${formatCurrency(taxesUsd, "USD")}`,
      className: "text-muted-foreground",
    },
    feesUsd !== 0 && {
      label: "Fees paid",
      value: `−${formatCurrency(feesUsd, "USD")}`,
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
              {o(c.value)}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
