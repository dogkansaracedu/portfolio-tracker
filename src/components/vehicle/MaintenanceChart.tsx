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
                    {status !== MAINTENANCE_STATUS.ok &&
                      status !== MAINTENANCE_STATUS.dormant && (
                        <Badge
                          variant="outline"
                          className={MAINTENANCE_TEXT_CLASSES[status]}
                        >
                          {statusLabel(status)}
                        </Badge>
                      )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Every {formatInterval(item.interval_km, item.interval_months)}
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
                  {/* The projected date only earns its place when distance is
                      what falls due first — otherwise it just repeats the due
                      date already printed above. */}
                  {state.projectedDueDate !== null &&
                    state.dueKm !== null &&
                    (state.dueDate === null ||
                      state.projectedDueDate < state.dueDate) && (
                      <>
                        {" · "}
                        {VEHICLE_COPY.projectedFrom} pace:{" "}
                        {projectionLabel(state.projectedDueDate)}
                      </>
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
export function DueSummary({ due, nextUp }: DueProps) {
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
        )}
      </CardContent>
    </Card>
  )
}
