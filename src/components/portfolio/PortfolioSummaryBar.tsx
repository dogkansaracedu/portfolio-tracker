import { Card, CardContent } from "@/components/ui/card"
import { useDisplayMoney } from "@/hooks/useDisplayMoney"
import { formatSignedPercent, gainLossToneClass } from "@/lib/prices"
import { HintPopover } from "@/components/common/HintPopover"
import {
  MWR_HINT,
  MWR_LABEL,
  REALIZED_LABEL,
  TOTAL_PNL_LABEL,
  UNREALIZED_LABEL,
} from "@/lib/constants/returns"
import {
  HELD_ASSETS_LABEL,
  TOTAL_VALUE_LABEL,
} from "@/lib/constants/portfolio"

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
    // Below `sm` the two figures the page exists for sit side by side and Held
    // Assets folds into the P&L card's caption, so the first holding is inside
    // the first screen.
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      <Card size="sm">
        <CardContent>
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-muted-foreground">
              {TOTAL_VALUE_LABEL}
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
            <span className="text-xs text-muted-foreground">
              {TOTAL_PNL_LABEL}
            </span>
            <div className="flex flex-wrap items-baseline gap-x-2">
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
                <HintPopover text={MWR_HINT} label={MWR_LABEL} align="start">
                  <span className="text-sm">
                    {MWR_LABEL}{" "}
                    <span className={gainLossToneClass(totalMwrPct)}>
                      {formatSignedPercent(totalMwrPct)}
                    </span>
                  </span>
                </HintPopover>
              )}
            </div>
            {/* The split and the income line are desktop detail; the phone
                strip carries the headline plus the held-asset count. */}
            {hasRealized && (
              <span className="hidden text-xs text-muted-foreground tabular-nums sm:inline">
                {UNREALIZED_LABEL} {signedMoney(totalUnrealizedPnlUsd)}
                {" · "}
                {REALIZED_LABEL} {signedMoney(totalRealizedPnlUsd)}
              </span>
            )}
            {hasIncome && (
              <span className="hidden text-xs text-muted-foreground tabular-nums sm:inline">
                Dividend &amp; interest income {signedMoney(totalIncomeUsd)}
              </span>
            )}
            <span className="text-xs text-muted-foreground tabular-nums sm:hidden">
              {heldAssetCount} {HELD_ASSETS_LABEL.toLowerCase()}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Held Assets — a third card only from `sm` up; on a phone it is the
          caption under P&L. */}
      <Card size="sm" className="hidden sm:block">
        <CardContent>
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-muted-foreground">
              {HELD_ASSETS_LABEL}
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
