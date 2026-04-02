import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useDisplayCurrency } from "@/contexts/DisplayContext"
import { formatCurrency, obfuscate } from "@/lib/prices"

interface NetWorthCardProps {
  totalValueUsd: number
  totalValueTry: number
}

export default function NetWorthCard({
  totalValueUsd,
  totalValueTry,
}: NetWorthCardProps) {
  const { currency, obfuscated } = useDisplayCurrency()

  const primaryValue =
    currency === "USD" ? totalValueUsd : totalValueTry
  const secondaryValue =
    currency === "USD" ? totalValueTry : totalValueUsd
  const secondaryCurrency = currency === "USD" ? "TRY" : "USD"

  const isEmpty = totalValueUsd === 0 && totalValueTry === 0

  return (
    <Card>
      <CardHeader>
        <CardTitle>Net Worth</CardTitle>
      </CardHeader>
      <CardContent>
        {isEmpty ? (
          <p className="text-muted-foreground">
            Add assets to see your net worth.
          </p>
        ) : (
          <div className="space-y-1">
            <p className="text-3xl font-bold tracking-tight">
              {obfuscate(formatCurrency(primaryValue, currency), obfuscated)}
            </p>
            <p className="text-sm text-muted-foreground">
              {obfuscate(formatCurrency(secondaryValue, secondaryCurrency), obfuscated)}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
