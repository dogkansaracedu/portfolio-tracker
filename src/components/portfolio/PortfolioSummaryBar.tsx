import { Card, CardContent } from "@/components/ui/card"
import { useDisplayMoney } from "@/hooks/useDisplayMoney"
import { formatSignedPercent, gainLossToneClass } from "@/lib/prices"
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip"
import { MWR_HINT, MWR_LABEL } from "@/lib/constants/returns"

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
  const { currency, signedMoney, display } = useDisplayMoney()

  const displayValue = currency === "USD" ? totalValueUsd : totalValueTry
  // Headline P&L stays gross — the after-tax (net) view lives only on taxed
  // asset rows in the holdings table. It is USD-anchored but rendered in the
  // display currency, so this card never mixes ₺ value with $ P&L.
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
              {display(displayValue)}
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
                className={`text-xl font-bold tabular-nums ${gainLossToneClass(
                  totalPnlUsd
                )}`}
              >
                {signedMoney(totalPnlUsd)}
              </span>
              {/* Absent (never a "—" placeholder) when the solver has no
                  answer — same hidden-not-zeroed convention as the hero's
                  XIRR chip. */}
              {totalMwrPct != null && (
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <span className="cursor-default text-sm text-muted-foreground" />
                    }
                  >
                    {MWR_LABEL}{" "}
                    <span className={gainLossToneClass(totalMwrPct)}>
                      {formatSignedPercent(totalMwrPct)}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>{MWR_HINT}</TooltipContent>
                </Tooltip>
              )}
            </div>
            {hasRealized && (
              <span className="text-xs text-muted-foreground tabular-nums">
                Unrealized {signedMoney(totalUnrealizedPnlUsd)}
                {" · "}
                Realized {signedMoney(totalRealizedPnlUsd)}
              </span>
            )}
            {hasIncome && (
              <span className="text-xs text-muted-foreground tabular-nums">
                Dividend &amp; interest income {signedMoney(totalIncomeUsd)}
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
