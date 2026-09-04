import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { HintPopover } from "@/components/common/HintPopover"
import {
  MAINTENANCE_STATUS,
  MAINTENANCE_TEXT_CLASSES,
  VEHICLE_COPY,
} from "@/lib/constants/vehicle"
import type {
  LastServiceSummary,
  MaintenanceItemState,
  NextServiceBundle,
} from "@/lib/vehicle"
import {
  formatInterval,
  formatKm,
  formatVehicleDay,
  lastDonePhrase,
  projectionLabel,
  remainingPhrase,
} from "@/components/vehicle/display"

interface Props {
  /** The service-visit item's state; null when the car has no cadence set. */
  service: MaintenanceItemState | null
  bundle: NextServiceBundle
  /** What the last service covered, and what it skipped. */
  lastService: LastServiceSummary | null
  /** The closest item that will NOT be due by then — the answer to "so when
   *  is the next thing?", which is what an owner asks next when a service is
   *  otherwise plain. */
  nextUp: MaintenanceItemState | null
  /** Opens a cost entry with the service and these items already closing. */
  onLogService: (itemIds: string[]) => void
}

/**
 * The next service — the page's spine rather than a row in the plan.
 *
 * It exists because the question an owner has is not "what is due today" but
 * "when I go in at 157,000 km, what will be due by then?". That is a query
 * over a future point, and a flat list of items cannot answer it: an oil
 * change that comes due 2,000 km before the service belongs on the same
 * visit, and one that comes due 20,000 km after does not.
 *
 * Three parts, in the order they are useful: when the service is, what will
 * be due by then, and what to ask about because nobody knows. The last is the
 * honest counterpart to the middle one — an item with no history cannot be
 * scheduled, but it is exactly what to raise while the car is on the ramp,
 * which is Carfax's one genuinely good idea (its upcoming-work view is shaped
 * to be shown to the shop).
 */
export function NextServiceCard({
  service,
  bundle,
  lastService,
  nextUp,
  onLogService,
}: Props) {
  const closing = service
    ? [service.item.id, ...bundle.due.map((s) => s.item.id)]
    : bundle.due.map((s) => s.item.id)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5 text-sm font-medium">
          {VEHICLE_COPY.serviceHeading}
          {service && (
            <span className="font-normal text-muted-foreground">
              {" · "}
              {VEHICLE_COPY.serviceEvery.toLowerCase()}{" "}
              {formatInterval(
                service.item.interval_km,
                service.item.interval_months,
              )}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {service === null ||
        service.status === MAINTENANCE_STATUS.dormant ? (
          <p className="text-sm text-muted-foreground">
            {VEHICLE_COPY.serviceNone}
          </p>
        ) : (
          <>
            {/* When. The remaining figure leads, because that is the answer;
                the due point and the projected date qualify it. */}
            <div className="space-y-1">
              <p
                className={`text-xl font-semibold tabular-nums ${
                  MAINTENANCE_TEXT_CLASSES[service.status] ?? ""
                }`}
              >
                {service.status === MAINTENANCE_STATUS.unrecorded
                  ? VEHICLE_COPY.serviceNever
                  : remainingPhrase(service)}
              </p>
              {service.status !== MAINTENANCE_STATUS.unrecorded && (
                <p className="text-xs text-muted-foreground">
                  {service.dueKm !== null && (
                    <>
                      {VEHICLE_COPY.serviceDueAt} {formatKm(service.dueKm)}
                    </>
                  )}
                  {service.dueDate !== null && (
                    <>
                      {service.dueKm !== null
                        ? ` ${VEHICLE_COPY.serviceDueBy} `
                        : `${VEHICLE_COPY.serviceDueBy} `}
                      {formatVehicleDay(service.dueDate)}
                    </>
                  )}
                  {service.projectedDueDate !== null &&
                    service.dueKm !== null && (
                      <>
                        {" · "}
                        {VEHICLE_COPY.serviceProjected}{" "}
                        {projectionLabel(service.projectedDueDate)}
                      </>
                    )}
                  {" · "}
                  {lastDonePhrase(service)}
                </p>
              )}
            </div>

            {/* Where the conclusion comes from. "Last time was oil and
                filters, no fuel filter" is the sentence an owner says out
                loud, and the app should show its working rather than only its
                answer. */}
            {lastService && (
              <div className="space-y-1 border-t pt-3">
                <p className="text-xs font-medium">
                  {VEHICLE_COPY.lastServiceHeading}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatKm(lastService.km)},{" "}
                  {formatVehicleDay(lastService.date)} —{" "}
                  {lastService.covered.length > 0
                    ? `${VEHICLE_COPY.lastServiceCovered} ${lastService.covered.join(", ")}`
                    : VEHICLE_COPY.lastServiceNothing}
                  {lastService.skipped.length > 0 && (
                    <>
                      {" · "}
                      <span className="text-foreground">
                        {lastService.skipped.join(", ")}
                      </span>{" "}
                      {VEHICLE_COPY.lastServiceSkipped}
                    </>
                  )}
                </p>
              </div>
            )}

            {/* What will be due by then. */}
            <div className="space-y-2 border-t pt-3">
              <p className="text-xs font-medium">
                {VEHICLE_COPY.serviceBundleHeading}
              </p>
              {bundle.due.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {VEHICLE_COPY.serviceBundleEmpty}
                  {nextUp && (
                    <>
                      {" "}
                      {VEHICLE_COPY.nothingDue}{" "}
                      <span className="font-medium text-foreground">
                        {nextUp.item.name}
                      </span>
                      , {remainingPhrase(nextUp)}.
                    </>
                  )}
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {bundle.due.map((state) => (
                    <li
                      key={state.item.id}
                      className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-sm"
                    >
                      <span className="font-medium">{state.item.name}</span>
                      <span
                        className={`text-xs ${MAINTENANCE_TEXT_CLASSES[state.status]}`}
                      >
                        {/* Why it is on the list: its turn in the service
                            rhythm, or its own interval running out. The two
                            are different reasons and an owner deciding what
                            to authorise wants to know which. */}
                        {state.dueThisService
                          ? VEHICLE_COPY.serviceDueThisTime
                          : remainingPhrase(state)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Due around the same time, but not the servis's to do. Shown
                because it is genuinely due; kept out of the button's bundle
                because three payees on three dates are not one payment. */}
            {bundle.obligations.length > 0 && (
              <div className="space-y-2 border-t pt-3">
                <p className="text-xs font-medium">
                  {VEHICLE_COPY.serviceObligationsHeading}
                </p>
                <ul className="space-y-1.5">
                  {bundle.obligations.map((state) => (
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
              </div>
            )}

            {/* What nobody knows. Never mixed into the list above: an item
                with no history cannot be scheduled honestly. */}
            {bundle.unknown.length > 0 && (
              <div className="space-y-2 border-t pt-3">
                <div className="flex items-center gap-1">
                  <p className="text-xs font-medium">
                    {VEHICLE_COPY.serviceUnknownHeading}
                  </p>
                  <HintPopover
                    label={VEHICLE_COPY.serviceUnknownHeading}
                    text={VEHICLE_COPY.serviceUnknownHint}
                  />
                </div>
                <p className="text-sm text-muted-foreground">
                  {bundle.unknown.map((s) => s.item.name).join(", ")}
                </p>
              </div>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={() => onLogService(closing)}
            >
              {VEHICLE_COPY.logService}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  )
}
