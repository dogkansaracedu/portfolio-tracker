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
import type { AllocationNode } from "@/lib/dashboard/allocation"

// Asset-class slices (inner ring + the outer ring's pass-through segments).
const CATEGORY_COLORS: Record<string, string> = {
  fiat: "#22c55e", // green-500 — the whole cash wedge
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

// Fiat currencies (outer ring, the fiat slice's children): a green ramp
// dark→light, so the whole arc still reads as one "cash" block while the
// individual currencies stay distinguishable.
const CURRENCY_COLORS: Record<string, string> = {
  TRY: "#166534", // green-800
  USD: "#16a34a", // green-600
  EUR: "#22c55e", // green-500
  USDC: "#4ade80", // green-400
  USDT: "#86efac", // green-300
}

const FALLBACK_COLOR = "#94a3b8" // slate-400

const labelFor = (key: string) => CATEGORY_LABELS[key] ?? key
const colorFor = (key: string) =>
  CATEGORY_COLORS[key] ?? CURRENCY_COLORS[key] ?? FALLBACK_COLOR

interface AllocationChartProps {
  byAllocation: AllocationNode[]
  totalValueUsd: number
  totalValueTry: number
}

export default function AllocationChart({
  byAllocation,
  totalValueUsd,
  totalValueTry,
}: AllocationChartProps) {
  const { currency, obfuscated } = useDisplayCurrency()

  const totalValue = currency === "USD" ? totalValueUsd : totalValueTry
  const valueOf = (n: AllocationNode) =>
    currency === "USD" ? n.valueUsd : n.valueTry

  // Inner ring = top-level categories. Outer ring = leaves in the SAME category
  // order (fiat expands into its currencies; every other category passes through
  // as a single segment), so each leaf sits radially outside its parent and the
  // ring boundaries line up. paddingAngle is 0 on both so they stay aligned.
  const inner = byAllocation.map((n) => ({
    name: labelFor(n.key),
    value: valueOf(n),
    color: colorFor(n.key),
  }))
  const outer = byAllocation.flatMap((n) =>
    (n.children && n.children.length > 0 ? n.children : [n]).map((leaf) => ({
      name: labelFor(leaf.key),
      value: valueOf(leaf),
      color: colorFor(leaf.key),
    })),
  )

  if (inner.length === 0) {
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
                data={inner}
                cx="50%"
                cy="50%"
                innerRadius={45}
                outerRadius={66}
                dataKey="value"
                paddingAngle={0}
                stroke="none"
              >
                {inner.map((entry, index) => (
                  <Cell key={`inner-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Pie
                data={outer}
                cx="50%"
                cy="50%"
                innerRadius={70}
                outerRadius={92}
                dataKey="value"
                paddingAngle={0}
                stroke="none"
              >
                {outer.map((entry, index) => (
                  <Cell key={`outer-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value) => formatCurrency(Number(value), currency)}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="text-sm font-semibold">
              {obfuscate(formatCurrency(totalValue, currency), obfuscated)}
            </span>
          </div>
        </div>

        <div className="flex w-full flex-col gap-2">
          {byAllocation.map((node) => (
            <div key={node.key}>
              <div className="flex items-center gap-1.5 text-sm">
                <span
                  className="inline-block h-3 w-3 rounded-full"
                  style={{ backgroundColor: colorFor(node.key) }}
                />
                <span className="text-muted-foreground">
                  {labelFor(node.key)}
                </span>
                <span className="font-medium">
                  {node.percentage.toFixed(1)}%
                </span>
              </div>
              {node.children && node.children.length > 0 && (
                <div className="ml-5 mt-1 flex flex-wrap gap-x-3 gap-y-1">
                  {node.children.map((child) => (
                    <div
                      key={child.key}
                      className="flex items-center gap-1.5 text-xs"
                    >
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: colorFor(child.key) }}
                      />
                      <span className="text-muted-foreground">
                        {labelFor(child.key)}
                      </span>
                      <span className="font-medium">
                        {child.percentage.toFixed(1)}%
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
