import { useEffect } from "react"
import { ArrowRight } from "lucide-react"
import { Link } from "react-router"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatCurrency } from "@/lib/prices"
import { useForeignIncomeYtd } from "@/hooks/useForeignIncomeYtd"
import { cn } from "@/lib/utils"

export default function ForeignIncomeCard() {
  const { ytdTry, threshold, year, pct, crossed, loading, error } =
    useForeignIncomeYtd()

  // One-shot per tax year per browser: nudge the first time the threshold is
  // crossed, then remember so we don't re-toast on every render/visit.
  useEffect(() => {
    if (loading || !crossed || threshold === null) return
    const key = `foreign-income-notified-${year}`
    if (localStorage.getItem(key)) return
    localStorage.setItem(key, "1")
    toast.warning(`Foreign income over ₺${threshold.toLocaleString("tr-TR")}`, {
      description:
        `Your ${year} foreign dividends + interest crossed the declaration ` +
        `threshold. Review whether it needs to be included in your filing.`,
    })
  }, [loading, crossed, year, threshold])

  const thresholdPct = pct ?? 0
  const barColor = crossed
    ? "bg-red-500"
    : thresholdPct >= 80
      ? "bg-amber-500"
      : "bg-primary"

  const isProminent = crossed || thresholdPct >= 80 || error !== null
  const progressNow = Math.min(Math.max(Math.round(thresholdPct), 0), 100)
  const progressMeter = (
    <div
      className="h-2 w-full overflow-hidden rounded-full bg-muted"
      role="progressbar"
      aria-label={`Foreign income declaration threshold progress for ${year}`}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={progressNow}
      aria-valuetext={
        pct === null
          ? "Threshold not configured for this year"
          : `${pct.toFixed(0)}% of the declaration threshold`
      }
    >
      <div
        className={`h-full rounded-full transition-all ${barColor}`}
        style={{ width: `${Math.min(Math.max(thresholdPct, 0), 100)}%` }}
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
                {threshold === null || pct === null
                  ? "Threshold not configured"
                  : `${pct.toFixed(0)}% of ${formatCurrency(threshold, "TRY")}`}
              </p>
              <Link
                to="/foreign-income"
                className="mt-1 inline-flex min-h-10 items-center gap-1 text-xs font-medium text-primary underline-offset-4 hover:underline"
              >
                Reconcile
                <ArrowRight className="size-3" />
              </Link>
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
            {error
              ? "Needs attention"
              : crossed
                ? "Threshold crossed"
                : "Approaching threshold"}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex items-baseline justify-between">
          <span className="text-lg font-semibold tabular-nums">
            {formatCurrency(ytdTry, "TRY")}
          </span>
          <span className="text-sm text-muted-foreground">
            {threshold === null || pct === null
              ? " · threshold not configured"
              : ` / ${formatCurrency(threshold, "TRY")} (${pct.toFixed(0)}%)`}
          </span>
        </div>
        {progressMeter}
        <p className="text-xs text-muted-foreground">
          {error
            ? "The total could not be verified because a required data source failed to load."
            : threshold === null
              ? "The legal threshold for this tax year has not been configured. Review the recorded payments directly."
              : `Foreign (non-TRY) dividends + interest are compared with the ${formatCurrency(threshold, "TRY")} threshold. PPF and other at-source-taxed income are excluded.`}
        </p>
        <Link
          to="/foreign-income"
          className="inline-flex min-h-10 items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          Reconcile payments
          <ArrowRight className="size-3.5" />
        </Link>
      </CardContent>
    </Card>
  )
}
