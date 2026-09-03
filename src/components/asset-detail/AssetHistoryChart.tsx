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
import { Toggle } from "@/components/ui/toggle"
import { formatCompactCurrency, formatCurrency } from "@/lib/prices"
import { DEFAULT_CURRENCY } from "@/lib/constants/currencies"
import { MEDIA_QUERY, useMediaQuery } from "@/hooks/useMediaQuery"
import {
  filterHistoryByRange,
  type AssetHistoryPoint,
} from "@/lib/portfolio/assetHistory"
import type { TimeRange } from "@/lib/performance"

/** Series names — also the tooltip labels, so they never drift. */
const COST_SERIES_LABEL = "Cost"
const PRICE_SERIES_LABEL = "Price"

/** Each series' own stroke, shared by its line and its toggle's dot: the
 *  toggles double as the chart's key, so three series on two axes never go
 *  unnamed (the same chip-as-legend idiom the dashboard hero uses). */
const COST_SERIES_COLOR = "var(--chart-4)"
const PRICE_SERIES_COLOR = "var(--muted-foreground)"

function SeriesDot({ color }: { color: string }) {
  return (
    <span
      aria-hidden
      className="mr-1 inline-block size-2 shrink-0 rounded-full"
      style={{ backgroundColor: color }}
    />
  )
}

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
  // Recharts sizes its plot area in JS, so the axis budget cannot come from a
  // Tailwind variant.
  const isWide = useMediaQuery(MEDIA_QUERY.md)

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
          {/* Cost / Price are independent on-off series toggles — separate
              `Toggle`s, visibly distinct from the pick-one range group beside
              them (which is the app's segmented control). */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1">
              <Toggle
                variant="outline"
                size="sm"
                pressed={showCost}
                onPressedChange={setShowCost}
              >
                <SeriesDot color={COST_SERIES_COLOR} />
                {COST_SERIES_LABEL}
              </Toggle>
              <Toggle
                variant="outline"
                size="sm"
                pressed={showPrice}
                onPressedChange={setShowPrice}
              >
                <SeriesDot color={PRICE_SERIES_COLOR} />
                {PRICE_SERIES_LABEL}
              </Toggle>
            </div>
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
              <XAxis
                dataKey="label"
                className="text-xs"
                tick={{ fontSize: 12 }}
                minTickGap={48}
              />
              <YAxis
                yAxisId="value"
                className="text-xs"
                tick={{ fontSize: 12 }}
                width={isWide ? undefined : 44}
                tickFormatter={(v: number) =>
                  formatCompactCurrency(v, currency)
                }
              />
              {showPrice && (
                // Below `md` the two axes cost more than half the card width,
                // leaving the value history — the reason to open this page on a
                // phone — about 200px. The price axis keeps its scale but drops
                // its labels there; the tooltip still carries Price.
                <YAxis
                  yAxisId="price"
                  orientation="right"
                  className="text-xs"
                  tick={isWide ? { fontSize: 12 } : false}
                  width={isWide ? undefined : 0}
                  axisLine={isWide}
                  domain={["auto", "auto"]}
                  tickFormatter={(v: number) =>
                    formatCompactCurrency(v, DEFAULT_CURRENCY)
                  }
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
                  stroke={COST_SERIES_COLOR}
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
                  stroke={PRICE_SERIES_COLOR}
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
