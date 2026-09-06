import { Suspense, useState } from "react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { RetirementTrackingChart } from "@/components/charts/LazyChart"
import RouteSkeleton from "@/components/layout/RouteSkeleton"
import { bn } from "@/lib/config"
import type { PlanTracking } from "@/lib/retirement"
import {
  GLOSSARY_HINTS,
  TRACKING_CONTRIBUTION_CAPTION,
  TRACKING_DIALOG_COPY,
  TRACKING_LABELS,
  TRACKING_PLAN_START_CAPTION,
  TRACKING_START_PROMPT,
} from "./constants"
import {
  describeGap,
  formatAge,
  formatMonthsDuration,
  formatPlanDay,
  type RetirementDisplay,
} from "./display"
import { StatTile } from "./RetirementControls"

/**
 * The body of "am I on track?". Two states, and the difference between them is
 * whether the scenario has a plan start at all: without one there is no
 * yardstick, so the question offers to freeze one instead of inventing a gap;
 * with one it shows the contribution side of the comparison (the value side is
 * the tab's own headline answer) over the actual-vs-plan chart.
 *
 * Every figure comes from the `PlanTracking` the tab already computed, so the
 * strip, the headline and the chart can never disagree — and both buttons here
 * destroy the current yardstick, so neither acts on a bare click.
 */

interface Props {
  /** Null = the active scenario has never been started. */
  tracking: PlanTracking | null
  display: RetirementDisplay
  saving: boolean
  /** False while the live portfolio total is still loading — a start then
   *  would freeze $0 as the yardstick, so the button waits. */
  liveValueReady: boolean
  error: string | null
  onStartPlan: () => void
  onClearPlanStart: () => void
}

/** Which confirmation is open; null = none. */
type Confirmation = "restart" | "stop"

export function PlanTrackingMode({
  tracking,
  display,
  saving,
  liveValueReady,
  error,
  onStartPlan,
  onClearPlanStart,
}: Props) {
  const [confirming, setConfirming] = useState<Confirmation | null>(null)

  if (!tracking) {
    return (
      <Card>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {TRACKING_START_PROMPT}
          </p>
          <div>
            <Button onClick={onStartPlan} disabled={saving || !liveValueReady}>
              {TRACKING_LABELS.startPlan}
            </Button>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>
    )
  }

  const contributionGap = describeGap(tracking.contributionGapUsd, display)
  const frozen = tracking.inputs

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Card size="sm">
          <CardContent>
            <StatTile
              label={TRACKING_LABELS.contributionGap}
              hint={GLOSSARY_HINTS.contributionGap}
              value={contributionGap.value}
              valueClassName={contributionGap.className}
              caption={TRACKING_CONTRIBUTION_CAPTION(
                display.money(tracking.actualContributionsUsd),
                display.money(tracking.plannedContributionsUsd),
                formatMonthsDuration(tracking.monthsCovered),
              )}
            />
          </CardContent>
        </Card>

        <Card size="sm">
          <CardContent>
            <StatTile
              label={TRACKING_LABELS.planStart}
              hint={GLOSSARY_HINTS.planStart}
              value={formatPlanDay(tracking.startedAt)}
              caption={TRACKING_PLAN_START_CAPTION(
                // A past amount, so the real view deflates it against today
                // with a negative offset — the same clock the chart runs on.
                display.money(
                  tracking.startingAmountUsd,
                  -tracking.elapsedMonths,
                ),
                display.money(bn(frozen.monthlyContributionUsd)),
                formatAge(frozen.retirementAge),
              )}
            />
          </CardContent>
        </Card>
      </div>

      <Suspense fallback={<RouteSkeleton />}>
        <RetirementTrackingChart tracking={tracking} display={display} />
      </Suspense>

      <div className="flex flex-wrap items-center gap-1.5">
        <Button
          variant="outline"
          size="sm"
          disabled={saving}
          onClick={() => setConfirming("restart")}
        >
          {TRACKING_LABELS.restartPlan}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={saving}
          onClick={() => setConfirming("stop")}
        >
          {TRACKING_LABELS.stopTracking}
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* One dialog per action rather than one with switched copy: the state
          that says WHICH is also the state that closes it, so a shared dialog
          would rewrite its own heading mid-exit-animation. */}
      <ConfirmDialog
        open={confirming === "restart"}
        onClose={() => setConfirming(null)}
        copy={TRACKING_DIALOG_COPY.restart}
        onConfirm={onStartPlan}
      />
      <ConfirmDialog
        open={confirming === "stop"}
        onClose={() => setConfirming(null)}
        copy={TRACKING_DIALOG_COPY.stop}
        onConfirm={onClearPlanStart}
        destructive
      />
    </div>
  )
}

function ConfirmDialog({
  open,
  onClose,
  copy,
  onConfirm,
  destructive = false,
}: {
  open: boolean
  onClose: () => void
  copy: { title: string; description: string; confirm: string }
  onConfirm: () => void
  destructive?: boolean
}) {
  return (
    <AlertDialog open={open} onOpenChange={(next) => !next && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{copy.title}</AlertDialogTitle>
          <AlertDialogDescription>{copy.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{TRACKING_DIALOG_COPY.cancel}</AlertDialogCancel>
          <AlertDialogAction
            variant={destructive ? "destructive" : "default"}
            onClick={onConfirm}
          >
            {copy.confirm}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
