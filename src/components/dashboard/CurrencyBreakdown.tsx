import { AllocationBreakdown } from "@/components/dashboard/AllocationBreakdown"
import {
  CURRENCY_CHART_COLORS,
  CURRENCY_CHART_FALLBACK_COLOR,
} from "@/lib/constants/currencies"
import type { CurrencyAllocation } from "@/hooks/useDashboard"

interface CurrencyBreakdownProps {
  byCurrency: CurrencyAllocation[]
}

export default function CurrencyBreakdown({
  byCurrency,
}: CurrencyBreakdownProps) {
  const largest = byCurrency[0]
  const description = largest
    ? `${largest.percentage >= 50 ? "Concentrated" : "Largest currency"}: ${largest.currency} at ${largest.percentage.toFixed(1)}%`
    : undefined

  return (
    <AllocationBreakdown
      title="Currencies"
      description={description}
      actionLabel="View assets"
      actionTo="/portfolio?groupBy=category"
      emptyText="No currencies to display."
      rows={byCurrency.map((c) => ({
        label: c.currency,
        // The one currency palette, shared with the donut's outer ring.
        color:
          CURRENCY_CHART_COLORS[c.currency] ?? CURRENCY_CHART_FALLBACK_COLOR,
        valueUsd: c.valueUsd,
        valueTry: c.valueTry,
        percentage: c.percentage,
      }))}
    />
  )
}
