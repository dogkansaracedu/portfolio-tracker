/**
 * The periodic maintenance engine (Component 17): where the odometer is now,
 * how fast it moves, and — for each item in the plan — when it is next due.
 *
 * Pure. Nothing here reads context, storage or the clock except through an
 * injected `today`, so every rule below is directly testable.
 *
 * Two rules carry the design:
 *
 *  1. **Anchor on the last time the item was actually done.** "Belt changed at
 *     130,000 km" plus a 90,000 km interval means due at 220,000 — the app
 *     does that arithmetic, never the owner. Drivvo gets this backwards: with
 *     no history it asks for a *future* target odometer, which one reviewer
 *     put exactly right — "Why should I calculate the service interval if I
 *     choose something like 8000km?"
 *  2. **An interval resets only for the items a cost entry explicitly names.**
 *     Fuelly shipped a fix for the opposite behaviour (counters that reset
 *     themselves on reaching zero whether or not the work was done), which is
 *     the bug that makes a maintenance tracker lie.
 */

import { bn, BN_ZERO, homeDayIso } from "@/lib/config"
import { daysBetweenIsoDays, isoDayToUtcMs } from "@/lib/campaigns"
import {
  MAINTENANCE_STATUS,
  MAINTENANCE_STATUS_RANK,
  MAINTENANCE_DUE_SOON_PCT,
  MAINTENANCE_OVERDUE_PCT,
  MAINTENANCE_WARNING_STATUSES,
  OBLIGATIONS_GROUP,
  SERVICE_VISIT_KIND,
  type MaintenanceStatus,
} from "@/lib/constants/vehicle"
import type {
  Vehicle,
  VehicleCostEntry,
  VehicleMaintenanceItem,
} from "@/types/database"

// ─── Day arithmetic ─────────────────────────────────────────────────
// `daysBetweenIsoDays` / `isoDayToUtcMs` come from `lib/campaigns` — the app's
// one implementation of "whole days between two YYYY-MM-DD values", which
// Component 16 already reuses rather than restating. The two helpers below are
// the parts that module doesn't carry.

/** `day` shifted by whole days, as `YYYY-MM-DD`. `""` for an unreadable day. */
export function addDaysIso(day: string, days: number): string {
  const ms = isoDayToUtcMs(day)
  if (Number.isNaN(ms)) return ""
  return new Date(ms + days * 86_400_000).toISOString().slice(0, 10)
}

/**
 * `day` shifted by whole calendar months, clamped to the end of the target
 * month so 31 January + 1 month is 28/29 February rather than spilling into
 * March. Month intervals are calendar intervals: a 24-month muayene falls on
 * the same day of the month two years on, not 730 days later.
 */
export function addMonthsIso(day: string, months: number): string {
  const ms = isoDayToUtcMs(day)
  if (Number.isNaN(ms)) return ""
  const d = new Date(ms)
  const targetMonth = d.getUTCMonth() + months
  const shifted = new Date(
    Date.UTC(d.getUTCFullYear(), targetMonth, 1, 0, 0, 0, 0),
  )
  // Days in the target month, so a day-of-month that doesn't exist clamps.
  const lastDay = new Date(
    Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, 0),
  ).getUTCDate()
  shifted.setUTCDate(Math.min(d.getUTCDate(), lastDay))
  return shifted.toISOString().slice(0, 10)
}

// ─── Odometer ───────────────────────────────────────────────────────

export interface OdometerReading {
  km: number
  date: string
}

export interface OdometerView {
  /** The freshest reading's distance — the app's "current km". */
  km: number
  /** The date that reading was taken. */
  asOf: string
  /**
   * Average distance per day across the whole recorded span. Null when there
   * is only one reading, a zero-length span, or no forward movement — never a
   * fabricated zero, because a zero here would silently project every
   * distance-based item as due infinitely far away.
   */
  kmPerDay: number | null
  /** Every reading, ascending by date. */
  readings: OdometerReading[]
  /**
   * True when some reading is lower than one on an earlier date. Surfaced as
   * a warning, never a block: Carfax hard-rejects a lower reading ("odometer
   * reading cannot be lower than the last reported odometer") even on manual
   * entries, which makes a single typo permanent and backfilling history
   * impossible. A warning the owner can act on beats a wall.
   */
  hasBackwardsReading: boolean
}

/**
 * Every odometer reading known for a vehicle, ascending by date: the purchase
 * baseline, the vehicle's own hand-entered reading, and any reading carried by
 * a cost entry.
 *
 * There is deliberately no separate readings table. Drivvo needs a whole
 * record type ("Reading") for the "I drove but bought nothing" case; the
 * vehicle's own `odometer` / `odometer_at` pair covers it in two columns.
 */
export function odometerReadings(
  vehicle: Vehicle,
  entries: VehicleCostEntry[],
): OdometerReading[] {
  const readings: OdometerReading[] = [
    { km: Number(vehicle.purchase_odometer ?? 0), date: vehicle.purchased_on },
  ]

  if (vehicle.odometer !== null && vehicle.odometer_at) {
    readings.push({ km: Number(vehicle.odometer), date: vehicle.odometer_at })
  }

  for (const entry of entries) {
    if (entry.odometer === null || entry.odometer === undefined) continue
    readings.push({ km: Number(entry.odometer), date: entry.date })
  }

  // Date ascending; a tie resolves to the higher reading, which is the one
  // that happened later on that day.
  return readings.sort((a, b) =>
    a.date === b.date ? a.km - b.km : a.date < b.date ? -1 : 1,
  )
}

/**
 * Where the odometer is and how fast it is moving.
 *
 * `kmPerDay` is measured across the **whole** recorded span rather than the
 * most recent pair, so one long trip or one quiet fortnight cannot swing every
 * projected due date. Carfax does the same thing in spirit — it models "your
 * estimated odometer reading" forward from observed driving, and users rate it
 * as the feature that makes distance-based reminders arrive as calendar
 * warnings.
 */
export function odometerView(
  vehicle: Vehicle,
  entries: VehicleCostEntry[],
): OdometerView {
  const readings = odometerReadings(vehicle, entries)
  const first = readings[0]
  const last = readings[readings.length - 1]

  let hasBackwardsReading = false
  for (let i = 1; i < readings.length; i++) {
    if (readings[i].km < readings[i - 1].km) {
      hasBackwardsReading = true
      break
    }
  }

  // The current reading is the freshest by date, but a backwards log would
  // otherwise make "current" go down; take the highest reading on the latest
  // date's side by using the max of the tail.
  const km = readings.reduce((max, r) => (r.km > max ? r.km : max), first.km)

  const spanDays = daysBetweenIsoDays(first.date, last.date)
  const spanKm = bn(last.km).minus(bn(first.km))
  const kmPerDay =
    readings.length > 1 && spanDays > 0 && spanKm.gt(BN_ZERO)
      ? spanKm.div(bn(spanDays)).toNumber()
      : null

  return { km, asOf: last.date, kmPerDay, readings, hasBackwardsReading }
}

// ─── Per-item state ─────────────────────────────────────────────────

export interface MaintenanceItemState {
  item: VehicleMaintenanceItem
  /** Odometer at the last recorded completion. */
  lastDoneKm: number
  /** Date of the last recorded completion. */
  lastDoneDate: string
  /**
   * True when nothing has ever closed this item, so its interval is measured
   * from the purchase instead. Shown to the owner — for a used car it is a
   * floor, not a fact, and pretending otherwise is how a schedule quietly
   * misleads.
   */
  anchoredAtPurchase: boolean
  /** Odometer the item falls due at. Null when distance is not tracked. */
  dueKm: number | null
  /** Date the item falls due on. Null when time is not tracked. */
  dueDate: string | null
  /** Distance still to run. Negative once overdue. Null when untracked. */
  kmRemaining: number | null
  /** Days still to run. Negative once overdue. Null when untracked. */
  daysRemaining: number | null
  /**
   * How much of the interval is used, as a percentage, taken from whichever
   * tracked dimension is furthest along. Null only for a dormant item.
   */
  intervalUsedPct: number | null
  status: MaintenanceStatus
  /**
   * The earlier of the two due points expressed as a date: the time-based due
   * date, and the date the distance is projected to be reached at the current
   * average. Null when neither can be dated (no time interval, and no usable
   * km/day).
   */
  projectedDueDate: string | null
  /**
   * How many recorded service visits have happened since this item was last
   * closed. Null when the item is not tied to the service rhythm
   * (`every_n_services` is null) or when the car has no service-visit item.
   */
  servicesSince: number | null
  /**
   * Whether it is this service's turn, by the service-count rule alone.
   * False when `servicesSince` is null.
   */
  dueThisService: boolean
}

/**
 * The latest cost entry that closed `itemId`, or null. "Latest" is by date,
 * with a higher odometer breaking a tie — two visits on one day resolve to
 * the one further along.
 */
function lastCompletion(
  itemId: string,
  entries: VehicleCostEntry[],
): VehicleCostEntry | null {
  let best: VehicleCostEntry | null = null
  for (const entry of entries) {
    if (!entry.item_ids?.includes(itemId)) continue
    if (
      best === null ||
      entry.date > best.date ||
      (entry.date === best.date &&
        Number(entry.odometer ?? 0) > Number(best.odometer ?? 0))
    ) {
      best = entry
    }
  }
  return best
}

/**
 * One item's position in its cycle.
 *
 * Both dimensions are optional and independent — a NULL interval column means
 * that dimension is not tracked (Fuelly's blank-means-ignore, adopted so there
 * is no `track_by` enum to keep in sync). With both tracked, whichever comes
 * first wins, which is the stated Turkish convention for a drive belt: Bosch
 * Car Service Türkiye gives 60,000–120,000 km **or** 4–6 years, explicitly
 * noting that a belt hardens with age even on a car that barely moves.
 */
export function maintenanceItemState(
  item: VehicleMaintenanceItem,
  vehicle: Vehicle,
  entries: VehicleCostEntry[],
  odometer: OdometerView,
  today: string = homeDayIso(),
): MaintenanceItemState {
  const completion = lastCompletion(item.id, entries)
  const anchoredAtPurchase = completion === null

  const lastDoneKm = completion
    ? Number(completion.odometer ?? vehicle.purchase_odometer ?? 0)
    : Number(vehicle.purchase_odometer ?? 0)
  const lastDoneDate = completion ? completion.date : vehicle.purchased_on

  const intervalKm =
    item.interval_km === null ? null : Number(item.interval_km)
  const intervalMonths =
    item.interval_months === null ? null : Number(item.interval_months)

  // ── Distance dimension
  let dueKm: number | null = null
  let kmRemaining: number | null = null
  let kmPct: number | null = null
  if (intervalKm !== null && intervalKm > 0) {
    dueKm = bn(lastDoneKm).plus(bn(intervalKm)).toNumber()
    kmRemaining = bn(dueKm).minus(bn(odometer.km)).toNumber()
    kmPct = bn(odometer.km)
      .minus(bn(lastDoneKm))
      .div(bn(intervalKm))
      .times(100)
      .toNumber()
  }

  // ── Time dimension. The percentage is measured against the same calendar
  // span the due date uses, so the bar and the date can never disagree.
  let dueDate: string | null = null
  let daysRemaining: number | null = null
  let timePct: number | null = null
  if (intervalMonths !== null && intervalMonths > 0) {
    dueDate = addMonthsIso(lastDoneDate, intervalMonths)
    if (dueDate) {
      daysRemaining = daysBetweenIsoDays(today, dueDate)
      const intervalDays = daysBetweenIsoDays(lastDoneDate, dueDate)
      const elapsedDays = daysBetweenIsoDays(lastDoneDate, today)
      timePct =
        intervalDays > 0
          ? bn(elapsedDays).div(bn(intervalDays)).times(100).toNumber()
          : null
    }
  }

  const pcts = [kmPct, timePct].filter((p): p is number => p !== null)
  const intervalUsedPct = pcts.length > 0 ? Math.max(...pcts) : null

  // An item nothing has ever closed gets its own rung rather than a warning.
  // Its percentage is measured from the purchase, which is a floor and not a
  // fact, and asserting "overdue" off a placeholder is the one place this
  // component was contradicting its own never-fabricate rule.
  const status: MaintenanceStatus =
    intervalUsedPct === null
      ? MAINTENANCE_STATUS.dormant
      : anchoredAtPurchase
        ? MAINTENANCE_STATUS.unrecorded
        : intervalUsedPct >= MAINTENANCE_OVERDUE_PCT
          ? MAINTENANCE_STATUS.overdue
          : intervalUsedPct >= MAINTENANCE_DUE_SOON_PCT
            ? MAINTENANCE_STATUS.dueSoon
            : MAINTENANCE_STATUS.ok

  // The distance due point becomes a date only when the car's pace is known.
  const kmProjectedDate =
    kmRemaining !== null && odometer.kmPerDay !== null && odometer.kmPerDay > 0
      ? addDaysIso(
          today,
          Math.round(bn(kmRemaining).div(bn(odometer.kmPerDay)).toNumber()),
        )
      : null

  const candidates = [dueDate, kmProjectedDate].filter(
    (d): d is string => d !== null && d !== "",
  )
  const projectedDueDate =
    candidates.length > 0 ? candidates.sort()[0] : null

  return {
    item,
    lastDoneKm,
    lastDoneDate,
    anchoredAtPurchase,
    dueKm,
    dueDate,
    kmRemaining,
    daysRemaining,
    intervalUsedPct,
    status,
    projectedDueDate,
    // The service cadence is deliberately NOT computed here. It is a question
    // about the plan, not about one item: answering it needs the car's
    // service-visit item and every entry that closed it, and this function is
    // only ever handed one item. Threading the service item through every
    // caller to compute a field the whole-plan function already has the
    // material for would be the wrong shape, so `maintenancePlanState`
    // overwrites both fields — see `serviceCadence`.
    servicesSince: null,
    dueThisService: false,
  }
}

// ─── The service cadence ────────────────────────────────────────────

/**
 * Whether it is this service's turn for an item, counted in **services** and
 * nothing else.
 *
 * Deliberately kept out of `intervalUsedPct` and out of `status`, which stay
 * distance-and-time. The meter answers "how far through its own interval is
 * it"; this answers "is it this service's turn". They are different questions
 * with different inputs, and folding one into the other would produce a
 * three-dimensional percentage nobody could reason about — and would make a
 * fuel filter that is simply not this visit's job read as half-overdue.
 *
 * `servicesSince` counts the entries that closed the **service-visit item**
 * and fall **strictly after** this item's own last completion. Strictly after,
 * because a service and the work done at it share a date: a same-day service
 * is the one the item was just done at, so counting it would report a service
 * already passed the moment the work was logged. With no completion of its own
 * the item is anchored at the purchase point, which is a floor and not a date
 * anything happened on, so every service ever recorded counts.
 */
function serviceCadence(
  state: MaintenanceItemState,
  serviceItem: VehicleMaintenanceItem | null,
  entries: VehicleCostEntry[],
): { servicesSince: number | null; dueThisService: boolean } {
  const cadence =
    state.item.every_n_services === null
      ? null
      : Number(state.item.every_n_services)

  // No cadence on the item, or no service rhythm to count against.
  if (cadence === null || serviceItem === null) {
    return { servicesSince: null, dueThisService: false }
  }

  const doneOn = state.anchoredAtPurchase ? null : state.lastDoneDate
  let servicesSince = 0
  for (const entry of entries) {
    if (!entry.item_ids?.includes(serviceItem.id)) continue
    if (doneOn !== null && entry.date <= doneOn) continue
    servicesSince += 1
  }

  // The `+ 1` is the whole rule and it is easy to re-derive backwards:
  // `every_n_services` counts the services INCLUDING the one the item is done
  // at, so a cadence of 2 means done at service #1, then #3, then #5. What
  // decides it is therefore which number the UPCOMING service will be — the
  // (servicesSince + 1)-th since the item was last done. Without the `+ 1` an
  // every-service item stops being due the instant it is logged, which is
  // exactly backwards.
  return { servicesSince, dueThisService: servicesSince + 1 >= cadence }
}

/** Every active item's state, loudest first, then by how far through the
 *  interval it is, then by name — a stable order for a list.
 *
 *  Note this does NOT sort by group: the chart groups the rows itself, in the
 *  order the constants declare, and applying that order here too would make
 *  the sort depend on a display concern the engine has no business knowing. */
export function maintenancePlanState(
  items: VehicleMaintenanceItem[],
  vehicle: Vehicle,
  entries: VehicleCostEntry[],
  odometer: OdometerView,
  today: string = homeDayIso(),
): MaintenanceItemState[] {
  // The one item the cadence rule counts against, found once for the plan
  // rather than per item. At most one per vehicle.
  const serviceItem =
    items.find((i) => i.item_kind === SERVICE_VISIT_KIND) ?? null

  return items
    .filter((i) => i.is_active)
    .map((item) => {
      const state = maintenanceItemState(
        item,
        vehicle,
        entries,
        odometer,
        today,
      )
      return { ...state, ...serviceCadence(state, serviceItem, entries) }
    })
    .sort((a, b) => {
      const rank =
        MAINTENANCE_STATUS_RANK[a.status] - MAINTENANCE_STATUS_RANK[b.status]
      if (rank !== 0) return rank
      const pct = (b.intervalUsedPct ?? -1) - (a.intervalUsedPct ?? -1)
      if (pct !== 0) return pct
      return a.item.name.localeCompare(b.item.name)
    })
}

/** The items to bundle into the next visit: overdue, or within 10% of due. */
export function dueItems(
  states: MaintenanceItemState[],
): MaintenanceItemState[] {
  return states.filter((s) => MAINTENANCE_WARNING_STATUSES.includes(s.status))
}

/** The closest item not yet due — what the page shows when nothing is due.
 *  Deliberately `ok` only: an unrecorded item's percentage is a from-purchase
 *  floor, so naming it as "the closest thing coming up" would dress an
 *  estimate as a schedule. */
export function nextUpItem(
  states: MaintenanceItemState[],
): MaintenanceItemState | null {
  const upcoming = states
    .filter(
      (s) =>
        s.status === MAINTENANCE_STATUS.ok && s.intervalUsedPct !== null,
    )
    .sort((a, b) => (b.intervalUsedPct ?? 0) - (a.intervalUsedPct ?? 0))
  return upcoming[0] ?? null
}

// ─── The periodic service ───────────────────────────────────────────

/**
 * The plan item that represents the service visit itself, if the car has one.
 *
 * It is a maintenance item like any other — a km/month pair, whichever comes
 * first, projected from the car's pace — so it reuses the whole engine rather
 * than duplicating interval logic onto the vehicle. Only its `kind` says it is
 * the visit rather than a part.
 */
export function nextServiceState(
  states: MaintenanceItemState[],
): MaintenanceItemState | null {
  return (
    states.find((s) => s.item.item_kind === SERVICE_VISIT_KIND) ?? null
  )
}

/** The plan minus the service visit — the parts, which is what a plan is. */
export function planItems(
  states: MaintenanceItemState[],
): MaintenanceItemState[] {
  return states.filter((s) => s.item.item_kind !== SERVICE_VISIT_KIND)
}

export interface NextServiceBundle {
  /**
   * Obligations falling due around the same time — a policy, a tax
   * instalment, an inspection fee.
   *
   * Kept apart from `due` rather than filtered out of existence, because they
   * genuinely are due and the owner wants to know; but they must never join
   * the bundle a service entry closes. Three payees on three dates cannot be
   * one payment, and the entry's `maintenance` category would file a tax bill
   * as a per-km running cost, corrupting the fixed/variable split the cost
   * card is built on.
   */
  obligations: MaintenanceItemState[]
  /**
   * Items whose own due point falls at or before the next service — the list
   * to hand the mechanic. Answers "what will be due by then", not "what is
   * due today", which is the question an owner actually has and the one a
   * flat plan cannot answer.
   */
  due: MaintenanceItemState[]
  /**
   * Items with no recorded history. They cannot be scheduled honestly, so
   * they are never mixed into `due` — but they are exactly what to ask about
   * while the car is on the ramp, so they are offered separately.
   */
  unknown: MaintenanceItemState[]
}

/**
 * What the next service should cover.
 *
 * An item rides along if it is already due, or if its own due point falls at
 * or before the service's. Compared on whichever dimension both sides know:
 * projected dates first (the service's own projection already folds in
 * whichever-comes-first), then distance.
 *
 * With no service cadence to aim at, this degrades to "what is due now" —
 * the honest answer when there is no future point to measure against.
 */
export function nextServiceBundle(
  states: MaintenanceItemState[],
  service: MaintenanceItemState | null,
): NextServiceBundle {
  const parts = planItems(states)
  const unknown = parts.filter(
    (s) => s.status === MAINTENANCE_STATUS.unrecorded,
  )
  const schedulable = parts.filter(
    (s) =>
      s.status !== MAINTENANCE_STATUS.unrecorded &&
      s.status !== MAINTENANCE_STATUS.dormant,
  )
  // Split by group, not filtered away: an obligation coming due is worth
  // saying, and must not be closeable by a service entry.
  const isObligation = (s: MaintenanceItemState) =>
    s.item.item_group === OBLIGATIONS_GROUP
  const work = schedulable.filter((s) => !isObligation(s))
  const obligations = schedulable.filter(
    (s) => isObligation(s) && isWarningStatus(s),
  )

  if (service === null) {
    return {
      due: work.filter((s) => isWarningStatus(s)),
      obligations,
      unknown,
    }
  }

  const targetDate = service.projectedDueDate ?? service.dueDate
  const targetKm = service.dueKm

  const due = work.filter((s) => {
    if (isWarningStatus(s)) return true
    // Its turn by the service count, which is a different question from its
    // km/date due point and can fire first: the fuel filter is every second
    // service regardless of how far through its 40,000 km it happens to be.
    if (s.dueThisService) return true
    const ownDate = s.projectedDueDate ?? s.dueDate
    if (targetDate !== null && ownDate !== null && ownDate <= targetDate) {
      return true
    }
    return targetKm !== null && s.dueKm !== null && s.dueKm <= targetKm
  })

  return { due, obligations, unknown }
}

/** Whether a state is in one of the two statuses that warn. */
function isWarningStatus(state: MaintenanceItemState): boolean {
  return MAINTENANCE_WARNING_STATUSES.includes(state.status)
}

export interface LastServiceSummary {
  /** Odometer at the visit, and the day it happened. */
  km: number
  date: string
  /** What that visit closed, service item excluded — the parts actually done. */
  covered: string[]
  /**
   * Items on the service rhythm that this visit did NOT cover. This is the
   * whole deduction an owner makes out loud: "last time was oil and filters,
   * no fuel filter — so the fuel filter is this time's job." Stating it
   * removes the guesswork rather than hiding it behind a due date.
   */
  skipped: string[]
}

/**
 * What the last periodic service covered.
 *
 * Every entry sharing the visit's date counts as that visit: one trip to the
 * servis is often logged as several rows (the belt on its own line, the
 * periyodik bakım on another), and asking "what was done that day" is the
 * question, not "what was on that receipt".
 *
 * Null when there is no service item or it has never been recorded — there is
 * no last service to summarise, and inventing one from the purchase date would
 * be the same false-anchor mistake the status ladder already refuses.
 */
export function lastServiceSummary(
  states: MaintenanceItemState[],
  entries: VehicleCostEntry[],
  service: MaintenanceItemState | null,
): LastServiceSummary | null {
  if (service === null || service.anchoredAtPurchase) return null

  const day = service.lastDoneDate
  const closedThatDay = new Set<string>()
  for (const entry of entries) {
    if (entry.date !== day) continue
    for (const id of entry.item_ids) closedThatDay.add(id)
  }

  const parts = planItems(states)
  const covered = parts
    .filter((s) => closedThatDay.has(s.item.id))
    .map((s) => s.item.name)

  // Only the rhythm items can be meaningfully "skipped": a timing belt was
  // not skipped at a periyodik bakım, it simply was not due.
  const skipped = parts
    .filter(
      (s) =>
        s.item.every_n_services !== null && !closedThatDay.has(s.item.id),
    )
    .map((s) => s.item.name)

  return { km: service.lastDoneKm, date: day, covered, skipped }
}
