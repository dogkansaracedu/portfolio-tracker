import { Card, CardContent } from "@/components/ui/card"
import { useDisplayCurrency } from "@/contexts/DisplayContext"
import {
  formatCurrency,
  formatSignedCurrency,
  formatSignedPercent,
  gainLossClass,
  obfuscate,
} from "@/lib/prices"

/** Visible micro-label for the headline % — the same idiom as the dashboard
 *  hero's "XIRR" chip. Load-bearing on touch, where `title` never fires: the
 *  % is a money-weighted rate, NOT the dollar ÷ invested ratio beside it. */
const MWR_LABEL = "MWR"

/** Supplementary hover hint (desktop) for the headline %. */
const MWR_HINT =
  "Cumulative money-weighted (XIRR) return — what each dollar earned for the time it was invested."

interface PortfolioSummaryBarProps {
  totalValueUsd: number
  totalValueTry: number
  totalPnlUsd: number
  /** Lifetime cumulative money-weighted (XIRR) return %; null = no answer
   *  (no flows yet, or the solver found no rate) → render "—". */
  totalMwrPct: number | null
  totalUnrealizedPnlUsd: number
  totalRealizedPnlUsd: number
  totalIncomeUsd: number
  heldAssetCount: number
}

export function PortfolioSummaryBar({
  totalValueUsd,
  totalValueTry,
  totalPnlUsd,
  totalMwrPct,
  totalUnrealizedPnlUsd,
  totalRealizedPnlUsd,
  totalIncomeUsd,
  heldAssetCount,
}: PortfolioSummaryBarProps) {
  const { currency, obfuscated } = useDisplayCurrency()
  const o = (v: string) => obfuscate(v, obfuscated)

  const displayValue = currency === "USD" ? totalValueUsd : totalValueTry
  // Headline P&L stays gross — the after-tax (net) view lives only on taxed
  // asset rows in the holdings table.
  const pnlIsPositive = totalPnlUsd >= 0
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
                {o(formatSignedCurrency(totalPnlUsd, "USD"))}
              </span>
              {/* Absent (never a "—" placeholder) when the solver has no
                  answer — same hidden-not-zeroed convention as the hero's
                  XIRR chip. */}
              {totalMwrPct != null && (
                <span className="text-sm text-muted-foreground" title={MWR_HINT}>
                  {MWR_LABEL}{" "}
                  <span className={gainLossClass(totalMwrPct >= 0)}>
                    {formatSignedPercent(totalMwrPct)}
                  </span>
                </span>
              )}
            </div>
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
