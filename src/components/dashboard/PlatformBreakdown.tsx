import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useDisplayCurrency } from "@/contexts/DisplayContext"
import { formatCurrency } from "@/lib/prices"
import type { PlatformAllocation } from "@/hooks/useDashboard"

interface PlatformBreakdownProps {
  byPlatform: PlatformAllocation[]
}

export default function PlatformBreakdown({
  byPlatform,
}: PlatformBreakdownProps) {
  const { currency } = useDisplayCurrency()

  if (byPlatform.length === 0) {
    return (
      <Card className="flex flex-col">
        <CardHeader>
          <CardTitle>Platforms</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-1 items-center justify-center">
          <p className="text-muted-foreground">No platforms to display.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="flex flex-col">
      <CardHeader>
        <CardTitle>Platforms</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {byPlatform.map((platform) => {
          const value =
            currency === "USD" ? platform.valueUsd : platform.valueTry
          return (
            <div key={platform.platformName} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span
                    className="inline-block h-3 w-3 rounded-full"
                    style={{ backgroundColor: platform.color }}
                  />
                  <span className="font-medium">{platform.platformName}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">
                    {platform.percentage.toFixed(1)}%
                  </span>
                  <span className="font-medium">
                    {formatCurrency(value, currency)}
                  </span>
                </div>
              </div>
              {/* Percentage bar */}
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.max(platform.percentage, 1)}%`,
                    backgroundColor: platform.color,
                  }}
                />
              </div>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
