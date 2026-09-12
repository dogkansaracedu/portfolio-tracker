import { useMemo } from "react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import type { ForeignIncomeEntry } from "@/lib/pnl/foreign-income"
import { formatCurrency } from "@/lib/prices"
import type { Platform } from "@/types/database"

interface Props {
  entries: ForeignIncomeEntry[]
  platforms: Platform[]
  year: number
}

export function SourceBreakdown({ entries, platforms, year }: Props) {
  const rows = useMemo(() => {
    const platformById = new Map(platforms.map((platform) => [platform.id, platform]))
    const grouped = new Map<
      string,
      { id: string; name: string; color: string; count: number; amountTry: number }
    >()
    for (const entry of entries) {
      const platform = platformById.get(entry.transaction.platform_id)
      const key = entry.transaction.platform_id
      const current = grouped.get(key) ?? {
        id: key,
        name: platform?.name ?? "Unknown platform",
        color: platform?.color ?? "#94a3b8",
        count: 0,
        amountTry: 0,
      }
      current.count += 1
      current.amountTry += entry.amountTry.toNumber()
      grouped.set(key, current)
    }
    return [...grouped.values()].sort((a, b) => b.amountTry - a.amountTry)
  }, [entries, platforms])

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recorded by source</CardTitle>
        <CardDescription>
          Only non-TRY dividend and interest payments without at-source tax are
          included.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No declarable foreign-income payments recorded for {year}.
          </p>
        ) : (
          <div className="divide-y">
            {rows.map((source) => (
              <div
                key={source.id}
                className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
              >
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: source.color }}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{source.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {source.count} {source.count === 1 ? "payment" : "payments"}
                  </p>
                </div>
                <p className="font-medium tabular-nums">
                  {formatCurrency(source.amountTry, "TRY")}
                </p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
