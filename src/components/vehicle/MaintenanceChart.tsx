import { Pencil, Trash2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { HintPopover } from "@/components/common/HintPopover"
import {
  MAINTENANCE_BAR_CLASSES,
  MAINTENANCE_GROUPS,
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

/** Whether an item's distance-projected date says anything the due phrase
 *  beside it does not: it must be in the future, and distance must be the
 *  dimension that falls due first. */
function showProjection(state: MaintenanceItemState): boolean {
  const { projectedDueDate, dueDate, dueKm, status } = state
  if (projectedDueDate === null || dueKm === null) return false
  if (status === MAINTENANCE_STATUS.overdue) return false
  return dueDate === null || projectedDueDate < dueDate
}

/**
 * The maintenance chart: one row per plan item, each with a bar showing how
 * much of its interval is used, **grouped** into every-service consumables,
 * long-term parts, and the legal obligations.
 *
 * The bar IS the chart — a meter per item rather than a Recharts figure,
 * because the quantity shown is a single 0–100% reading per row and a dense
 * list of meters answers "what's close?" in one glance. It reuses the exact
 * meter idiom `ForeignIncomeCard` established (`h-2 rounded-full bg-muted`
 * with a tinted inner bar), and the same three-step ladder — `bg-primary` →
 * `amber-500` at the warning threshold → `red-500` once past. Status colours,
 * never `gainLossClass`: maintenance is neither a gain nor a loss, the rule
 * Components 15 and 16 already follow for rates.
 *
 * Groups are divider headings inside one card, not three cards: fourteen rows
 * split across three cards would triple the page's chrome, and the groups are
 * read together. Rows arrive loudest-first from `maintenancePlanState`, so
 * within a group what needs doing is on top; grouping never buries an overdue
 * obligation, because `DueSummary` sits above the plan and ignores groups.
 */
export function MaintenanceChart({ plan, onEdit, onDelete }: Props) {
  if (plan.length === 0) return null

  const known = new Set<string>(MAINTENANCE_GROUPS.map((g) => g.value))
  // An item whose group is not one of the three — a value added to the column
  // but not yet to MAINTENANCE_GROUPS — would otherwise vanish from the plan.
  const orphans = plan.filter((s) => !known.has(s.item.item_group))

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
      {/* The groups become COLUMNS from `lg` up. Fourteen rows stacked in one
          column is most of a desktop screen for a card whose whole job is to
          be scanned at a glance, and the groups are independent lists — so
          they sit beside each other rather than below.
          `items-start` keeps the uneven 4/6/4 columns from stretching to the
          tallest. Measured: at 1440 (352px columns) the card is 812px against
          2,972px single-column, every row a uniform 108px.
          It starts at `lg`, NOT `md`: two-up at 768 gives 208px columns, where
          the interval caption wraps to three or four lines and the hint icon
          falls onto a line of its own — measured 444px TALLER than one column.
          A breakpoint that makes the page longer is worse than no breakpoint. */}
      <CardContent className="grid items-start gap-x-8 gap-y-5 lg:grid-cols-2 xl:grid-cols-3">
        {MAINTENANCE_GROUPS.map((group) => {
          const rows = plan.filter((s) => s.item.item_group === group.value)
          if (rows.length === 0) return null
          return (
            <section key={group.value} className="space-y-3">
              <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {group.label}
              </h3>
              {rows.map((state) => (
                <ItemRow
                  key={state.item.id}
                  state={state}
                  onEdit={onEdit}
                  onDelete={onDelete}
                />
              ))}
            </section>
          )
        })}
        {orphans.length > 0 && (
          <section className="space-y-3">
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {VEHICLE_COPY.ungroupedHeading}
            </h3>
            {orphans.map((state) => (
              <ItemRow
                key={state.item.id}
                state={state}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            ))}
          </section>
        )}
      </CardContent>
    </Card>
  )
}

interface RowProps {
  state: MaintenanceItemState
  onEdit: (state: MaintenanceItemState) => void
  onDelete: (state: MaintenanceItemState) => void
}

/**
 * One plan item: name, status, interval caption, meter, and what is left.
 *
 * Everything below the meter is a **single left-aligned flow**, and the row
 * carries a bottom rule. Both are about ownership: the due point used to be
 * right-aligned across from the remaining figure, which in a 352px column put
 * it nearer the *next* item's name than its own, and a reader could not tell
 * whose "next due" they were looking at. Alignment plus a divider settles it
 * without labelling every line.
 */
function ItemRow({ state, onEdit, onDelete }: RowProps) {
  const { item, status, intervalUsedPct } = state
  const pct = intervalUsedPct ?? 0

  return (
    <div className="space-y-1.5 border-b pb-3 last:border-b-0 last:pb-0">
      {/* Name + status on one line, actions pinned right. The name wraps
          rather than truncating: "Timing belt (triger kayışı)" must stay
          readable on a phone. */}
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
            {/* The sourced default notes carry the guidance that matters
                ("delete this row if yours has a chain"), so the row has to
                surface them somewhere. */}
            {item.note && <HintPopover label={item.name} text={item.note} />}
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
        {/* Icon-only actions keep the row height down; both stay comfortably
            tappable at size-8. */}
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
            aria-label={`${VEHICLE_COPY.delete}: ${item.name}`}
            onClick={() => onDelete(state)}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>

      {/* The meter. Width is capped at 100% so an overdue item fills the bar
          rather than overflowing it; the figure beside it still reads past 100
          so "how far past" stays visible. */}
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full transition-all ${MAINTENANCE_BAR_CLASSES[status]}`}
          style={{ width: `${Math.min(Math.max(pct, 0), 100)}%` }}
        />
      </div>

      {/* One left-aligned sentence, wrapping as needed: what's left, how much
          of the interval that is, where it falls due, and — only when distance
          falls due first and the projection is still ahead — roughly when.
          The remaining figure keeps its prominence through colour rather than
          position, so nothing needs to be pushed to an edge.

          The projection is folded in here rather than given its own line: it
          earns a mention only for a km-first item (on an overdue row a past
          "projected" date contradicts the due point, and when time governs it
          repeats the date already printed), and for a km-ONLY item like the
          coolant it is the single thing that puts a date on it at all. */}
      <p className="text-xs">
        <span className={MAINTENANCE_TEXT_CLASSES[status]}>
          {remainingPhrase(state)}
        </span>
        <span className="text-muted-foreground">
          {intervalUsedPct !== null && (
            <>
              {" · "}
              {formatUsedPct(intervalUsedPct)} used
            </>
          )}
          {" · "}
          {VEHICLE_COPY.nextDue} {duePhrase(state)}
          {showProjection(state) && (
            <>
              {" · "}
              {VEHICLE_COPY.projectedFrom}{" "}
              {projectionLabel(state.projectedDueDate)}
            </>
          )}
        </span>
      </p>
    </div>
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
 * for exactly this and tells users to show it to their shop. It deliberately
 * ignores groups: what is due is due, whether it is an oil change or a kasko
 * renewal. When nothing is due it names the closest item instead of rendering
 * an empty box, so the card always says something true.
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
                  <span
                    className={`text-xs ${MAINTENANCE_TEXT_CLASSES[state.status]}`}
                  >
                    {remainingPhrase(state)}
                  </span>
                </li>
              ))}
            </ul>
            {/* One visit closes the whole bundle, so the action pre-ticks every
                item listed above rather than making the owner find them in a
                fourteen-row checkbox list. */}
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
