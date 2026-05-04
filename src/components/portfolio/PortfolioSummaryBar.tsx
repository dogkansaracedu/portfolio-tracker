import { Card, CardContent } from "@/components/ui/card"
import { useDisplayCurrency } from "@/contexts/DisplayContext"
import { formatCurrency, obfuscate } from "@/lib/prices"

interface PortfolioSummaryBarProps {
  totalValueUsd: number
  totalValueTry: number
  totalPnlUsd: number
  totalPnlPct: number
  totalUnrealizedPnlUsd: number
  totalRealizedPnlUsd: number
  activeAssetCount: number
}

function signedCurrency(value: number, currency: "USD" | "TRY"): string {
  const sign = value >= 0 ? "+" : "−"
  return `${sign}${formatCurrency(Math.abs(value), currency)}`
}

export function PortfolioSummaryBar({
  totalValueUsd,
  totalValueTry,
  totalPnlUsd,
  totalPnlPct,
  totalUnrealizedPnlUsd,
  totalRealizedPnlUsd,
  activeAssetCount,
}: PortfolioSummaryBarProps) {
  const { currency, obfuscated } = useDisplayCurrency()
  const o = (v: string) => obfuscate(v, obfuscated)

  const displayValue = currency === "USD" ? totalValueUsd : totalValueTry
  const pnlIsPositive = totalPnlUsd >= 0
  const hasRealized = Math.abs(totalRealizedPnlUsd) > 0.005

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
            <span className="text-xs text-muted-foreground">P&L</span>
            <div className="flex items-baseline gap-2">
              <span
                className={`text-xl font-bold tabular-nums ${
                  pnlIsPositive ? "text-emerald-600" : "text-red-500"
                }`}
              >
                {o(signedCurrency(totalPnlUsd, "USD"))}
              </span>
              <span
                className={`text-sm ${
                  pnlIsPositive ? "text-emerald-600" : "text-red-500"
                }`}
              >
                ({pnlIsPositive ? "+" : ""}
                {totalPnlPct.toFixed(2)}%)
              </span>
            </div>
            {hasRealized && (
              <span className="text-xs text-muted-foreground tabular-nums">
                Unrealized {o(signedCurrency(totalUnrealizedPnlUsd, "USD"))}
                {" · "}
                Realized {o(signedCurrency(totalRealizedPnlUsd, "USD"))}
              </span>
            )}
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
