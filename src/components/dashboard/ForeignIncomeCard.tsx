import { useEffect } from "react"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatCurrency } from "@/lib/prices"
import { useForeignIncomeYtd } from "@/hooks/useForeignIncomeYtd"
import { cn } from "@/lib/utils"

export default function ForeignIncomeCard() {
  const { ytdTry, threshold, year, pct, crossed, loading } =
    useForeignIncomeYtd()

  // One-shot per tax year per browser: nudge the first time the threshold is
  // crossed, then remember so we don't re-toast on every render/visit.
  useEffect(() => {
    if (loading || !crossed) return
    const key = `foreign-income-notified-${year}`
    if (localStorage.getItem(key)) return
    localStorage.setItem(key, "1")
    toast.warning(`Foreign income over ₺${threshold.toLocaleString("tr-TR")}`, {
      description:
        `Your ${year} foreign dividends + interest crossed the declaration ` +
        `threshold. It now has to go on next March's beyanname.`,
    })
  }, [loading, crossed, year, threshold])

  const barColor = crossed
    ? "bg-red-500"
    : pct >= 80
      ? "bg-amber-500"
      : "bg-primary"

  const isProminent = crossed || pct >= 80
  const progressNow = Math.min(Math.max(Math.round(pct), 0), 100)
  const progressMeter = (
    <div
      className="h-2 w-full overflow-hidden rounded-full bg-muted"
      role="progressbar"
      aria-label={`Foreign income declaration threshold progress for ${year}`}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={progressNow}
      aria-valuetext={`${pct.toFixed(0)}% of the declaration threshold`}
    >
      <div
        className={`h-full rounded-full transition-all ${barColor}`}
        style={{ width: `${Math.min(Math.max(pct, 0), 100)}%` }}
      />
    </div>
  )

  if (!isProminent) {
    return (
      <Card size="sm" className="gap-0">
        <CardContent className="space-y-2">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium">Foreign income · {year}</p>
              <p className="text-xs text-muted-foreground">
                Foreign dividends + interest; PPF and other at-source-taxed
                income excluded
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-sm font-semibold tabular-nums">
                {formatCurrency(ytdTry, "TRY")}
              </p>
              <p className="text-xs text-muted-foreground">
                {pct.toFixed(0)}% of {formatCurrency(threshold, "TRY")}
              </p>
            </div>
          </div>
          {progressMeter}
        </CardContent>
      </Card>
    )
  }

  return (
    <Card
      className={cn(
        "flex flex-col",
        crossed
          ? "bg-red-500/5 ring-red-500/40"
          : "bg-amber-500/5 ring-amber-500/40",
      )}
    >
      <CardHeader className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>Foreign income · {year}</CardTitle>
          <span
            className={cn(
              "rounded-full px-2 py-1 text-xs font-medium",
              crossed
                ? "bg-red-500/15 text-red-700 dark:text-red-300"
                : "bg-amber-500/15 text-amber-700 dark:text-amber-300",
            )}
            role="status"
          >
            {crossed ? "Declaration required" : "Approaching threshold"}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex items-baseline justify-between">
          <span className="text-lg font-semibold tabular-nums">
            {formatCurrency(ytdTry, "TRY")}
          </span>
          <span className="text-sm text-muted-foreground">
            / {formatCurrency(threshold, "TRY")} ({pct.toFixed(0)}%)
          </span>
        </div>
        {progressMeter}
        <p className="text-xs text-muted-foreground">
          Foreign (non-TRY) dividends + interest count toward the{" "}
          {formatCurrency(threshold, "TRY")} declaration threshold. PPF and other
          at-source-taxed income don't count.
        </p>
      </CardContent>
    </Card>
  )
}
