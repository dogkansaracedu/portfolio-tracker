import { ArrowRight } from "lucide-react"
import { Link } from "react-router"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { useDisplayCurrency } from "@/contexts/DisplayContext"
import { formatMoney } from "@/lib/prices"

export interface AllocationBreakdownRow {
  /** The row's visible name; also its key, so it must be unique in the list. */
  label: string
  color: string
  valueUsd: number
  valueTry: number
  percentage: number
}

interface Props {
  title: string
  description?: string
  actionLabel: string
  actionTo: string
  /** Shown in place of the list when there is nothing to break down. */
  emptyText: string
  rows: AllocationBreakdownRow[]
}

/**
 * A dashboard breakdown card: one labelled, coloured bar per slice, with its
 * share and its value in the display currency.
 *
 * Both breakdowns (currencies, platforms) are this component — they differ only
 * in where the colour comes from, which is their own business, so each stays a
 * mapper over its own allocation type.
 */
export function AllocationBreakdown({
  title,
  description,
  actionLabel,
  actionTo,
  emptyText,
  rows,
}: Props) {
  const { currency, obfuscated } = useDisplayCurrency()

  if (rows.length === 0) {
    return (
      <Card className="flex flex-col">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
        <CardContent className="flex flex-1 items-center justify-center">
          <p className="text-muted-foreground">{emptyText}</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="flex flex-col">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle>{title}</CardTitle>
            {description && <CardDescription>{description}</CardDescription>}
          </div>
          <Link
            to={actionTo}
            className="group inline-flex min-h-10 shrink-0 items-center gap-1 rounded-md px-2 text-xs font-medium text-primary hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {actionLabel}
            <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.map((row) => {
          const value = currency === "USD" ? row.valueUsd : row.valueTry
          return (
            <div key={row.label} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span
                    className="inline-block h-3 w-3 rounded-full"
                    style={{ backgroundColor: row.color }}
                  />
                  <span className="font-medium">{row.label}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">
                    {row.percentage.toFixed(1)}%
                  </span>
                  <span className="font-medium">
                    {formatMoney(value, currency, obfuscated)}
                  </span>
                </div>
              </div>
              {/* A sliver still reads as "present but tiny" rather than empty. */}
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.max(row.percentage, 1)}%`,
                    backgroundColor: row.color,
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
