import { describe, it, expect } from "vitest"
import {
  addDaysIso,
  addMonthsIso,
  dueItems,
  maintenanceItemState,
  maintenancePlanState,
  nextUpItem,
  nextServiceState,
  nextServiceBundle,
  lastServiceSummary,
  planItems,
  odometerReadings,
  odometerView,
} from "@/lib/vehicle"
import {
  DEFAULT_MAINTENANCE_PLAN,
  MAINTENANCE_DUE_SOON_PCT,
  MAINTENANCE_GROUPS,
  MAINTENANCE_STATUS,
  SERVICE_VISIT_KIND,
} from "@/lib/constants/vehicle"
import type {
  Vehicle,
  VehicleCostEntry,
  VehicleMaintenanceItem,
} from "@/types/database"

// The schedule is the half of Component 17 that makes a claim about the
// future, so these cases pin the two rules it rests on: an item is anchored on
// the last time it was ACTUALLY done, and an interval resets only for the
// items a cost entry explicitly names.

const TODAY = "2026-09-04"

let seq = 0

function vehicle(over: Partial<Vehicle> = {}): Vehicle {
  return {
    id: "v1",
    user_id: "u1",
    name: "Egea",
    plate: null,
    make: null,
    model: null,
    model_year: null,
    purchased_on: "2024-01-15",
    purchase_price: 650000,
    purchase_currency: "TRY",
    purchase_odometer: 40000,
    current_value: null,
    current_value_currency: null,
    current_value_at: null,
    odometer: null,
    odometer_at: null,
    note: null,
    is_active: true,
    created_at: "2024-01-15T00:00:00Z",
    ...over,
  }
}

function entry(over: Partial<VehicleCostEntry> = {}): VehicleCostEntry {
  seq += 1
  return {
    id: `e${seq}`,
    user_id: "u1",
    vehicle_id: "v1",
    date: "2026-01-01",
    category: "maintenance",
    amount: 1000,
    currency: "TRY",
    odometer: null,
    litres: null,
    is_full_tank: false,
    note: null,
    created_at: "2026-01-01T00:00:00Z",
    item_ids: [],
    ...over,
  }
}

function item(over: Partial<VehicleMaintenanceItem> = {}): VehicleMaintenanceItem {
  seq += 1
  return {
    id: `i${seq}`,
    user_id: "u1",
    vehicle_id: "v1",
    name: "Item",
    item_group: "routine",
    item_kind: "service",
    cost_category: null,
    interval_km: 10000,
    interval_months: null,
    every_n_services: null,
    sort_order: 0,
    note: null,
    is_active: true,
    created_at: "2024-01-15T00:00:00Z",
    ...over,
  }
}

describe("addMonthsIso", () => {
  it("adds whole calendar months", () => {
    expect(addMonthsIso("2026-01-15", 6)).toBe("2026-07-15")
    expect(addMonthsIso("2026-09-04", 24)).toBe("2028-09-04")
  })

  it("clamps a day-of-month that the target month lacks", () => {
    // 31 Jan + 1 month is the end of February, not 2/3 March.
    expect(addMonthsIso("2026-01-31", 1)).toBe("2026-02-28")
    // 2028 is a leap year.
    expect(addMonthsIso("2028-01-31", 1)).toBe("2028-02-29")
    expect(addMonthsIso("2026-05-31", 1)).toBe("2026-06-30")
  })

  it("crosses years in both directions", () => {
    expect(addMonthsIso("2026-11-10", 3)).toBe("2027-02-10")
    expect(addMonthsIso("2026-02-10", -3)).toBe("2025-11-10")
  })

  it("returns empty for an unreadable day", () => {
    expect(addMonthsIso("not-a-day", 1)).toBe("")
    expect(addDaysIso("not-a-day", 1)).toBe("")
  })
})

describe("odometerView", () => {
  it("takes the purchase baseline as the first reading", () => {
    const v = vehicle()
    expect(odometerReadings(v, [])).toEqual([
      { km: 40000, date: "2024-01-15" },
    ])
    expect(odometerView(v, []).km).toBe(40000)
    // One reading cannot establish a pace.
    expect(odometerView(v, []).kmPerDay).toBeNull()
  })

  it("derives pace across the whole span, not the last pair", () => {
    const v = vehicle({ odometer: 70000, odometer_at: "2026-01-15" })
    // 30,000 km over exactly two years.
    const view = odometerView(v, [])
    expect(view.km).toBe(70000)
    expect(view.asOf).toBe("2026-01-15")
    expect(view.kmPerDay).toBeCloseTo(30000 / 731, 4)
  })

  it("collects readings carried by cost entries", () => {
    const v = vehicle()
    const entries = [
      entry({ date: "2025-06-01", odometer: 55000 }),
      entry({ date: "2024-08-01", odometer: 47000 }),
      entry({ date: "2025-12-01", odometer: null }),
    ]
    expect(odometerReadings(v, entries).map((r) => r.km)).toEqual([
      40000, 47000, 55000,
    ])
  })

  it("flags a backwards reading but still reports the highest as current", () => {
    const v = vehicle({ odometer: 60000, odometer_at: "2026-05-01" })
    // A typo: a later date carrying a lower reading.
    const entries = [entry({ date: "2026-06-01", odometer: 6000 })]
    const view = odometerView(v, entries)
    expect(view.hasBackwardsReading).toBe(true)
    // Warned, never blocked — and "current" does not go down.
    expect(view.km).toBe(60000)
  })

  it("never reports a zero pace", () => {
    // Two readings, no movement: a zero km/day would project every
    // distance-based item as due infinitely far away.
    const v = vehicle({ odometer: 40000, odometer_at: "2026-01-15" })
    expect(odometerView(v, []).kmPerDay).toBeNull()
  })
})

describe("maintenanceItemState — the drive belt case", () => {
  // The owner's own example: belt changed at 130,000 km, 90,000 km interval.
  const belt = item({
    name: "Drive belt",
    interval_km: 90000,
    interval_months: 72,
  })

  it("anchors on the recorded change and computes the next due point", () => {
    const v = vehicle({ odometer: 145000, odometer_at: TODAY })
    const done = entry({
      date: "2025-03-10",
      odometer: 130000,
      item_ids: [belt.id],
    })
    const view = odometerView(v, [done])
    const state = maintenanceItemState(belt, v, [done], view, TODAY)

    expect(state.anchoredAtPurchase).toBe(false)
    expect(state.lastDoneKm).toBe(130000)
    expect(state.lastDoneDate).toBe("2025-03-10")
    // 130,000 + 90,000
    expect(state.dueKm).toBe(220000)
    expect(state.kmRemaining).toBe(75000)
    // 72 months on from the change.
    expect(state.dueDate).toBe("2031-03-10")
    // Distance is 15,000 of 90,000 km = 16.7% used. But 18 of those 72 months
    // have also passed (~24.8%), and the bar shows whichever dimension is
    // FURTHER ALONG — so time is what governs here, not distance. This is the
    // belt's whole point: Bosch TR is explicit that age counts independently,
    // because the rubber hardens whether or not the car moves.
    expect(state.intervalUsedPct).toBeCloseTo(24.78, 1)
    expect(state.intervalUsedPct).toBeGreaterThan((15000 / 90000) * 100)
    expect(state.status).toBe(MAINTENANCE_STATUS.ok)
  })

  it("projects a date for the distance due point from the car's pace", () => {
    const v = vehicle({ odometer: 145000, odometer_at: TODAY })
    const done = entry({
      date: "2025-03-10",
      odometer: 130000,
      item_ids: [belt.id],
    })
    const view = odometerView(v, [done])
    const state = maintenanceItemState(belt, v, [done], view, TODAY)
    // Pace runs from the purchase baseline (40,000 @ 2024-01-15) to 145,000
    // today, so the km due point lands well before the 2031 time due date —
    // whichever comes first means the projection is the km one.
    expect(state.projectedDueDate).not.toBeNull()
    expect(state.projectedDueDate! < "2031-03-10").toBe(true)
  })

  it("falls back to the purchase point when nothing has closed it, and says so", () => {
    const v = vehicle({ odometer: 145000, odometer_at: TODAY })
    const view = odometerView(v, [])
    const state = maintenanceItemState(belt, v, [], view, TODAY)
    expect(state.anchoredAtPurchase).toBe(true)
    expect(state.lastDoneKm).toBe(40000)
    expect(state.dueKm).toBe(130000)
    // 105,000 km past a 90,000 interval — but measured from PURCHASE, so it is
    // a floor and not a fact. It reports `unrecorded`, not `overdue`: nothing
    // was missed, a date was never entered.
    expect(state.status).toBe(MAINTENANCE_STATUS.unrecorded)
    expect(state.intervalUsedPct).toBeGreaterThan(100)
  })
})

describe("maintenanceItemState — the reset rule", () => {
  it("resets only for the items the entry names", () => {
    const oil = item({ name: "Oil", interval_km: 10000 })
    const air = item({ name: "Air filter", interval_km: 10000 })
    const v = vehicle({ odometer: 55000, odometer_at: TODAY })
    // One visit, oil only. The air filter must NOT reset.
    const visit = entry({
      date: "2026-08-01",
      odometer: 54000,
      item_ids: [oil.id],
    })
    const view = odometerView(v, [visit])

    expect(maintenanceItemState(oil, v, [visit], view, TODAY).lastDoneKm).toBe(
      54000,
    )
    expect(maintenanceItemState(air, v, [visit], view, TODAY).lastDoneKm).toBe(
      40000,
    )
  })

  it("takes the latest completion, breaking a same-day tie by odometer", () => {
    const oil = item({ name: "Oil", interval_km: 10000 })
    const v = vehicle({ odometer: 60000, odometer_at: TODAY })
    const entries = [
      entry({ date: "2026-01-01", odometer: 50000, item_ids: [oil.id] }),
      entry({ date: "2026-06-01", odometer: 56000, item_ids: [oil.id] }),
      entry({ date: "2026-06-01", odometer: 56500, item_ids: [oil.id] }),
    ]
    const view = odometerView(v, entries)
    expect(maintenanceItemState(oil, v, entries, view, TODAY).lastDoneKm).toBe(
      56500,
    )
  })

  it("one visit can close several items at once", () => {
    const oil = item({ name: "Oil", interval_km: 10000 })
    const filter = item({ name: "Oil filter", interval_km: 10000 })
    const v = vehicle({ odometer: 55000, odometer_at: TODAY })
    const visit = entry({
      date: "2026-08-01",
      odometer: 54000,
      item_ids: [oil.id, filter.id],
    })
    const view = odometerView(v, [visit])
    expect(maintenanceItemState(oil, v, [visit], view, TODAY).lastDoneKm).toBe(
      54000,
    )
    expect(
      maintenanceItemState(filter, v, [visit], view, TODAY).lastDoneKm,
    ).toBe(54000)
  })

  it("a null-amount entry still resets the interval", () => {
    // "Belt done at 130,000 km, price forgotten" — the reason `amount` is
    // nullable at all.
    const belt = item({ name: "Drive belt", interval_km: 90000 })
    const v = vehicle({ odometer: 140000, odometer_at: TODAY })
    const done = entry({
      date: "2025-03-10",
      odometer: 130000,
      amount: null,
      item_ids: [belt.id],
    })
    const view = odometerView(v, [done])
    expect(maintenanceItemState(belt, v, [done], view, TODAY).lastDoneKm).toBe(
      130000,
    )
  })
})

describe("maintenanceItemState — the two dimensions", () => {
  it("tracks distance only when the month interval is blank", () => {
    const belt = item({ interval_km: 90000, interval_months: null })
    const v = vehicle({ odometer: 130000, odometer_at: TODAY })
    const state = maintenanceItemState(belt, v, [], odometerView(v, []), TODAY)
    expect(state.dueDate).toBeNull()
    expect(state.daysRemaining).toBeNull()
    expect(state.dueKm).toBe(130000)
  })

  it("tracks time only when the km interval is blank", () => {
    // Muayene: every 24 months, and it does not care how far you drove.
    const muayene = item({ interval_km: null, interval_months: 24 })
    const v = vehicle({
      purchased_on: "2024-09-04",
      odometer: 999999,
      odometer_at: TODAY,
    })
    // Recorded, so the ladder applies rather than the unrecorded rung.
    const done = entry({ date: "2024-09-04", item_ids: [muayene.id] })
    const state = maintenanceItemState(
      muayene,
      v,
      [done],
      odometerView(v, [done]),
      TODAY,
    )
    expect(state.dueKm).toBeNull()
    expect(state.kmRemaining).toBeNull()
    expect(state.dueDate).toBe("2026-09-04")
    expect(state.daysRemaining).toBe(0)
    // Exactly at the end of the interval.
    expect(state.intervalUsedPct).toBeCloseTo(100, 4)
    expect(state.status).toBe(MAINTENANCE_STATUS.overdue)
  })

  it("is dormant, never due, when both intervals are blank", () => {
    const dormant = item({ interval_km: null, interval_months: null })
    const v = vehicle({ odometer: 999999, odometer_at: TODAY })
    const state = maintenanceItemState(
      dormant,
      v,
      [],
      odometerView(v, []),
      TODAY,
    )
    expect(state.intervalUsedPct).toBeNull()
    expect(state.status).toBe(MAINTENANCE_STATUS.dormant)
    expect(dueItems([state])).toEqual([])
  })

  it("takes whichever dimension is further along", () => {
    // 12 months and 15,000 km, one year on having driven only 3,000 km:
    // time is at 100%, distance at 20%. Time must win.
    const oil = item({ interval_km: 15000, interval_months: 12 })
    const v = vehicle({
      purchased_on: "2025-09-04",
      purchase_odometer: 40000,
      odometer: 43000,
      odometer_at: TODAY,
    })
    const done = entry({
      date: "2025-09-04",
      odometer: 40000,
      item_ids: [oil.id],
    })
    const state = maintenanceItemState(
      oil,
      v,
      [done],
      odometerView(v, [done]),
      TODAY,
    )
    expect(state.intervalUsedPct).toBeCloseTo(100, 4)
    expect(state.status).toBe(MAINTENANCE_STATUS.overdue)
  })
})

describe("the status ladder", () => {
  const v = vehicle({ purchase_odometer: 0, odometer_at: TODAY })

  // Every case here anchors on a REAL completion at 0 km: the ladder only
  // applies to a recorded item, and measuring from the purchase reports
  // `unrecorded` instead (see its own describe block below).
  function statusAtKm(km: number) {
    const oil = item({ interval_km: 10000, interval_months: null })
    const veh = { ...v, odometer: km }
    const done = entry({
      date: veh.purchased_on,
      odometer: 0,
      item_ids: [oil.id],
    })
    return maintenanceItemState(
      oil,
      veh,
      [done],
      odometerView(veh, [done]),
      TODAY,
    ).status
  }

  it("warns within 10% of due, and not before", () => {
    // The 90% threshold is Fuelly's rule, adopted because it scales.
    expect(MAINTENANCE_DUE_SOON_PCT).toBe(90)
    expect(statusAtKm(8999)).toBe(MAINTENANCE_STATUS.ok)
    expect(statusAtKm(9000)).toBe(MAINTENANCE_STATUS.dueSoon)
    expect(statusAtKm(9999)).toBe(MAINTENANCE_STATUS.dueSoon)
  })

  it("is overdue at exactly 100% of the interval", () => {
    expect(statusAtKm(10000)).toBe(MAINTENANCE_STATUS.overdue)
    expect(statusAtKm(12000)).toBe(MAINTENANCE_STATUS.overdue)
  })

  it("scales the window with the interval", () => {
    // A 100,000 km item warns 10,000 km out; a 5,000 km item warns 500 out.
    const long = item({ interval_km: 100000, interval_months: null })
    const short = item({ interval_km: 5000, interval_months: null })
    const at90k = { ...v, odometer: 90000 }
    const at4500 = { ...v, odometer: 4500 }
    const doneLong = entry({ date: v.purchased_on, odometer: 0, item_ids: [long.id] })
    const doneShort = entry({ date: v.purchased_on, odometer: 0, item_ids: [short.id] })
    expect(
      maintenanceItemState(long, at90k, [doneLong], odometerView(at90k, [doneLong]), TODAY)
        .status,
    ).toBe(MAINTENANCE_STATUS.dueSoon)
    expect(
      maintenanceItemState(short, at4500, [doneShort], odometerView(at4500, [doneShort]), TODAY)
        .status,
    ).toBe(MAINTENANCE_STATUS.dueSoon)
  })
})

describe("maintenancePlanState / dueItems / nextUpItem", () => {
  const v = vehicle({ purchase_odometer: 0, odometer: 9500, odometer_at: TODAY })

  const overdue = item({ name: "Overdue thing", interval_km: 5000 })
  const soon = item({ name: "Soon thing", interval_km: 10000 })
  const fine = item({ name: "Fine thing", interval_km: 100000 })
  const off = item({ name: "Dormant thing", interval_km: null })
  const archived = item({ name: "Archived", interval_km: 100, is_active: false })

  // All anchored at 0 km by a real record, so the ladder applies; the
  // unrecorded rung has its own block.
  const records = [overdue, soon, fine].map((i) =>
    entry({ date: v.purchased_on, odometer: 0, item_ids: [i.id] }),
  )
  const states = maintenancePlanState(
    [fine, off, soon, overdue, archived],
    v,
    records,
    odometerView(v, records),
    TODAY,
  )

  it("orders loudest first, then by how far through the interval", () => {
    expect(states.map((s) => s.item.name)).toEqual([
      "Overdue thing",
      "Soon thing",
      "Fine thing",
      "Dormant thing",
    ])
  })

  it("ranks an unrecorded item above OK but below the warnings", () => {
    // It is worth looking at — its from-purchase floor may already have passed
    // — but it is not a warning, so it never outranks a real one.
    const unlogged = item({ name: "Unlogged thing", interval_km: 5000 })
    const ranked = maintenancePlanState(
      [fine, soon, overdue, unlogged],
      v,
      records,
      odometerView(v, records),
      TODAY,
    )
    expect(ranked.map((s) => s.item.name)).toEqual([
      "Overdue thing",
      "Soon thing",
      "Unlogged thing",
      "Fine thing",
    ])
  })

  it("leaves archived items out entirely", () => {
    expect(states.some((s) => s.item.name === "Archived")).toBe(false)
  })

  it("bundles the overdue and due-soon items for the next visit", () => {
    expect(dueItems(states).map((s) => s.item.name)).toEqual([
      "Overdue thing",
      "Soon thing",
    ])
  })

  it("names the closest not-yet-due item, ignoring dormant ones", () => {
    expect(nextUpItem(states)?.item.name).toBe("Fine thing")
  })
})

describe("the seeded plan's groups", () => {
  it("assigns every template row a real group", () => {
    const valid = new Set<string>(MAINTENANCE_GROUPS.map((g) => g.value))
    for (const t of DEFAULT_MAINTENANCE_PLAN) {
      expect(valid.has(t.group)).toBe(true)
    }
  })

  it("files the fuel filter with the periodic-service items", () => {
    // Deliberate, and the one placement worth pinning: it is replaced every
    // OTHER periodic service, but it is a service consumable and that is where
    // its owner looks for it. Its 40,000 km interval still decides when it is
    // due.
    const fuel = DEFAULT_MAINTENANCE_PLAN.find((t) => t.name === "Fuel filter")
    expect(fuel?.group).toBe("routine")
    expect(fuel?.intervalKm).toBe(40000)
  })

  it("keeps the legal obligations out of maintenance", () => {
    const obligations = DEFAULT_MAINTENANCE_PLAN.filter(
      (t) => t.group === "obligations",
    ).map((t) => t.name)
    expect(obligations).toHaveLength(4)
    // All four are time-only: none of them cares how far the car was driven.
    for (const name of obligations) {
      const t = DEFAULT_MAINTENANCE_PLAN.find((x) => x.name === name)!
      expect(t.intervalKm).toBeNull()
      expect(t.intervalMonths).not.toBeNull()
    }
  })
})

describe("what a row shows about distance", () => {
  // The owner's rule: do not put a kilometre figure on screen where distance
  // is not part of the item. These pin the two places it could leak.
  const v = vehicle({ purchase_odometer: 0, odometer: 9500, odometer_at: TODAY })

  it("gives a time-only item no due odometer and no distance remaining", () => {
    const kasko = item({ interval_km: null, interval_months: 12 })
    const paid = entry({ date: "2026-07-30", odometer: 9000, item_ids: [kasko.id] })
    const state = maintenanceItemState(
      kasko, v, [paid], odometerView(v, [paid]), TODAY,
    )
    // The entry carried an odometer — it still feeds "current km" — but the
    // item exposes no distance figures of its own.
    expect(state.dueKm).toBeNull()
    expect(state.kmRemaining).toBeNull()
    expect(state.lastDoneKm).toBe(9000)
    expect(state.dueDate).toBe("2027-07-30")
  })

  it("still tracks distance for an item that has a km interval", () => {
    const oil = item({ interval_km: 10000, interval_months: null })
    const done = entry({ date: "2026-01-01", odometer: 5000, item_ids: [oil.id] })
    const state = maintenanceItemState(
      oil, v, [done], odometerView(v, [done]), TODAY,
    )
    expect(state.dueKm).toBe(15000)
    expect(state.kmRemaining).toBe(5500)
  })
})

describe("the unrecorded rung", () => {
  // The honest-blank rule, applied to the schedule. An item nothing has closed
  // was reaching 100% of a from-purchase estimate and then asserting a red
  // "Overdue" — filling the due bundle and raising a dashboard banner reading
  // "11 months over". Nothing had been missed; a date had never been entered.
  const v = vehicle({
    purchased_on: "2024-01-15",
    purchase_odometer: 40000,
    odometer: 200000,
    odometer_at: TODAY,
  })

  it("never reports overdue from a purchase-anchored estimate", () => {
    const belt = item({ name: "Belt", interval_km: 90000 })
    const state = maintenanceItemState(belt, v, [], odometerView(v, []), TODAY)
    expect(state.anchoredAtPurchase).toBe(true)
    expect(state.status).toBe(MAINTENANCE_STATUS.unrecorded)
    expect(state.status).not.toBe(MAINTENANCE_STATUS.overdue)
  })

  it("keeps showing the floor, because for a used car it is informative", () => {
    const belt = item({ name: "Belt", interval_km: 90000 })
    const state = maintenanceItemState(belt, v, [], odometerView(v, []), TODAY)
    // 160,000 km against a 90,000 interval. Shown, never asserted.
    expect(state.intervalUsedPct).toBeCloseTo((160000 / 90000) * 100, 4)
    expect(state.dueKm).toBe(130000)
  })

  it("stays out of the due bundle and out of next-up", () => {
    const belt = item({ name: "Belt", interval_km: 90000 })
    const plan = maintenancePlanState([belt], v, [], odometerView(v, []), TODAY)
    expect(dueItems(plan)).toEqual([])
    expect(nextUpItem(plan)).toBeNull()
  })

  it("joins the ladder the moment one completion is recorded", () => {
    const belt = item({ name: "Belt", interval_km: 90000 })
    const done = entry({
      date: "2025-01-15",
      odometer: 100000,
      item_ids: [belt.id],
    })
    const state = maintenanceItemState(
      belt, v, [done], odometerView(v, [done]), TODAY,
    )
    expect(state.anchoredAtPurchase).toBe(false)
    // 100,000 km of a 90,000 interval, from a real record — genuinely overdue.
    expect(state.status).toBe(MAINTENANCE_STATUS.overdue)
    expect(dueItems([state])).toHaveLength(1)
  })
})

describe("the service cadence", () => {
  // "Is it this service's turn?" is a different question from "how far through
  // its own interval is it", and these pin it as a separate answer: counted in
  // SERVICES, never folded into the meter or the status. The rule cannot be
  // derived from the km intervals — 40,000 km against a 15,000 km service is
  // 2.67 services, while the trade rule is plainly "every second one".
  const v = vehicle({
    purchased_on: "2024-01-15",
    purchase_odometer: 100000,
    odometer: 150000,
    odometer_at: TODAY,
  })

  /** The car's periodic service. Its own cadence is null: it IS the rhythm. */
  function serviceItem() {
    return item({
      name: "Periodic service",
      item_kind: SERVICE_VISIT_KIND,
      interval_km: 15000,
      interval_months: 12,
      every_n_services: null,
    })
  }

  /** A visit that closed the service item and, optionally, some parts. */
  function service(
    svc: VehicleMaintenanceItem,
    date: string,
    km: number,
    alsoClosed: VehicleMaintenanceItem[] = [],
  ) {
    return entry({
      date,
      odometer: km,
      item_ids: [svc.id, ...alsoClosed.map((i) => i.id)],
    })
  }

  function stateOf(
    target: VehicleMaintenanceItem,
    items: VehicleMaintenanceItem[],
    entries: VehicleCostEntry[],
  ) {
    const states = maintenancePlanState(
      items,
      v,
      entries,
      odometerView(v, entries),
      TODAY,
    )
    return states.find((s) => s.item.id === target.id)!
  }

  it("counts the services recorded since the item was last done", () => {
    const svc = serviceItem()
    const oil = item({ name: "Engine oil", every_n_services: 1 })
    const entries = [
      // The oil was changed at the first service and not since.
      service(svc, "2025-02-01", 128000, [oil]),
      service(svc, "2025-09-01", 142000),
    ]
    expect(stateOf(oil, [svc, oil], entries).servicesSince).toBe(1)
  })

  it("does not count a service on the very day the item was closed", () => {
    // A service and the work done at it share a date — routinely as two rows,
    // since one visit can be logged as the visit plus a priced part. Counting
    // the same-day service would report a service already passed the moment
    // the work was logged, so "since" is strictly after the completion date.
    const svc = serviceItem()
    const oil = item({ name: "Engine oil", every_n_services: 1 })
    const entries = [
      service(svc, "2025-09-01", 142000),
      entry({ date: "2025-09-01", odometer: 142000, item_ids: [oil.id] }),
    ]
    expect(stateOf(oil, [svc, oil], entries).servicesSince).toBe(0)
  })

  it("an every-service item is due again as soon as one service is behind it", () => {
    // `every_n_services` counts the services INCLUDING the one the item is
    // done at, so what decides it is which number the UPCOMING service will
    // be: the (servicesSince + 1)-th. With `servicesSince >= cadence` instead,
    // an item done at every service would stop being due the instant it was
    // logged — exactly backwards, and the off-by-one worth pinning.
    const svc = serviceItem()
    const oil = item({ name: "Engine oil", every_n_services: 1 })
    const entries = [service(svc, "2025-09-01", 142000, [oil])]
    const state = stateOf(oil, [svc, oil], entries)
    expect(state.servicesSince).toBe(0)
    expect(state.dueThisService).toBe(true)
  })

  it("an every-other-service item done at the last service is not due", () => {
    // The fuel filter's whole point: it was just done, so the next visit is
    // not its turn. 0 + 1 >= 2 is false.
    const svc = serviceItem()
    const fuel = item({ name: "Fuel filter", every_n_services: 2 })
    const entries = [service(svc, "2025-09-01", 142000, [fuel])]
    const state = stateOf(fuel, [svc, fuel], entries)
    expect(state.servicesSince).toBe(0)
    expect(state.dueThisService).toBe(false)
  })

  it("an every-other-service item skipped at the last service is due", () => {
    // The owner's real book: two recorded services (128,000 and 142,000 km),
    // fuel filter closed by the first only. It did not change at the last
    // visit, so it is due at the next — 1 + 1 >= 2.
    const svc = serviceItem()
    const fuel = item({ name: "Fuel filter", every_n_services: 2 })
    const entries = [
      service(svc, "2025-02-01", 128000, [fuel]),
      service(svc, "2025-09-01", 142000),
    ]
    const state = stateOf(fuel, [svc, fuel], entries)
    expect(state.servicesSince).toBe(1)
    expect(state.dueThisService).toBe(true)
  })

  it("stays due once it is more than one service behind", () => {
    const svc = serviceItem()
    const fuel = item({ name: "Fuel filter", every_n_services: 2 })
    const entries = [
      service(svc, "2024-06-01", 112000, [fuel]),
      service(svc, "2025-02-01", 128000),
      service(svc, "2025-09-01", 142000),
    ]
    const state = stateOf(fuel, [svc, fuel], entries)
    expect(state.servicesSince).toBe(2)
    expect(state.dueThisService).toBe(true)
  })

  it("counts every service ever recorded for an item with no history", () => {
    // Nothing has closed it, so it is anchored at the purchase point — a floor
    // rather than a date anything happened on. Every service since counts.
    const svc = serviceItem()
    const fuel = item({ name: "Fuel filter", every_n_services: 2 })
    const entries = [
      service(svc, "2025-02-01", 128000),
      service(svc, "2025-09-01", 142000),
    ]
    const state = stateOf(fuel, [svc, fuel], entries)
    expect(state.anchoredAtPurchase).toBe(true)
    expect(state.servicesSince).toBe(2)
    expect(state.dueThisService).toBe(true)
  })

  it("leaves an item that is not tied to the rhythm out of it entirely", () => {
    // A drive belt (or an annual policy) runs on its own km/time interval and
    // has nothing to do with how many services have passed, however many that
    // is. Null cadence in, null out — and never "due this service".
    const svc = serviceItem()
    const belt = item({
      name: "Drive belt",
      interval_km: 90000,
      every_n_services: null,
    })
    const entries = [
      service(svc, "2024-06-01", 112000),
      service(svc, "2025-02-01", 128000),
      service(svc, "2025-09-01", 142000),
    ]
    const state = stateOf(belt, [svc, belt], entries)
    expect(state.servicesSince).toBeNull()
    expect(state.dueThisService).toBe(false)
  })

  it("answers null for every item when the car has no service visit", () => {
    // No rhythm to count against, so the question does not arise. A car whose
    // plan has no periodic-service item still schedules every item on its own
    // km and months.
    const oil = item({ name: "Engine oil", every_n_services: 1 })
    const fuel = item({ name: "Fuel filter", every_n_services: 2 })
    const entries = [
      entry({ date: "2025-09-01", odometer: 142000, item_ids: [oil.id] }),
    ]
    for (const state of maintenancePlanState(
      [oil, fuel],
      v,
      entries,
      odometerView(v, entries),
      TODAY,
    )) {
      expect(state.servicesSince).toBeNull()
      expect(state.dueThisService).toBe(false)
    }
  })

  it("only counts entries that closed the service item itself", () => {
    // A fill, a tax payment, or a part changed off-service is not a service.
    const svc = serviceItem()
    const oil = item({ name: "Engine oil", every_n_services: 1 })
    const entries = [
      service(svc, "2025-02-01", 128000, [oil]),
      entry({ date: "2025-04-01", odometer: 133000, category: "fuel" }),
      entry({ date: "2025-06-01", odometer: 138000, item_ids: [oil.id] }),
    ]
    // The June row re-closed the oil but was not a service, so the oil's
    // anchor moved and no service sits after it.
    expect(stateOf(oil, [svc, oil], entries).servicesSince).toBe(0)
  })

  it("does not touch the meter or the status", () => {
    // The separation is the design: `intervalUsedPct` and `status` stay
    // distance-and-time. Two identical items differing ONLY in cadence must
    // read the same on both, or the percentage has quietly become
    // three-dimensional.
    const svc = serviceItem()
    const withCadence = item({
      name: "A",
      interval_km: 10000,
      every_n_services: 2,
    })
    const without = item({ name: "B", interval_km: 10000 })
    const entries = [
      service(svc, "2025-02-01", 128000, [withCadence, without]),
      service(svc, "2025-09-01", 142000),
    ]
    const a = stateOf(withCadence, [svc, withCadence, without], entries)
    const b = stateOf(without, [svc, withCadence, without], entries)
    expect(a.dueThisService).toBe(true)
    expect(b.dueThisService).toBe(false)
    // 150,000 - 128,000 against a 10,000 km interval, for both.
    expect(a.intervalUsedPct).toBe(b.intervalUsedPct)
    expect(a.status).toBe(b.status)
    expect(a.status).toBe(MAINTENANCE_STATUS.overdue)
  })

  it("is answered by the plan, not by one item on its own", () => {
    // `maintenanceItemState` is only ever handed one item, so it cannot see
    // the car's service visit; it reports the honest null rather than a
    // guess, and `maintenancePlanState` fills both fields in.
    const svc = serviceItem()
    const oil = item({ name: "Engine oil", every_n_services: 1 })
    const entries = [service(svc, "2025-02-01", 128000, [oil])]
    const alone = maintenanceItemState(
      oil,
      v,
      entries,
      odometerView(v, entries),
      TODAY,
    )
    expect(alone.servicesSince).toBeNull()
    expect(alone.dueThisService).toBe(false)
    expect(stateOf(oil, [svc, oil], entries).dueThisService).toBe(true)
  })
})

describe("the periodic service as a surface", () => {
  // The owner's own reasoning, which the card has to be able to say back:
  // "when was the last periodic service? 142k, 16 Feb. what was changed?
  // oil, filters, no fuel filter. so I need the fuel filter this time."
  const v = vehicle({
    purchased_on: "2025-03-28",
    purchase_odometer: 128000,
    odometer: 153000,
    odometer_at: "2026-09-04",
  })
  const svc = item({
    name: "Periodic service",
    item_kind: "service_visit",
    interval_km: 15000,
    interval_months: 12,
  })
  const oil = item({ name: "Engine oil", interval_km: 15000, every_n_services: 1 })
  const fuel = item({ name: "Fuel filter", interval_km: 30000, every_n_services: 2 })
  const pads = item({
    name: "Brake pads",
    item_group: "long_life",
    item_kind: "inspect",
    interval_km: 30000,
  })
  const mtv = item({
    name: "MTV instalment",
    item_group: "obligations",
    interval_km: null,
    interval_months: 6,
  })
  const plan = [svc, oil, fuel, pads, mtv]
  const entries = [
    entry({ date: "2025-04-11", odometer: 128000, item_ids: [svc.id, oil.id, fuel.id] }),
    entry({ date: "2026-02-16", odometer: 142000, item_ids: [svc.id, oil.id] }),
    // A RECORDED obligation, long enough ago to be genuinely overdue. Without
    // a record it would be `unrecorded` and belong in `unknown` instead —
    // which is itself the right answer, just not what this block tests.
    entry({ date: "2025-04-11", odometer: null, item_ids: [mtv.id] }),
  ]
  const states = maintenancePlanState(plan, v, entries, odometerView(v, entries), "2026-09-05")
  const service = nextServiceState(states)

  it("finds the service visit and keeps it out of the plan", () => {
    expect(service?.item.name).toBe("Periodic service")
    // The plan is the parts; the visit is the event they happen at.
    expect(planItems(states).map((s) => s.item.name)).not.toContain(
      "Periodic service",
    )
  })

  it("summarises what the last service covered and skipped", () => {
    const last = lastServiceSummary(states, entries, service)
    expect(last?.km).toBe(142000)
    expect(last?.date).toBe("2026-02-16")
    expect(last?.covered).toEqual(["Engine oil"])
    // The deduction: only rhythm items can be "skipped". A timing belt was
    // not skipped at a service, it simply was not due.
    expect(last?.skipped).toEqual(["Fuel filter"])
  })

  it("has no last service to summarise before one is recorded", () => {
    const bare = maintenancePlanState([svc, oil], v, [], odometerView(v, []), "2026-09-05")
    expect(lastServiceSummary(bare, [], nextServiceState(bare))).toBeNull()
  })

  it("puts the skipped every-other item in the next bundle", () => {
    const { due } = nextServiceBundle(states, service)
    expect(due.map((s) => s.item.name)).toContain("Fuel filter")
    expect(due.map((s) => s.item.name)).toContain("Engine oil")
  })

  it("never lets an obligation into the bundle a service entry closes", () => {
    // Regression: three payees on three dates cannot be one payment, and the
    // entry's `maintenance` category would file a tax bill as a per-km cost.
    const { due, obligations } = nextServiceBundle(states, service)
    expect(due.map((s) => s.item.name)).not.toContain("MTV instalment")
    expect(obligations.map((s) => s.item.name)).toContain("MTV instalment")
  })

  it("keeps a wear item off the service rhythm", () => {
    // The owner's correction: pads have a lifetime, so they are not a service
    // checklist entry. They surface on their own interval, and a check that
    // finds life left postpones them.
    const padState = states.find((s) => s.item.name === "Brake pads")!
    expect(padState.item.every_n_services).toBeNull()
    expect(padState.dueThisService).toBe(false)
  })
})
