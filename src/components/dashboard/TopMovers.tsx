import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  formatSignedCurrency,
  formatSignedPercent,
  obfuscate,
} from "@/lib/prices"
import { useDisplayCurrency } from "@/contexts/DisplayContext"
import type { TopMover } from "@/hooks/useDashboard"
import { AssetIcon } from "@/components/common/AssetIcon"
import { Link } from "react-router"

interface TopMoversProps {
  topMovers: TopMover[]
}

export default function TopMovers({ topMovers }: TopMoversProps) {
  const { obfuscated } = useDisplayCurrency()
  const o = (v: string) => obfuscate(v, obfuscated)

  return (
    <Card className="flex flex-col">
      <CardHeader>
        <CardTitle>Largest unrealized P&amp;L</CardTitle>
        <CardDescription>
          Ranked by absolute lifetime gain or loss.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {topMovers.length === 0 ? (
          <p className="text-muted-foreground">
            No unrealized P&amp;L to display yet.
          </p>
        ) : (
          <div className="space-y-1">
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
                <Link
                  key={mover.assetId}
                  to={`/assets/${mover.assetId}`}
                  aria-label={`View ${mover.name} (${mover.ticker}) asset details`}
                  className="-mx-2 flex items-center justify-between rounded-lg px-2 py-1.5 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <AssetIcon asset={mover} size="sm" />
                    <p className="truncate text-sm font-semibold">
                      {mover.ticker}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-medium ${colorClass}`}>
                      {o(pnlDisplay)}
                    </p>
                    <p className={`text-xs ${colorClass}`}>
                      {formatSignedPercent(mover.unrealizedPnlPct)}
                    </p>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
