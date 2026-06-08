import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useDisplayCurrency } from "@/contexts/DisplayContext"
import { formatCurrency, obfuscate } from "@/lib/prices"
import type { CurrencyAllocation } from "@/hooks/useDashboard"

interface CurrencyBreakdownProps {
  byCurrency: CurrencyAllocation[]
}

// Distinct hues per currency, deliberately NOT the gain/loss emerald/red.
const CURRENCY_COLORS: Record<string, string> = {
  USD: "#3b82f6", // blue-500
  TRY: "#f59e0b", // amber-500
  EUR: "#8b5cf6", // violet-500
}
const FALLBACK_COLOR = "#64748b" // slate-500

export default function CurrencyBreakdown({
  byCurrency,
}: CurrencyBreakdownProps) {
  const { currency, obfuscated } = useDisplayCurrency()
  const o = (v: string) => obfuscate(v, obfuscated)

  if (byCurrency.length === 0) {
    return (
      <Card className="flex flex-col">
        <CardHeader>
          <CardTitle>Currencies</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-1 items-center justify-center">
          <p className="text-muted-foreground">No currencies to display.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="flex flex-col">
      <CardHeader>
        <CardTitle>Currencies</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {byCurrency.map((c) => {
          const value = currency === "USD" ? c.valueUsd : c.valueTry
          const color = CURRENCY_COLORS[c.currency] ?? FALLBACK_COLOR
          return (
            <div key={c.currency} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span
                    className="inline-block h-3 w-3 rounded-full"
                    style={{ backgroundColor: color }}
                  />
                  <span className="font-medium">{c.currency}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">
                    {c.percentage.toFixed(1)}%
                  </span>
                  <span className="font-medium">
                    {o(formatCurrency(value, currency))}
                  </span>
                </div>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.max(c.percentage, 1)}%`,
                    backgroundColor: color,
                  }}
                />
              </div>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
