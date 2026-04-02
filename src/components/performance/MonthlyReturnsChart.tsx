import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { MonthlyReturn } from "@/lib/performance"

interface Props {
  returns: MonthlyReturn[]
}

export function MonthlyReturnsChart({ returns }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Monthly Returns</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={returns}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis dataKey="label" className="text-xs" tick={{ fontSize: 11 }} />
            <YAxis
              className="text-xs"
              tick={{ fontSize: 11 }}
              tickFormatter={(v: number) => `${v.toFixed(0)}%`}
            />
            <Tooltip
              formatter={(value) => {
                const v = Number(value)
                return [
                  `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`,
                  "Return",
                ]
              }}
            />
            <Bar dataKey="returnPct" radius={[2, 2, 0, 0]}>
              {returns.map((entry, idx) => (
                <Cell
                  key={idx}
                  fill={entry.returnPct >= 0 ? "#22c55e" : "#ef4444"}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
