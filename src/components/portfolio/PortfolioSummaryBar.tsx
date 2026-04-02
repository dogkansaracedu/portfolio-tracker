import { Card, CardContent } from "@/components/ui/card"
import { useDisplayCurrency } from "@/contexts/DisplayContext"
import { formatCurrency, obfuscate } from "@/lib/prices"

interface PortfolioSummaryBarProps {
  totalValueUsd: number
  totalValueTry: number
  totalUnrealizedPnlUsd: number
  totalUnrealizedPnlPct: number
  activeAssetCount: number
}

export function PortfolioSummaryBar({
  totalValueUsd,
  totalValueTry,
  totalUnrealizedPnlUsd,
  totalUnrealizedPnlPct,
  activeAssetCount,
}: PortfolioSummaryBarProps) {
  const { currency, obfuscated } = useDisplayCurrency()
  const o = (v: string) => obfuscate(v, obfuscated)

  const displayValue = currency === "USD" ? totalValueUsd : totalValueTry
  const pnlIsPositive = totalUnrealizedPnlUsd >= 0

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <Card size="sm">
        <CardContent>
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-muted-foreground">
              Total Portfolio Value
            </span>
            <span className="text-xl font-bold tabular-nums">
              {o(formatCurrency(displayValue, currency))}
            </span>
          </div>
        </CardContent>
      </Card>

      <Card size="sm">
        <CardContent>
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-muted-foreground">
              Unrealized P&L
            </span>
            <div className="flex items-baseline gap-2">
              <span
                className={`text-xl font-bold tabular-nums ${
                  pnlIsPositive ? "text-emerald-600" : "text-red-500"
                }`}
              >
                {pnlIsPositive ? "+" : ""}
                {o(formatCurrency(totalUnrealizedPnlUsd, "USD"))}
              </span>
              <span
                className={`text-sm ${
                  pnlIsPositive ? "text-emerald-600" : "text-red-500"
                }`}
              >
                ({pnlIsPositive ? "+" : ""}
                {totalUnrealizedPnlPct.toFixed(2)}%)
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Active Assets */}
      <Card size="sm">
        <CardContent>
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-muted-foreground">
              Active Assets
            </span>
            <span className="text-xl font-bold tabular-nums">
              {activeAssetCount}
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
