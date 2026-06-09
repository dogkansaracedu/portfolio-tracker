import { useState } from "react"
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts"
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

// Fiat currencies (outer ring, the fiat slice's children): a green→teal→cyan
// "cash family" ramp — cool enough to read as one block, distinct enough to
// tell the currencies apart (and friendlier to colour-vision deficiency than
// five near-identical greens).
const CURRENCY_COLORS: Record<string, string> = {
  TRY: "#16a34a", // green-600
  USD: "#0d9488", // teal-600
  EUR: "#0891b2", // cyan-600
  USDC: "#2dd4bf", // teal-400
  USDT: "#67e8f9", // cyan-300
}

const FALLBACK_COLOR = "#94a3b8" // slate-400
const DIM_OPACITY = 0.28

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
  const [activeKey, setActiveKey] = useState<string | null>(null)

  const totalValue = currency === "USD" ? totalValueUsd : totalValueTry
  const valueOf = (n: AllocationNode) =>
    currency === "USD" ? n.valueUsd : n.valueTry
  const fmt = (v: number) => obfuscate(formatCurrency(v, currency), obfuscated)

  // key → {label, value, pct} for the center read-out (any slice, at any depth).
  const meta = new Map<
    string,
    { label: string; value: number; percentage: number }
  >()
  // child → parent, so hovering a currency lights its fiat wedge and vice-versa.
  const parentOf = new Map<string, string>()
  for (const n of byAllocation) {
    meta.set(n.key, { label: labelFor(n.key), value: valueOf(n), percentage: n.percentage })
    for (const c of n.children ?? []) {
      meta.set(c.key, { label: labelFor(c.key), value: valueOf(c), percentage: c.percentage })
      parentOf.set(c.key, n.key)
    }
  }

  const isLit = (key: string) => {
    if (activeKey == null) return true
    if (key === activeKey) return true
    if (parentOf.get(activeKey) === key) return true // child hovered → light parent
    if (parentOf.get(key) === activeKey) return true // parent hovered → light children
    return false
  }
  const opacityFor = (key: string) => (isLit(key) ? 1 : DIM_OPACITY)

  // Inner ring = top-level categories. Outer ring = leaves in the SAME category
  // order (fiat expands into its currencies; every other category passes through
  // as a single segment), so each leaf sits radially outside its parent and the
  // ring boundaries line up. Both start at 12 o'clock and sweep clockwise.
  const inner = byAllocation.map((n) => ({ key: n.key, value: valueOf(n) }))
  const outer = byAllocation.flatMap((n) =>
    (n.children && n.children.length > 0 ? n.children : [n]).map((leaf) => ({
      key: leaf.key,
      value: valueOf(leaf),
    })),
  )
  const hasFiatSplit = byAllocation.some((n) => (n.children?.length ?? 0) > 0)

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

  const active = activeKey ? meta.get(activeKey) : null
  const centerValue = active ? active.value : totalValue

  return (
    <Card className="flex flex-col">
      <CardHeader>
        <CardTitle>Allocation</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col items-center gap-3">
        <div className="relative h-[220px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={inner}
                cx="50%"
                cy="50%"
                innerRadius={45}
                outerRadius={66}
                startAngle={90}
                endAngle={-270}
                dataKey="value"
                paddingAngle={0}
                stroke="none"
                isAnimationActive={false}
                onMouseEnter={(_, i) => setActiveKey(inner[i].key)}
                onMouseLeave={() => setActiveKey(null)}
              >
                {inner.map((entry) => (
                  <Cell
                    key={`inner-${entry.key}`}
                    fill={colorFor(entry.key)}
                    fillOpacity={opacityFor(entry.key)}
                  />
                ))}
              </Pie>
              <Pie
                data={outer}
                cx="50%"
                cy="50%"
                innerRadius={70}
                outerRadius={92}
                startAngle={90}
                endAngle={-270}
                dataKey="value"
                paddingAngle={0}
                stroke="none"
                isAnimationActive={false}
                onMouseEnter={(_, i) => setActiveKey(outer[i].key)}
                onMouseLeave={() => setActiveKey(null)}
              >
                {outer.map((entry) => (
                  <Cell
                    key={`outer-${entry.key}`}
                    fill={colorFor(entry.key)}
                    fillOpacity={opacityFor(entry.key)}
                  />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
              {active ? active.label : "Total"}
            </span>
            <span className="text-base font-semibold tabular-nums">
              {fmt(centerValue)}
            </span>
            {active && (
              <span className="text-xs text-muted-foreground tabular-nums">
                {active.percentage.toFixed(1)}%
              </span>
            )}
          </div>
        </div>

        {hasFiatSplit && (
          <p className="text-[11px] text-muted-foreground">
            Inner: asset class · Outer: fiat by currency
          </p>
        )}

        <div className="flex w-full flex-col gap-0.5 tabular-nums">
          {byAllocation.map((node) => (
            <div key={node.key}>
              <LegendRow
                color={colorFor(node.key)}
                label={labelFor(node.key)}
                value={fmt(valueOf(node))}
                pct={node.percentage}
                active={activeKey === node.key}
                onEnter={() => setActiveKey(node.key)}
                onLeave={() => setActiveKey(null)}
              />
              {node.children?.map((child) => (
                <LegendRow
                  key={child.key}
                  color={colorFor(child.key)}
                  label={labelFor(child.key)}
                  value={fmt(valueOf(child))}
                  pct={child.percentage}
                  active={activeKey === child.key}
                  onEnter={() => setActiveKey(child.key)}
                  onLeave={() => setActiveKey(null)}
                  child
                />
              ))}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

interface LegendRowProps {
  color: string
  label: string
  value: string
  pct: number
  active: boolean
  onEnter: () => void
  onLeave: () => void
  child?: boolean
}

/** One legend line: color dot · label (left), value + percent (right). Hovering
 *  it drives the same `activeKey` the chart does, so legend and donut highlight
 *  together. */
function LegendRow({
  color,
  label,
  value,
  pct,
  active,
  onEnter,
  onLeave,
  child = false,
}: LegendRowProps) {
  return (
    <div
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      className={`flex cursor-default items-center justify-between gap-2 rounded px-1.5 py-0.5 transition-colors ${
        active ? "bg-muted" : ""
      } ${child ? "pl-5" : ""}`}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <span
          className={`inline-block shrink-0 rounded-full ${child ? "h-2.5 w-2.5" : "h-3 w-3"}`}
          style={{ backgroundColor: color }}
        />
        <span
          className={`truncate ${child ? "text-xs text-muted-foreground" : "text-sm"}`}
        >
          {label}
        </span>
      </div>
      <div
        className={`flex shrink-0 items-center gap-3 ${child ? "text-xs" : "text-sm"}`}
      >
        <span className="text-muted-foreground">{value}</span>
        <span className="w-12 text-right font-medium">{pct.toFixed(1)}%</span>
      </div>
    </div>
  )
}
