import { Card, CardContent } from "@/components/ui/card"
import { HintPopover } from "@/components/common/HintPopover"
import { cn } from "@/lib/utils"
import { useDisplayMoney } from "@/hooks/useDisplayMoney"
import {
  formatAmount,
  formatCurrency,
  formatSignedPercent,
  gainLossToneClass,
  obfuscate,
} from "@/lib/prices"
import { DECIMALS } from "@/lib/config"
import {
  MWR_HINT,
  MWR_LABEL,
  MWR_PER_YEAR_SUFFIX,
} from "@/lib/constants/returns"
import type { EnrichedAsset } from "@/hooks/usePortfolio"

interface Props {
  enriched: EnrichedAsset
  held: boolean
  realizedPnlUsd: number
  realizedPnlPct: number | null
  totalReturnUsd: number
  mwrCumulativePct: number | null
  mwrAnnualizedPct: number | null
  dailyReturnAvailable: boolean
}

/**
 * One stat card. `emphasis` promotes the three figures this page exists to
 * answer — what it's worth, what it made, what it did today — above the
 * supporting ones (quantity, allocation, average cost), which previously all
 * shared one label-sized weight. Every card keeps the same height so the two
 * tiers don't stagger the grid.
 */
function Stat({
  label,
  emphasis = false,
  className,
  children,
}: {
  label: string
  emphasis?: boolean
  className?: string
  children: React.ReactNode
}) {
  return (
    <Card size="sm" className={cn("h-full", className)}>
      <CardContent>
        <p className="text-xs text-muted-foreground">{label}</p>
        <div
          className={`mt-1 tabular-nums font-semibold ${
            emphasis ? "text-xl" : "text-sm"
          }`}
        >
          {children}
        </div>
      </CardContent>
    </Card>
  )
}

/** The one MWR explainer, reachable by hover AND tap (a bare `title` never
 *  fires on touch, and this % is a money-weighted rate — not the dollars ÷
 *  cost ratio sitting beside it). */
function MwrLabel() {
  return (
    <HintPopover text={MWR_HINT} label={MWR_LABEL}>
      <span className="text-xs font-normal">{MWR_LABEL}</span>
    </HintPopover>
  )
}

/** The lifetime money-weighted headline. The % is the cumulative XIRR — what
 *  each dollar earned for the time it was in — exact at any age; the muted
 *  %/yr reading appears only past 1 year of history. */
function TotalReturnStat({
  totalReturnUsd,
  mwrCumulativePct,
  mwrAnnualizedPct,
  signedMoney,
}: {
  totalReturnUsd: number
  mwrCumulativePct: number | null
  mwrAnnualizedPct: number | null
  signedMoney: (usd: number) => string
}) {
  return (
    <Stat label="Total return" emphasis>
      <span className={gainLossToneClass(totalReturnUsd)}>
        {signedMoney(totalReturnUsd)}
        {mwrCumulativePct !== null && (
          <span className="ml-1 text-xs">
            ({formatSignedPercent(mwrCumulativePct)})
          </span>
        )}
      </span>
      {/* The measure's name sits inline after the %, on the same line as the
          annualised reading — never a third line. */}
      <p className="mt-0.5 text-xs font-normal text-muted-foreground">
        <MwrLabel />
        {mwrAnnualizedPct !== null && (
          <>
            {" · ≈"}
            {formatSignedPercent(mwrAnnualizedPct, DECIMALS.percentageRate)}
            {MWR_PER_YEAR_SUFFIX}
          </>
        )}
      </p>
    </Stat>
  )
}

export function AssetPositionSummary({
  enriched,
  held,
  realizedPnlUsd,
  realizedPnlPct,
  totalReturnUsd,
  mwrCumulativePct,
  mwrAnnualizedPct,
  dailyReturnAvailable,
}: Props) {
  const { currency, money, signedMoney, display, obfuscated } = useDisplayMoney()
  const o = (v: string) => obfuscate(v, obfuscated)

  const realizedStat = (
    <Stat label={held ? "Realized P&L" : "Realized P&L (lifetime)"}>
      <span className={gainLossToneClass(realizedPnlUsd)}>
        {signedMoney(realizedPnlUsd)}
        {realizedPnlPct !== null && (
          <span className="ml-1 text-xs">
            ({formatSignedPercent(realizedPnlPct)})
          </span>
        )}
      </span>
    </Stat>
  )

  if (!held) {
    return (
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card size="sm" className="col-span-2">
          <CardContent>
            <p className="text-xs text-muted-foreground">Position</p>
            <p className="mt-1 text-sm text-muted-foreground">
              No current position — fully sold out.
            </p>
          </CardContent>
        </Card>
        <TotalReturnStat
          totalReturnUsd={totalReturnUsd}
          mwrCumulativePct={mwrCumulativePct}
          mwrAnnualizedPct={mwrAnnualizedPct}
          signedMoney={signedMoney}
        />
        {realizedStat}
      </div>
    )
  }

  const displayValue =
    currency === "USD" ? enriched.currentValueUsd : enriched.currentValueTry

  // Same row-level rule as the Portfolio page: taxed assets headline the net
  // (after-accrual) return with gross + tax annotated; daily stays gross.
  const taxed = enriched.taxAccrualUsd > 0
  const netUsd = taxed
    ? enriched.unrealizedPnlUsd - enriched.taxAccrualUsd
    : enriched.unrealizedPnlUsd
  const netPct =
    taxed && enriched.costBasisUsd > 0
      ? (netUsd / enriched.costBasisUsd) * 100
      : enriched.unrealizedPnlPct

  const avgCostUsd =
    enriched.totalBalance > 0 ? enriched.costBasisUsd / enriched.totalBalance : null
  const avgCostNative =
    enriched.costBasisNative != null &&
    enriched.nativeCurrency === "TRY" &&
    enriched.totalBalance > 0
      ? enriched.costBasisNative / enriched.totalBalance
      : null

  return (
    // The three promoted cards lead, so on a phone (one column) the answers
    // arrive before the supporting figures.
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <Stat label="Value" emphasis>
        {display(displayValue)}
      </Stat>

      <TotalReturnStat
        totalReturnUsd={totalReturnUsd}
        mwrCumulativePct={mwrCumulativePct}
        mwrAnnualizedPct={mwrAnnualizedPct}
        signedMoney={signedMoney}
      />

      {/* Two columns on a phone, three promoted stats: the third takes the
          whole row so a promoted figure never sits beside a demoted one. */}
      <Stat label="Today" emphasis className="max-md:col-span-2">
        {dailyReturnAvailable ? (
          <span className={gainLossToneClass(enriched.dailyReturnUsd)}>
            {signedMoney(enriched.dailyReturnUsd)}
            {enriched.dailyReturnPct !== null && (
              <span className="ml-1 text-xs">
                ({formatSignedPercent(enriched.dailyReturnPct)})
              </span>
            )}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </Stat>

      <Stat label="Unrealized P&L">
        <span className={gainLossToneClass(netUsd)}>
          {signedMoney(netUsd)}
          {netPct !== null && (
            <span className="ml-1 text-xs">({formatSignedPercent(netPct)})</span>
          )}
        </span>
        {taxed && (
          <p className="mt-0.5 text-xs font-normal text-muted-foreground">
            gross {signedMoney(enriched.unrealizedPnlUsd)} · −
            {money(enriched.taxAccrualUsd)} tax
          </p>
        )}
      </Stat>

      {realizedStat}

      <Stat label="Quantity">
        {o(formatAmount(enriched.totalBalance, enriched.category))}
      </Stat>

      {/* Per-unit cost stays in the asset's OWN currency (the asset-native
          convention), with the USD equivalent beside it — it is a price, not a
          P&L figure, so it does not follow the display currency. */}
      <Stat label="Avg cost / unit">
        {avgCostUsd == null ? (
          "—"
        ) : avgCostNative != null ? (
          <>
            {o(formatCurrency(avgCostNative, "TRY"))}
            <span className="ml-1 text-xs font-normal text-muted-foreground">
              (~{o(formatCurrency(avgCostUsd, "USD"))})
            </span>
          </>
        ) : (
          o(formatCurrency(avgCostUsd, "USD"))
        )}
      </Stat>

      <Stat label="Allocation">{enriched.allocationPct.toFixed(1)}%</Stat>
    </div>
  )
}
