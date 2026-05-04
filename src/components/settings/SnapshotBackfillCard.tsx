import { useState } from "react"
import { Loader2, History, AlertTriangle } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  triggerBackfillSnapshots,
  type BackfillGranularity,
  type BackfillResult,
} from "@/lib/queries/snapshots"
import { cn } from "@/lib/utils"

const GRANULARITY_OPTIONS: {
  value: BackfillGranularity
  label: string
  hint: string
}[] = [
  {
    value: "monthly",
    label: "Monthly + last 30 days daily",
    hint: "One snapshot for the 1st of every month, plus one snapshot for each of the last 30 days. Recommended so the 1D / 1W ranges look populated.",
  },
  {
    value: "tx_dates",
    label: "Each transaction day",
    hint: "Only snapshots for days a transaction occurred. More precise, but more rows.",
  },
]

export function SnapshotBackfillCard() {
  const [granularity, setGranularity] = useState<BackfillGranularity>("monthly")
  const [overwrite, setOverwrite] = useState(false)
  const [running, setRunning] = useState(false)
  const [lastResult, setLastResult] = useState<BackfillResult | null>(null)

  const handleRun = async () => {
    setRunning(true)
    try {
      const result = await triggerBackfillSnapshots({ granularity, overwrite })
      setLastResult(result)

      const errCount = result.errors?.length ?? 0
      if (result.snapshots_written > 0) {
        toast.success(
          `Wrote ${result.snapshots_written} snapshot${result.snapshots_written === 1 ? "" : "s"} (${result.target_count} target date${result.target_count === 1 ? "" : "s"})`,
          {
            description:
              errCount > 0
                ? `${errCount} price source warning${errCount === 1 ? "" : "s"} — details below.`
                : undefined,
          },
        )
      } else if (errCount > 0) {
        toast.error("Backfill completed but no snapshots were written", {
          description: result.errors?.[0],
        })
      } else {
        toast.message("Backfill complete — no new snapshots to write.")
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      toast.error("Backfill failed", { description: message })
    } finally {
      setRunning(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="h-4 w-4" />
          Historical Snapshots
        </CardTitle>
        <CardDescription>
          Enter any missing transactions first, then run. Pulls historical
          prices from CoinGecko and Yahoo — takes ~30–90 sec.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* Granularity */}
        <div className="space-y-2">
          <p className="text-sm font-medium">Granularity</p>
          <div className="flex flex-wrap gap-2">
            {GRANULARITY_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                disabled={running}
                onClick={() => setGranularity(opt.value)}
                className={cn(
                  "rounded-md border px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                  granularity === opt.value
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-background text-muted-foreground hover:bg-muted",
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {GRANULARITY_OPTIONS.find((o) => o.value === granularity)?.hint}
          </p>
        </div>

        {/* Overwrite toggle */}
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={overwrite}
            disabled={running}
            onChange={(e) => setOverwrite(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-border accent-primary"
          />
          <div className="space-y-0.5">
            <p className="text-sm font-medium leading-none">
              Overwrite existing snapshots
            </p>
            <p className="text-xs text-muted-foreground">
              Existing snapshots on target dates are deleted and rewritten.
              When off, conflicts upsert and only total / breakdown are
              updated.
            </p>
          </div>
        </label>

        {/* Action */}
        <div className="flex items-center justify-between gap-3 border-t pt-4">
          <p className="text-xs text-muted-foreground">
            {overwrite ? "Existing snapshots will be deleted." : "Conflicts will be upserted."}
          </p>
          <Button onClick={handleRun} disabled={running} size="sm">
            {running ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <History className="mr-2 h-4 w-4" />
            )}
            {running ? "Running…" : "Run backfill"}
          </Button>
        </div>

        {/* Last result */}
        {lastResult && (
          <div className="space-y-2 rounded-md border bg-muted/30 p-3 text-xs">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="Target dates" value={String(lastResult.target_count)} />
              <Stat
                label="Snapshots written"
                value={String(lastResult.snapshots_written)}
              />
              <Stat
                label="Tickers priced"
                value={String(lastResult.tickers_priced.length)}
              />
              <Stat
                label="Errors"
                value={String(lastResult.errors?.length ?? 0)}
              />
            </div>

            {lastResult.errors && lastResult.errors.length > 0 && (
              <div className="space-y-1 rounded-md border border-amber-500/40 bg-amber-50 p-2 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                <p className="flex items-center gap-1 font-medium">
                  <AlertTriangle className="h-3 w-3" />
                  Warnings
                </p>
                <ul className="list-inside list-disc space-y-0.5">
                  {lastResult.errors.slice(0, 5).map((e, i) => (
                    <li key={i} className="break-all">
                      {e}
                    </li>
                  ))}
                  {lastResult.errors.length > 5 && (
                    <li>… and {lastResult.errors.length - 5} more</li>
                  )}
                </ul>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="text-sm font-semibold">{value}</p>
    </div>
  )
}
