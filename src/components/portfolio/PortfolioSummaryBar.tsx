import { Card, CardContent } from "@/components/ui/card"
import { useDisplayCurrency } from "@/contexts/DisplayContext"
import {
  formatCurrency,
  formatSignedCurrency,
  formatSignedPercent,
  gainLossClass,
  obfuscate,
} from "@/lib/prices"

interface PortfolioSummaryBarProps {
  totalValueUsd: number
  totalValueTry: number
  totalPnlUsd: number
  /** null = nothing ever deployed (peak ≤ 0) → render "—". */
  totalPnlPct: number | null
  /** Summed at-source tax accrual across all assets, in USD. */
  totalTaxAccrualUsd: number
  totalUnrealizedPnlUsd: number
  totalRealizedPnlUsd: number
  totalIncomeUsd: number
  heldAssetCount: number
}

export function PortfolioSummaryBar({
  totalValueUsd,
  totalValueTry,
  totalPnlUsd,
  totalPnlPct,
  totalTaxAccrualUsd,
  totalUnrealizedPnlUsd,
  totalRealizedPnlUsd,
  totalIncomeUsd,
  heldAssetCount,
}: PortfolioSummaryBarProps) {
  const { currency, obfuscated } = useDisplayCurrency()
  const o = (v: string) => obfuscate(v, obfuscated)

  const displayValue = currency === "USD" ? totalValueUsd : totalValueTry
  // Only the headline P&L goes net (after-tax); the unrealized/realized split
  // below stays gross. After-tax = gross − at-source tax accrual.
  const taxed = totalTaxAccrualUsd > 0
  const netPnl = totalPnlUsd - totalTaxAccrualUsd
  const pnlIsPositive = netPnl >= 0
  const hasRealized = Math.abs(totalRealizedPnlUsd) > 0.005
  const hasIncome = Math.abs(totalIncomeUsd) > 0.005

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
                className={`text-xl font-bold tabular-nums ${gainLossClass(
                  pnlIsPositive
                )}`}
              >
                {o(formatSignedCurrency(netPnl, "USD"))}
              </span>
              <span className={`text-sm ${gainLossClass(pnlIsPositive)}`}>
                ({totalPnlPct == null ? "—" : formatSignedPercent(totalPnlPct)})
              </span>
            </div>
            {taxed && (
              <span className="text-xs text-muted-foreground tabular-nums">
                gross {o(formatSignedCurrency(totalPnlUsd, "USD"))}
                {" · "}
                −{o(formatCurrency(totalTaxAccrualUsd, "USD"))} tax
              </span>
            )}
            {hasRealized && (
              <span className="text-xs text-muted-foreground tabular-nums">
                Unrealized {o(formatSignedCurrency(totalUnrealizedPnlUsd, "USD"))}
                {" · "}
                Realized {o(formatSignedCurrency(totalRealizedPnlUsd, "USD"))}
              </span>
            )}
            {hasIncome && (
              <span className="text-xs text-muted-foreground tabular-nums">
                Dividend &amp; interest income{" "}
                {o(formatSignedCurrency(totalIncomeUsd, "USD"))}
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Held Assets */}
      <Card size="sm">
        <CardContent>
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-muted-foreground">
              Held Assets
            </span>
            <span className="text-xl font-bold tabular-nums">
              {heldAssetCount}
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
