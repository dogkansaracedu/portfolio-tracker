/**
 * Render-side wording for Component 17 — kept out of the components (which
 * carry no copy) and out of `lib/vehicle` (which stays pure), the same split
 * Component 16 uses.
 */

import { DISPLAY_LOCALE } from "@/lib/constants/app"
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

/** "2 Sep 26" — the narrow-screen form, so a table row keeps room for its
 *  actions. Same locale, fewer characters. */
export function formatShortDay(day: string | null | undefined): string {
  if (!day) return NO_DATA
  const ms = Date.parse(`${day}T00:00:00Z`)
  if (Number.isNaN(ms)) return NO_DATA
  return new Date(ms).toLocaleDateString(DISPLAY_LOCALE, {
    year: "2-digit",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  })
}

export function statusLabel(status: MaintenanceStatus): string {
  return MAINTENANCE_STATUS_LABELS[status]
}

/** A month count in the coarsest honest unit: "6 months", "1 year",
 *  "2 years", "4 years 6 months". One convention, so a plan does not read
 *  "Every 1 year" on one row and "Every 48 months" on the next. */
export function formatMonthSpan(months: number): string {
  const whole = Math.round(months)
  if (whole < 12) return whole === 1 ? "1 month" : `${whole} months`
  const years = Math.floor(whole / 12)
  const rest = whole % 12
  const yearPart = years === 1 ? "1 year" : `${years} years`
  if (rest === 0) return yearPart
  return `${yearPart} ${rest === 1 ? "1 month" : `${rest} months`}`
}

/**
 * An item's interval, in the dimensions it actually tracks: "10,000 km / 1
 * year", "90,000 km", "2 years". Returns `""` for a dormant item — the caller
 * words that case itself, because "Every not tracked" is not a sentence.
 */
export function formatInterval(
  intervalKm: number | null,
  intervalMonths: number | null,
): string {
  const parts: string[] = []
  if (intervalKm !== null) parts.push(formatKm(Number(intervalKm)))
  if (intervalMonths !== null) parts.push(formatMonthSpan(Number(intervalMonths)))
  return parts.join(" / ")
}

/** A day count in the coarsest honest unit. Days up to a quarter, then months
 *  and years — "1,691 days left" is a figure nobody can act on. */
export function formatDaySpan(days: number): string {
  const whole = Math.abs(Math.round(days))
  if (whole <= 90) return whole === 1 ? "1 day" : `${whole} days`
  return formatMonthSpan(whole / (365.25 / 12))
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
      return `${formatDaySpan(daysRemaining)} over`
    }
    return statusLabel(MAINTENANCE_STATUS.overdue)
  }

  const options: string[] = []
  if (kmRemaining !== null) options.push(`${formatKm(kmRemaining)} left`)
  if (daysRemaining !== null) {
    options.push(`${formatDaySpan(daysRemaining)} left`)
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

/** Just the figure — "7.0" — so a card can put the unit on its own line and
 *  a narrow column never breaks "L/100km" across three lines. */
export function formatConsumptionValue(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return NO_DATA
  return value.toFixed(1)
}

/** "7.0 L/100km" — the inline form, for prose and tooltips. */
export function formatConsumption(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return NO_DATA
  return `${formatConsumptionValue(value)} ${FUEL_ECONOMY_UNIT}`
}

/** "44.0 L" */
export function formatLitres(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return NO_DATA
  return `${value.toFixed(1)} L`
}

/** The ownership span, in the same unit convention as every other span. */
export function formatMonths(months: number): string {
  if (!Number.isFinite(months) || months <= 0) return NO_DATA
  if (months < 1) return "under a month"
  return formatMonthSpan(months)
}

/** The percentage on an interval bar, coarse on purpose (it is a rate). */
export function formatUsedPct(pct: number | null): string {
  if (pct === null || !Number.isFinite(pct)) return NO_DATA
  return `${pct.toFixed(DECIMALS.percentageRate)}%`
}

/** The date a projection lands on. */
export function projectionLabel(day: string | null): string {
  return formatVehicleDay(day)
}
