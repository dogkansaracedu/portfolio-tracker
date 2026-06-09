import { useState } from "react"
import { ChevronRight, ChevronDown } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useDisplayCurrency } from "@/contexts/DisplayContext"
import {
  formatCurrency,
  formatSignedCurrency,
  gainLossClass,
  obfuscate,
} from "@/lib/prices"
import { assetNativeCurrency } from "@/lib/constants/assets"
import type { EnrichedAsset } from "@/hooks/usePortfolio"

interface CurrencyHoldingsProps {
  assets: EnrichedAsset[]
}

interface CurrencyGroup {
  currency: string
  valueUsd: number
  valueTry: number
  /** After-tax P&L: Σ unrealized − Σ at-source tax accrual. */
  netPnlUsd: number
  holdings: EnrichedAsset[]
}

// Only CASH and FUNDS/bonds relate to their fiat — stocks/crypto/gold do not,
// so they're deliberately excluded from this view.
const VEHICLE_CATEGORIES = new Set(["fiat", "fund"])

/**
 * "What is each currency holding/earning" — cash + the funds/bonds parked in it,
 * as a collapsible row per currency. After-tax P&L (PPF shows net). Stocks,
 * crypto and gold are NOT bucketed here; they live in the main table.
 */
export function CurrencyHoldings({ assets }: CurrencyHoldingsProps) {
  const { currency, obfuscated } = useDisplayCurrency()
  const o = (v: string) => obfuscate(v, obfuscated)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const byCurrency = new Map<string, CurrencyGroup>()
  for (const a of assets) {
    if (!VEHICLE_CATEGORIES.has(a.category)) continue
    const cur = assetNativeCurrency(a)
    const g =
      byCurrency.get(cur) ??
      ({
        currency: cur,
        valueUsd: 0,
        valueTry: 0,
        netPnlUsd: 0,
        holdings: [],
      } satisfies CurrencyGroup)
    g.valueUsd += a.currentValueUsd
    g.valueTry += a.currentValueTry
    g.netPnlUsd += a.unrealizedPnlUsd - a.taxAccrualUsd
    g.holdings.push(a)
    byCurrency.set(cur, g)
  }

  const groups = [...byCurrency.values()].sort((x, y) => y.valueUsd - x.valueUsd)
  if (groups.length === 0) return null

  const toggle = (cur: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(cur)) next.delete(cur)
      else next.add(cur)
      return next
    })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cash &amp; funds by currency</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        {groups.map((g) => {
          const isOpen = expanded.has(g.currency)
          const value = currency === "USD" ? g.valueUsd : g.valueTry
          return (
            <div key={g.currency}>
              <button
                type="button"
                onClick={() => toggle(g.currency)}
                aria-expanded={isOpen}
                className="flex w-full items-center justify-between rounded-md px-2 py-2 text-left hover:bg-muted/50"
              >
                <span className="flex items-center gap-2 font-medium">
                  {isOpen ? (
                    <ChevronDown className="size-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="size-4 text-muted-foreground" />
                  )}
                  {g.currency}
                  <span className="text-xs text-muted-foreground">
                    ({g.holdings.length})
                  </span>
                </span>
                <span className="flex items-center gap-4 tabular-nums">
                  <span className="font-medium">
                    {o(formatCurrency(value, currency))}
                  </span>
                  <span className={`text-sm ${gainLossClass(g.netPnlUsd >= 0)}`}>
                    {o(formatSignedCurrency(g.netPnlUsd, "USD"))}
                  </span>
                </span>
              </button>

              {isOpen && (
                <div className="space-y-1 pb-2 pl-8 pr-2">
                  {g.holdings.map((h) => {
                    const hValue =
                      currency === "USD" ? h.currentValueUsd : h.currentValueTry
                    const hNet = h.unrealizedPnlUsd - h.taxAccrualUsd
                    return (
                      <div
                        key={h.id}
                        className="flex items-center justify-between text-sm"
                      >
                        <span className="text-muted-foreground">{h.ticker}</span>
                        <span className="flex items-center gap-4 tabular-nums">
                          <span>{o(formatCurrency(hValue, currency))}</span>
                          <span className={gainLossClass(hNet >= 0)}>
                            {o(formatSignedCurrency(hNet, "USD"))}
                          </span>
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
