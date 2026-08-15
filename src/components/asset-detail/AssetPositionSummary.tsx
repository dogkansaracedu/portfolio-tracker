import { Card, CardContent } from "@/components/ui/card"
import { useDisplayCurrency } from "@/contexts/DisplayContext"
import {
  formatCurrency,
  formatAmount,
  formatSignedCurrency,
  formatSignedPercent,
  gainLossClass,
  obfuscate,
} from "@/lib/prices"
import type { EnrichedAsset } from "@/hooks/usePortfolio"

interface Props {
  enriched: EnrichedAsset
  held: boolean
  realizedPnlUsd: number
  dailyReturnAvailable: boolean
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Card size="sm">
      <CardContent>
        <p className="text-xs text-muted-foreground">{label}</p>
        <div className="mt-1 tabular-nums text-sm font-semibold">{children}</div>
      </CardContent>
    </Card>
  )
}

export function AssetPositionSummary({
  enriched,
  held,
  realizedPnlUsd,
  dailyReturnAvailable,
}: Props) {
  const { currency, obfuscated } = useDisplayCurrency()
  const o = (v: string) => obfuscate(v, obfuscated)

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
        <Stat label="Realized P&L (lifetime)">
          <span className={gainLossClass(realizedPnlUsd >= 0)}>
            {o(formatSignedCurrency(realizedPnlUsd, "USD"))}
          </span>
        </Stat>
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
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <Stat label="Quantity">
        {o(formatAmount(enriched.totalBalance, enriched.category))}
      </Stat>

      <Stat label="Value">{o(formatCurrency(displayValue, currency))}</Stat>

      <Stat label="Avg cost / unit">
        {avgCostUsd == null ? (
          "—"
        ) : avgCostNative != null ? (
          <>
            {formatCurrency(avgCostNative, "TRY")}
            <span className="ml-1 text-xs text-muted-foreground">
              (~{formatCurrency(avgCostUsd, "USD")})
            </span>
          </>
        ) : (
          formatCurrency(avgCostUsd, "USD")
        )}
      </Stat>

      <Stat label="Allocation">{enriched.allocationPct.toFixed(1)}%</Stat>

      <Stat label="Unrealized P&L">
        <span className={gainLossClass(netUsd >= 0)}>
          {o(formatSignedCurrency(netUsd, "USD"))}
          {netPct !== null && (
            <span className="ml-1 text-xs">({formatSignedPercent(netPct)})</span>
          )}
        </span>
        {taxed && (
          <p className="mt-0.5 text-xs font-normal text-muted-foreground">
            gross {o(formatSignedCurrency(enriched.unrealizedPnlUsd, "USD"))} · −
            {o(formatCurrency(enriched.taxAccrualUsd, "USD"))} tax
          </p>
        )}
      </Stat>

      <Stat label="Realized P&L">
        <span className={gainLossClass(realizedPnlUsd >= 0)}>
          {o(formatSignedCurrency(realizedPnlUsd, "USD"))}
        </span>
      </Stat>

      <Stat label="Today">
        {dailyReturnAvailable ? (
          <span className={gainLossClass(enriched.dailyReturnUsd >= 0)}>
            {o(formatSignedCurrency(enriched.dailyReturnUsd, "USD"))}
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

      <Stat label="Cost basis">
        {o(formatCurrency(enriched.costBasisUsd, "USD"))}
      </Stat>
    </div>
  )
}
