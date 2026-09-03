import { useState } from "react"
import { Link } from "react-router"
import { TriangleAlert, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useVehicleAlerts, type VehicleAlerts as Alerts } from "@/hooks/useVehicle"
import {
  MAINTENANCE_STATUS,
  VEHICLE_ALERT_CLASSES,
  VEHICLE_ALERT_DISMISS_KEY,
  VEHICLE_ALERT_NAMED_LIMIT,
  VEHICLE_COPY,
  VEHICLE_ROUTE,
} from "@/lib/constants/vehicle"
import { cn } from "@/lib/utils"
import { remainingPhrase } from "@/components/vehicle/display"

type Row = Alerts["overdue"][number]

/**
 * The dashboard maintenance warnings: one compact banner per loud status,
 * mirroring `InterestAlerts` exactly — same two levels, same named-then-
 * summarized list, same session-scoped dismissal, same tones.
 *
 * Dismissal dies with the tab on purpose: this is a nudge, not a task list, so
 * it must return on the next visit if the work still hasn't been done. The
 * flag is read once in a `useState` initializer so it survives navigation.
 *
 * It reads `useVehicleAlerts`, which needs no exchange rates and no P&L — the
 * banner costs nothing beyond the rows the provider already holds.
 */
export function VehicleAlerts() {
  const { overdue, dueSoon } = useVehicleAlerts()

  const [dismissed, setDismissed] = useState(() => {
    try {
      return sessionStorage.getItem(VEHICLE_ALERT_DISMISS_KEY) === "true"
    } catch {
      // Storage can be unavailable (private mode, site data blocked); showing
      // the nudge is the right answer either way.
      return false
    }
  })

  if (dismissed || (overdue.length === 0 && dueSoon.length === 0)) return null

  function dismiss() {
    try {
      sessionStorage.setItem(VEHICLE_ALERT_DISMISS_KEY, "true")
    } catch {
      /* not persisted; the dismissal still applies this render */
    }
    setDismissed(true)
  }

  return (
    <div className="space-y-2">
      <AlertBanner
        title={VEHICLE_COPY.alertOverdueTitle}
        tone={MAINTENANCE_STATUS.overdue}
        rows={overdue}
        onDismiss={dismiss}
      />
      <AlertBanner
        title={VEHICLE_COPY.alertDueSoonTitle}
        tone={MAINTENANCE_STATUS.dueSoon}
        rows={dueSoon}
        onDismiss={dismiss}
      />
    </div>
  )
}

interface AlertBannerProps {
  title: string
  tone: keyof typeof VEHICLE_ALERT_CLASSES
  rows: Row[]
  onDismiss: () => void
}

function AlertBanner({ title, tone, rows, onDismiss }: AlertBannerProps) {
  if (rows.length === 0) return null

  const named = rows.slice(0, VEHICLE_ALERT_NAMED_LIMIT)
  const rest = rows.length - named.length

  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-md border p-3 text-sm",
        VEHICLE_ALERT_CLASSES[tone],
      )}
    >
      <TriangleAlert className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="font-medium">{title}</p>
        <ul className="space-y-0.5">
          {named.map(({ vehicle, state }) => (
            <li key={`${vehicle.id}-${state.item.id}`}>
              {/* The whole row is the tap target, not the sentence's own 16px
                  of text — same rule the interest banner follows. */}
              <Link
                to={VEHICLE_ROUTE}
                className="flex items-center underline-offset-4 hover:underline max-sm:min-h-10"
              >
                {vehicle.name}: {state.item.name} — {remainingPhrase(state)}
              </Link>
            </li>
          ))}
          {rest > 0 && (
            <li className="opacity-80">
              {VEHICLE_COPY.alertAndMorePrefix}
              {rest}
              {VEHICLE_COPY.alertAndMoreSuffix}
            </li>
          )}
        </ul>
      </div>
      <Button
        variant="ghost"
        size="icon-xs"
        onClick={onDismiss}
        aria-label={VEHICLE_COPY.alertDismiss}
      >
        <X className="size-3.5" />
      </Button>
    </div>
  )
}
