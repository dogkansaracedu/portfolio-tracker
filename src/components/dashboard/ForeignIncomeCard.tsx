import { useEffect } from "react"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatCurrency } from "@/lib/prices"
import { useForeignIncomeYtd } from "@/hooks/useForeignIncomeYtd"

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

  return (
    <Card className="flex flex-col">
      <CardHeader>
        <CardTitle>Foreign income · {year}</CardTitle>
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
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full rounded-full transition-all ${barColor}`}
            style={{ width: `${Math.min(pct, 100)}%` }}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Foreign (non-TRY) dividends + interest count toward the{" "}
          {formatCurrency(threshold, "TRY")} declaration threshold. PPF and other
          at-source-taxed income don't count.
        </p>
      </CardContent>
    </Card>
  )
}
