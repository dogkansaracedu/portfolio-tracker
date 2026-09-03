/**
 * Render-side wording for Component 17 — kept out of the components (which
 * carry no copy) and out of `lib/vehicle` (which stays pure), the same split
 * Component 16 uses.
 */

import { DISPLAY_LOCALE, NOW_LABEL } from "@/lib/constants/app"
import { DECIMALS } from "@/lib/config"
import {
  FUEL_ECONOMY_UNIT,
  MAINTENANCE_STATUS,
  MAINTENANCE_STATUS_LABELS,
  VEHICLE_COPY,
  type MaintenanceStatus,
} from "@/lib/constants/vehicle"
import type { MaintenanceItemState } from "@/lib/vehicle"

/** Placeholder for a figure that is genuinely unknown — never a fake zero. */
export const NO_DATA = "—"

const numberFormat = new Intl.NumberFormat(DISPLAY_LOCALE, {
  maximumFractionDigits: 0,
})

/** "142,500 km" */
export function formatKm(km: number | null | undefined): string {
  if (km === null || km === undefined || !Number.isFinite(km)) return NO_DATA
  return `${numberFormat.format(Math.round(km))} km`
}

/** A YYYY-MM-DD day in the app's display locale; "" stays empty. */
export function formatVehicleDay(day: string | null | undefined): string {
  if (!day) return NO_DATA
  const ms = Date.parse(`${day}T00:00:00Z`)
  if (Number.isNaN(ms)) return NO_DATA
  return new Date(ms).toLocaleDateString(DISPLAY_LOCALE, {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  })
}

export function statusLabel(status: MaintenanceStatus): string {
  return MAINTENANCE_STATUS_LABELS[status]
}

/**
 * An item's interval, in the dimensions it actually tracks: "10,000 km / 12
 * months", "90,000 km", "24 months". A dormant item says so rather than
 * printing an empty interval.
 */
export function formatInterval(
  intervalKm: number | null,
  intervalMonths: number | null,
): string {
  const parts: string[] = []
  if (intervalKm !== null) parts.push(formatKm(Number(intervalKm)))
  if (intervalMonths !== null) {
    const months = Number(intervalMonths)
    parts.push(months === 12 ? "1 year" : `${months} months`)
  }
  return parts.length > 0
    ? parts.join(" / ")
    : MAINTENANCE_STATUS_LABELS[MAINTENANCE_STATUS.dormant]
}

/**
 * What is left to run, in whichever dimension is closest — the "remaining
 * count" form Fuelly uses, which is the cheapest thing to read on a phone.
 * Overdue reads as overdue, not as a negative remainder.
 */
export function remainingPhrase(state: MaintenanceItemState): string {
  if (state.status === MAINTENANCE_STATUS.dormant) return NO_DATA

  const { kmRemaining, daysRemaining } = state

  if (state.status === MAINTENANCE_STATUS.overdue) {
    // Say by how much, in the dimension that actually went past.
    if (kmRemaining !== null && kmRemaining < 0) {
      return `${formatKm(Math.abs(kmRemaining))} over`
    }
    if (daysRemaining !== null && daysRemaining < 0) {
      const days = Math.abs(Math.round(daysRemaining))
      return days === 1 ? "1 day over" : `${days} days over`
    }
    return statusLabel(MAINTENANCE_STATUS.overdue)
  }

  const options: string[] = []
  if (kmRemaining !== null) options.push(`${formatKm(kmRemaining)} left`)
  if (daysRemaining !== null) {
    const days = Math.round(daysRemaining)
    options.push(days === 1 ? "1 day left" : `${days} days left`)
  }
  // Whichever comes first is the one worth showing.
  if (options.length === 0) return NO_DATA
  if (options.length === 1) return options[0]
  const kmFirst =
    kmRemaining !== null &&
    daysRemaining !== null &&
    state.dueDate !== null &&
    state.projectedDueDate !== null &&
    state.projectedDueDate < state.dueDate
  return kmFirst ? options[0] : options[1]
}

/** "at 220,000 km", "by 12 Mar 2031", or both when both are tracked. */
export function duePhrase(state: MaintenanceItemState): string {
  const parts: string[] = []
  if (state.dueKm !== null) parts.push(`at ${formatKm(state.dueKm)}`)
  if (state.dueDate !== null) parts.push(`by ${formatVehicleDay(state.dueDate)}`)
  return parts.length > 0 ? parts.join(" or ") : NO_DATA
}

/** "Last done at 130,000 km, 10 Mar 2025" — or that it never was. */
export function lastDonePhrase(state: MaintenanceItemState): string {
  if (state.anchoredAtPurchase) {
    return `${VEHICLE_COPY.neverDone} — measured from purchase`
  }
  return `${formatKm(state.lastDoneKm)}, ${formatVehicleDay(state.lastDoneDate)}`
}

/** "7.0 L/100km" */
export function formatConsumption(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return NO_DATA
  return `${value.toFixed(1)} ${FUEL_ECONOMY_UNIT}`
}

/** "44.0 L" */
export function formatLitres(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return NO_DATA
  return `${value.toFixed(1)} L`
}

/** "21.1 months" / "1 month" — the ownership span. */
export function formatMonths(months: number): string {
  if (!Number.isFinite(months) || months <= 0) return NO_DATA
  if (months < 1) return "under a month"
  const rounded = months.toFixed(months < 24 ? 1 : 0)
  return `${rounded} months`
}

/** The percentage on an interval bar, coarse on purpose (it is a rate). */
export function formatUsedPct(pct: number | null): string {
  if (pct === null || !Number.isFinite(pct)) return NO_DATA
  return `${pct.toFixed(DECIMALS.percentageRate)}%`
}

/** The date a projection lands on, or "now" when it already has. */
export function projectionLabel(day: string | null): string {
  if (!day) return NO_DATA
  return formatVehicleDay(day) === NO_DATA ? NOW_LABEL : formatVehicleDay(day)
}
