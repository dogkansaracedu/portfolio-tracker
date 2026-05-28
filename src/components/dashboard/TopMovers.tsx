import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  formatSignedCurrency,
  formatSignedPercent,
  obfuscate,
} from "@/lib/prices"
import { useDisplayCurrency } from "@/contexts/DisplayContext"
import type { TopMover } from "@/hooks/useDashboard"

interface TopMoversProps {
  topMovers: TopMover[]
}

export default function TopMovers({ topMovers }: TopMoversProps) {
  const { obfuscated } = useDisplayCurrency()
  const o = (v: string) => obfuscate(v, obfuscated)

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
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-red-500 dark:text-red-400"

              // Since we only have USD PnL, show in USD for simplicity.
              const pnlDisplay = formatSignedCurrency(
                mover.unrealizedPnlUsd,
                "USD",
              )

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
                      {o(pnlDisplay)}
                    </p>
                    <p className={`text-xs ${colorClass}`}>
                      {o(formatSignedPercent(mover.unrealizedPnlPct, 2))}
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
