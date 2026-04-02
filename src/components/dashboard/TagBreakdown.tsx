import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useDisplayCurrency } from "@/contexts/DisplayContext"
import { formatCurrency } from "@/lib/prices"
import type { TagAllocation } from "@/hooks/useDashboard"

const TAG_COLORS: Record<string, string> = {
  usd: "#22c55e",
  eur: "#6366f1",
  try: "#ec4899",
  crypto: "#f97316",
  commodity: "#eab308",
  fiat: "#64748b",
}

interface TagBreakdownProps {
  byTag: TagAllocation[]
}

export default function TagBreakdown({ byTag }: TagBreakdownProps) {
  const { currency } = useDisplayCurrency()

  if (byTag.length === 0) {
    return (
      <Card className="flex flex-col">
        <CardHeader>
          <CardTitle>Tags</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-1 items-center justify-center">
          <p className="text-muted-foreground">No tags to display.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="flex flex-col">
      <CardHeader>
        <CardTitle>Tags</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {byTag.map((item) => {
          const value = currency === "USD" ? item.valueUsd : item.valueTry
          const color = TAG_COLORS[item.tag] ?? "#94a3b8"

          return (
            <div key={item.tag} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span
                    className="inline-block h-3 w-3 rounded-full"
                    style={{ backgroundColor: color }}
                  />
                  <span className="font-medium">{item.tag}</span>
                </div>
                <span className="font-medium">
                  {formatCurrency(value, currency)}
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.max(Math.min(item.percentage, 100), 1)}%`,
                    backgroundColor: color,
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
