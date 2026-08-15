import { useMemo, useState } from "react"
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { TimeRangeSelector } from "@/components/performance/TimeRangeSelector"
import { formatCurrency } from "@/lib/prices"
import {
  filterHistoryByRange,
  type AssetHistoryPoint,
} from "@/lib/portfolio/assetHistory"
import type { TimeRange } from "@/lib/performance"

interface Props {
  history: AssetHistoryPoint[]
  currency: "USD" | "TRY"
}

/** Position value (area, display currency) + unit price (line, USD, right
 *  axis) over the selected range — both frozen snapshot figures, ending at the
 *  live "now" point the hook appends. */
export function AssetHistoryChart({ history, currency }: Props) {
  const [range, setRange] = useState<TimeRange>("ALL")
  const [showPrice, setShowPrice] = useState(true)
  const [showCost, setShowCost] = useState(true)

  const data = useMemo(
    () =>
      filterHistoryByRange(history, range).map((p) => ({
        date: p.date,
        label: new Date(p.date).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        }),
        value: currency === "USD" ? p.valueUsd : p.valueTry,
        price: p.priceUsd,
        // Cost basis is USD-anchored; render it on the TRY axis via the
        // snapshot's own frozen rate, never today's.
        cost:
          p.costBasisUsd == null
            ? null
            : currency === "USD"
              ? p.costBasisUsd
              : p.costBasisUsd * p.usdTry,
      })),
    [history, range, currency],
  )

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-sm font-medium">Position Value</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setShowCost((v) => !v)}
              aria-pressed={showCost}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                showCost
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              Cost
            </button>
            <button
              onClick={() => setShowPrice((v) => !v)}
              aria-pressed={showPrice}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                showPrice
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              Price
            </button>
            <TimeRangeSelector value={range} onChange={setRange} />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {data.length < 2 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            Not enough history for this range — try a wider one, or take
            snapshots to build history.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={data}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="label" className="text-xs" tick={{ fontSize: 12 }} />
              <YAxis
                yAxisId="value"
                className="text-xs"
                tick={{ fontSize: 12 }}
                tickFormatter={(v: number) =>
                  currency === "USD"
                    ? `$${(v / 1000).toFixed(1)}k`
                    : `₺${(v / 1000).toFixed(0)}k`
                }
              />
              {showPrice && (
                <YAxis
                  yAxisId="price"
                  orientation="right"
                  className="text-xs"
                  tick={{ fontSize: 12 }}
                  domain={["auto", "auto"]}
                  tickFormatter={(v: number) => `$${v.toLocaleString()}`}
                />
              )}
              <Tooltip
                formatter={(value, name) => [
                  name === "Price"
                    ? formatCurrency(Number(value), "USD")
                    : formatCurrency(Number(value), currency),
                  String(name),
                ]}
                labelFormatter={(label) => String(label)}
              />
              <Area
                yAxisId="value"
                type="monotone"
                dataKey="value"
                name="Value"
                stroke="var(--primary)"
                fill="color-mix(in oklch, var(--primary) 12%, transparent)"
                strokeWidth={2}
              />
              {showCost && (
                <Line
                  yAxisId="value"
                  type="stepAfter"
                  dataKey="cost"
                  name="Cost basis"
                  stroke="var(--chart-4)"
                  strokeWidth={1.5}
                  dot={false}
                />
              )}
              {showPrice && (
                <Line
                  yAxisId="price"
                  type="monotone"
                  dataKey="price"
                  name="Price"
                  stroke="var(--muted-foreground)"
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                  dot={false}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  )
}
