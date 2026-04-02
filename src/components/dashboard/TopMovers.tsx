import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatCurrency } from "@/lib/prices"
import type { TopMover } from "@/hooks/useDashboard"

interface TopMoversProps {
  topMovers: TopMover[]
}

export default function TopMovers({ topMovers }: TopMoversProps) {

  return (
    <Card className="flex flex-col">
      <CardHeader>
        <CardTitle>Top Movers</CardTitle>
      </CardHeader>
      <CardContent>
        {topMovers.length === 0 ? (
          <p className="text-muted-foreground">
            No asset movements to display yet.
          </p>
        ) : (
          <div className="space-y-3">
            {topMovers.map((mover) => {
              const isPositive = mover.unrealizedPnlUsd >= 0
              const colorClass = isPositive
                ? "text-green-600 dark:text-green-400"
                : "text-red-600 dark:text-red-400"

              // For display, convert PnL roughly using the ratio
              // Since we only have USD PnL, show in USD for simplicity
              // or use currentValueUsd as a proxy
              const pnlDisplay = formatCurrency(
                Math.abs(mover.unrealizedPnlUsd),
                "USD",
              )
              const sign = isPositive ? "+" : "-"

              return (
                <div
                  key={mover.assetId}
                  className="flex items-center justify-between"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                      {mover.name}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {mover.ticker}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-medium ${colorClass}`}>
                      {sign}
                      {pnlDisplay}
                    </p>
                    <p className={`text-xs ${colorClass}`}>
                      {sign}
                      {Math.abs(mover.unrealizedPnlPct).toFixed(2)}%
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
