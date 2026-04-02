import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatCurrency } from "@/lib/prices"
import type { Snapshot } from "@/types/database"

interface Props {
  snapshots: Snapshot[]
  currency: "USD" | "TRY"
}

export function PortfolioValueChart({ snapshots, currency }: Props) {
  const data = snapshots.map((s) => ({
    date: s.snapshot_date,
    label: new Date(s.snapshot_date).toLocaleDateString("en-US", {
      month: "short",
      year: "2-digit",
    }),
    value: currency === "USD" ? (s.total_usd ?? 0) : (s.total_try ?? 0),
  }))

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Portfolio Value</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={data}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis
              dataKey="label"
              className="text-xs"
              tick={{ fontSize: 12 }}
            />
            <YAxis
              className="text-xs"
              tick={{ fontSize: 12 }}
              tickFormatter={(v: number) =>
                currency === "USD" ? `$${(v / 1000).toFixed(0)}k` : `₺${(v / 1000).toFixed(0)}k`
              }
            />
            <Tooltip
              formatter={(value) => [
                formatCurrency(Number(value), currency),
                "Value",
              ]}
              labelFormatter={(label) => String(label)}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke="hsl(var(--primary))"
              fill="hsl(var(--primary) / 0.1)"
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
