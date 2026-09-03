import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useDisplayMoney } from "@/hooks/useDisplayMoney"
import { DECIMALS } from "@/lib/config"
import { VEHICLE_COPY } from "@/lib/constants/vehicle"
import type { CategoryTotal } from "@/lib/vehicle"

interface Props {
  byCategory: CategoryTotal[]
}

/**
 * Where the cash went, by category, largest first.
 *
 * Cash only — depreciation is not a category and has its own place in the
 * headline card. Bars rather than a donut: these are shares of one total that
 * the reader wants to rank, and a bar list ranks without needing a legend.
 * Neutral tone throughout, since spending is not a loss.
 *
 * With the amounts hidden by the privacy toggle the bars keep their scale and
 * lose their figures — the same rule the budget trend chart follows, because a
 * bar still to scale beside a masked number hands the figure back.
 */
export function CostBreakdown({ byCategory }: Props) {
  const { money } = useDisplayMoney()

  if (byCategory.length === 0) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">
          {VEHICLE_COPY.breakdownHeading}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2.5">
        {byCategory.map((row) => (
          <div key={row.category} className="space-y-1">
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <span className="truncate">{row.label}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {money(row.usd)}
                {" · "}
                {row.pct.toFixed(DECIMALS.percentageRate)}%
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary/70"
                style={{ width: `${Math.min(row.pct, 100)}%` }}
              />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
