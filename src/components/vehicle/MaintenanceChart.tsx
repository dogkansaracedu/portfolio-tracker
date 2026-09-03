import { Pencil, Trash2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { HintPopover } from "@/components/common/HintPopover"
import {
  MAINTENANCE_BAR_CLASSES,
  MAINTENANCE_STATUS,
  MAINTENANCE_TEXT_CLASSES,
  VEHICLE_COPY,
} from "@/lib/constants/vehicle"
import type { MaintenanceItemState } from "@/lib/vehicle"
import {
  NO_DATA,
  duePhrase,
  formatInterval,
  formatUsedPct,
  lastDonePhrase,
  projectionLabel,
  remainingPhrase,
  statusLabel,
} from "@/components/vehicle/display"

interface Props {
  plan: MaintenanceItemState[]
  onEdit: (state: MaintenanceItemState) => void
  onDelete: (state: MaintenanceItemState) => void
}

/**
 * The maintenance chart: one row per plan item, each with a bar showing how
 * much of its interval is used.
 *
 * The bar IS the chart — a meter per item rather than a Recharts figure,
 * because the quantity being shown is a single 0–100% reading per row and a
 * dense table of meters answers "what's close?" in one glance. It reuses the
 * exact meter idiom `ForeignIncomeCard` established (`h-2 rounded-full
 * bg-muted` with a tinted inner bar), and the same three-step ladder —
 * `bg-primary` → `amber-500` at the warning threshold → `red-500` once past.
 * Status colours, never `gainLossClass`: maintenance is neither a gain nor a
 * loss, the rule Components 15 and 16 already follow for rates.
 *
 * Rows arrive loudest-first from `maintenancePlanState`, so what needs doing
 * is at the top without the table needing to sort anything itself.
 */
/** Whether an item's distance-projected date says anything the due phrase
 *  beside it does not: it must be in the future, and distance must be the
 *  dimension that falls due first. */
function showProjection(state: MaintenanceItemState): boolean {
  const { projectedDueDate, dueDate, dueKm, status } = state
  if (projectedDueDate === null || dueKm === null) return false
  if (status === MAINTENANCE_STATUS.overdue) return false
  return dueDate === null || projectedDueDate < dueDate
}

export function MaintenanceChart({ plan, onEdit, onDelete }: Props) {
  if (plan.length === 0) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5 text-sm font-medium">
          {VEHICLE_COPY.planHeading}
          <HintPopover
            label={VEHICLE_COPY.planHeading}
            text={VEHICLE_COPY.seedPlanHint}
          />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {plan.map((state) => {
          const { item, status, intervalUsedPct } = state
          const pct = intervalUsedPct ?? 0
          return (
            <div key={item.id} className="space-y-1.5">
              {/* Name + status on one line, actions pinned right. The name
                  wraps rather than truncating: "Drive belt (triger kayışı)"
                  must stay readable on a phone. */}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-sm font-medium">{item.name}</span>
                    {status !== MAINTENANCE_STATUS.ok && (
                      <Badge
                        variant="outline"
                        className={MAINTENANCE_TEXT_CLASSES[status]}
                      >
                        {statusLabel(status)}
                      </Badge>
                    )}
                    {/* The sourced default notes carry the guidance that
                        matters ("delete this row if yours has a chain"), so
                        the row has to surface them somewhere. */}
                    {item.note && (
                      <HintPopover label={item.name} text={item.note} />
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {status === MAINTENANCE_STATUS.dormant
                      ? VEHICLE_COPY.dormantCaption
                      : `${VEHICLE_COPY.everyPrefix} ${formatInterval(
                          item.interval_km,
                          item.interval_months,
                        )}`}
                    {" · "}
                    {VEHICLE_COPY.lastDone.toLowerCase()} {lastDonePhrase(state)}
                  </p>
                </div>
                {/* Icon-only actions keep the row height down; both stay
                    comfortably tappable at size-8. */}
                <div className="flex shrink-0 gap-0.5">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    aria-label={`${VEHICLE_COPY.editItem}: ${item.name}`}
                    onClick={() => onEdit(state)}
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 text-muted-foreground"
                    aria-label={`Delete ${item.name}`}
                    onClick={() => onDelete(state)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>

              {/* The meter. Width is capped at 100% so an overdue item fills
                  the bar rather than overflowing it; the figure beside it
                  still reads past 100 so "how far past" stays visible. */}
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full transition-all ${MAINTENANCE_BAR_CLASSES[status]}`}
                  style={{ width: `${Math.min(Math.max(pct, 0), 100)}%` }}
                />
              </div>

              {/* Reading order on a narrow screen: what's left, then where it
                  falls due. Both wrap onto their own line under `sm`. */}
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-xs">
                <span className={MAINTENANCE_TEXT_CLASSES[status]}>
                  {remainingPhrase(state)}
                  {intervalUsedPct !== null && (
                    <span className="text-muted-foreground">
                      {" · "}
                      {formatUsedPct(intervalUsedPct)} used
                    </span>
                  )}
                </span>
                <span className="text-muted-foreground">
                  {VEHICLE_COPY.nextDue} {duePhrase(state)}
                  {/* Earns its place only when the projection is in the future
                      AND distance is what falls due first: on an overdue row a
                      past "projected" date contradicts the due point beside
                      it, and when time governs it just repeats the date
                      already printed. Hidden below `sm`, where it was the one
                      line that wrapped on every distance-tracked row. */}
                  {showProjection(state) && (
                    <span className="max-sm:hidden">
                      {" · "}
                      {VEHICLE_COPY.projectedFrom} {projectionLabel(state.projectedDueDate)}
                    </span>
                  )}
                </span>
              </div>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}

interface DueProps {
  due: MaintenanceItemState[]
  nextUp: MaintenanceItemState | null
  /** Opens the cost form with these items already ticked. */
  onLogVisit: (itemIds: string[]) => void
}

/**
 * "Due at your next service" — the bundle to hand the servis.
 *
 * This exists because the real workflow is one visit that closes several
 * items, not one reminder at a time; Carfax shapes its own upcoming-work view
 * for exactly this and tells users to show it to their shop. When nothing is
 * due it names the closest item instead of rendering an empty box, so the card
 * always says something true.
 */
export function DueSummary({ due, nextUp, onLogVisit }: DueProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5 text-sm font-medium">
          {VEHICLE_COPY.dueNowHeading}
          <HintPopover
            label={VEHICLE_COPY.dueNowHeading}
            text={VEHICLE_COPY.dueNowHint}
          />
        </CardTitle>
      </CardHeader>
      <CardContent>
        {due.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {nextUp ? (
              <>
                {VEHICLE_COPY.nothingDue}{" "}
                <span className="font-medium text-foreground">
                  {nextUp.item.name}
                </span>
                , {remainingPhrase(nextUp)}.
              </>
            ) : (
              NO_DATA
            )}
          </p>
        ) : (
          <>
            <ul className="space-y-2">
            {due.map((state) => (
              <li
                key={state.item.id}
                className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-sm"
              >
                <span className="font-medium">{state.item.name}</span>
                <span className={`text-xs ${MAINTENANCE_TEXT_CLASSES[state.status]}`}>
                  {remainingPhrase(state)}
                </span>
              </li>
            ))}
            </ul>
            {/* One visit closes the whole bundle, so the action pre-ticks every
                item listed above rather than making the owner find them in a
                13-row checkbox list. */}
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => onLogVisit(due.map((s) => s.item.id))}
            >
              {VEHICLE_COPY.logVisit}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  )
}
