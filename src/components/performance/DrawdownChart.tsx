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

interface Props {
  data: { date: string; drawdownPct: number }[]
}

export function DrawdownChart({ data }: Props) {
  const chartData = data.map((d) => ({
    ...d,
    label: new Date(d.date).toLocaleDateString("en-US", {
      month: "short",
      year: "2-digit",
    }),
  }))

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Drawdown</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis dataKey="label" className="text-xs" tick={{ fontSize: 11 }} />
            <YAxis
              className="text-xs"
              tick={{ fontSize: 11 }}
              tickFormatter={(v: number) => `${v.toFixed(0)}%`}
              domain={["auto", 0]}
            />
            <Tooltip
              formatter={(value) => [
                `${Number(value).toFixed(1)}%`,
                "Drawdown",
              ]}
            />
            <Area
              type="monotone"
              dataKey="drawdownPct"
              stroke="#ef4444"
              fill="#ef444420"
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
