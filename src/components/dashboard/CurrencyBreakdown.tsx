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
  return (
    <AllocationBreakdown
      title="Currencies"
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
