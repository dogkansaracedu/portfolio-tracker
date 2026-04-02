import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useDisplayCurrency } from "@/contexts/DisplayContext"
import { formatCurrency, obfuscate } from "@/lib/prices"
import type { CategoryAllocation } from "@/hooks/useDashboard"

const CATEGORY_COLORS: Record<string, string> = {
  fiat: "#22c55e",
  crypto: "#f97316",
  gold: "#eab308",
  stock_us: "#3b82f6",
  stock_bist: "#ef4444",
}

const CATEGORY_LABELS: Record<string, string> = {
  fiat: "Fiat",
  crypto: "Crypto",
  gold: "Gold",
  stock_us: "US Stocks",
  stock_bist: "BIST Stocks",
}

interface AllocationChartProps {
  byCategory: CategoryAllocation[]
  totalValueUsd: number
  totalValueTry: number
}

export default function AllocationChart({
  byCategory,
  totalValueUsd,
  totalValueTry,
}: AllocationChartProps) {
  const { currency, obfuscated } = useDisplayCurrency()

  const totalValue = currency === "USD" ? totalValueUsd : totalValueTry

  const data = byCategory.map((c) => ({
    name: CATEGORY_LABELS[c.category] ?? c.category,
    value: currency === "USD" ? c.valueUsd : c.valueTry,
    percentage: c.percentage,
    color: CATEGORY_COLORS[c.category] ?? "#94a3b8",
  }))

  if (data.length === 0) {
    return (
      <Card className="flex flex-col">
        <CardHeader>
          <CardTitle>Allocation</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-1 items-center justify-center">
          <p className="text-muted-foreground">No assets to display.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="flex flex-col">
      <CardHeader>
        <CardTitle>Allocation</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col items-center gap-4">
        <div className="relative h-[220px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={90}
                dataKey="value"
                paddingAngle={2}
                stroke="none"
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value) =>
                  formatCurrency(Number(value), currency)
                }
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="text-sm font-semibold">
              {obfuscate(formatCurrency(totalValue, currency), obfuscated)}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap justify-center gap-x-4 gap-y-2">
          {data.map((entry) => (
            <div
              key={entry.name}
              className="flex items-center gap-1.5 text-sm"
            >
              <span
                className="inline-block h-3 w-3 rounded-full"
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-muted-foreground">{entry.name}</span>
              <span className="font-medium">
                {entry.percentage.toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
