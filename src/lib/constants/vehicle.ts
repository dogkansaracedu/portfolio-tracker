/** Vehicle (Component 17) — cost of ownership and the periodic maintenance
 *  schedule. Every user-visible string, threshold and default interval for the
 *  component lives here; the components below carry no copy of their own. */

import type { FiatCurrency } from "@/lib/constants/currencies"

export const VEHICLE_ROUTE = "/vehicle"

export const VEHICLES_TABLE = "vehicles"
export const VEHICLE_COST_ENTRIES_TABLE = "vehicle_cost_entries"
export const VEHICLE_MAINTENANCE_ITEMS_TABLE = "vehicle_maintenance_items"
export const VEHICLE_COST_ENTRY_ITEMS_TABLE = "vehicle_cost_entry_items"

/**
 * Every cost of running a car in Turkey is quoted and paid in lira — pump
 * price, MTV, kasko, the servis invoice, the muayene fee. So the cost form
 * defaults here rather than to the app-wide {@link DEFAULT_CURRENCY} (USD),
 * which would be wrong on essentially every entry. Still editable per entry:
 * the currency is stored per row and normalized at that row's own date.
 */
export const VEHICLE_DEFAULT_CURRENCY: FiatCurrency = "TRY"

// ─── Cost categories ────────────────────────────────────────────────

/** One label per category, used by the form, the ledger rows and the
 *  breakdown — a category is never worded one way in one place and another
 *  in the next. Mirrors {@link ASSET_CATEGORIES}' shape. */
export const VEHICLE_COST_CATEGORIES = [
  { value: "fuel", label: "Fuel" },
  { value: "maintenance", label: "Maintenance" },
  { value: "insurance", label: "Insurance" },
  { value: "tax", label: "Tax (MTV)" },
  { value: "inspection", label: "Inspection (muayene)" },
  { value: "fine", label: "Fine" },
  { value: "parking", label: "Parking & tolls" },
  { value: "other", label: "Other" },
] as const

export type VehicleCostCategory =
  (typeof VEHICLE_COST_CATEGORIES)[number]["value"]

export const VEHICLE_COST_CATEGORY_LABELS: Record<string, string> =
  Object.fromEntries(VEHICLE_COST_CATEGORIES.map((c) => [c.value, c.label]))

/** The only category that carries litres and a full-tank flag. */
export const FUEL_CATEGORY: VehicleCostCategory = "fuel"

/**
 * Fixed vs variable, the split AAA's "Your Driving Costs" uses and the reason
 * this component quotes two denominators instead of one.
 *
 * **Variable** costs scale with distance, so they are quoted per km.
 * **Fixed** costs accrue with time whether the car moves or not, so they are
 * quoted per month. AAA publishes the sensitivity that makes a single blended
 * per-km figure misleading: the same car reads $1.00/mi at 10k mi/yr and
 * $0.66/mi at 20k — a 34% swing driven entirely by the denominator.
 *
 * Depreciation is treated as fixed here, following AAA, the IRS and the
 * Victoria Transport Policy Institute — though VTPI notes the placement is
 * contested (it argues 5–15¢/mi of depreciation is mileage-related, while
 * Train et al. find only $0.002–0.003/mi from revealed preference). Fixed is
 * the mainstream choice and the one the two denominators are built around.
 */
export const VEHICLE_VARIABLE_CATEGORIES: readonly VehicleCostCategory[] = [
  "fuel",
  "maintenance",
]

/**
 * Whether an outlay of this category closes its items **without being asked**.
 *
 * Paying MTV means the MTV instalment is done; there is nothing to choose. The
 * one genuinely ambiguous case is a service visit, which closes an arbitrary
 * combination of parts — so that is the only place a selector earns its keep.
 *
 * Derived from the items themselves (`cost_category`) rather than listed here,
 * because whether a category is unambiguous depends on how many items claim
 * it: one item claiming `tax` is a certainty, three claiming `insurance` is a
 * choice between three.
 */
export const VEHICLE_AUTO_CLOSE_CATEGORIES: readonly VehicleCostCategory[] = [
  "insurance",
  "tax",
  "inspection",
]

/**
 * Which parts of the plan an outlay of each category can plausibly close.
 *
 * A tax payment cannot reset a drive belt, and a fuel fill closes nothing at
 * all — but the reset list was offering every item in the plan against every
 * category, so an MTV instalment could be recorded as having renewed the
 * timing belt. Filtering by group makes the impossible unavailable rather than
 * merely discouraged, and shrinks the list from seventeen rows to one for the
 * categories where exactly one thing can be meant.
 *
 * An empty list hides the section entirely: a fill, a fine and a parking fee
 * close nothing, and offering a checkbox that should never be ticked is worse
 * than offering none.
 */
export const VEHICLE_CATEGORY_CLOSES: Record<
  VehicleCostCategory,
  readonly MaintenanceGroup[]
> = {
  fuel: [],
  maintenance: ["routine", "long_life"],
  insurance: ["obligations"],
  tax: ["obligations"],
  inspection: ["obligations"],
  fine: [],
  parking: [],
  // Unknown by definition, so it constrains nothing.
  other: ["routine", "long_life", "obligations"],
}

/**
 * The categories where an odometer reading means something — the car was
 * physically there and its mileage is part of the record. Fuel needs it to
 * measure consumption at all; a servis and a tyre change are recorded against
 * it; TÜVTÜRK writes the reading on the inspection report itself.
 *
 * Everything else is paid online or at a desk: the mileage at which an
 * insurance policy was renewed, a tax instalment settled or a fine paid is not
 * information, so the field is not offered. `other` keeps it, being unknown by
 * definition. A reading can always be recorded on its own from the odometer
 * card, which is what that card is for.
 */
export const VEHICLE_ODOMETER_CATEGORIES: readonly VehicleCostCategory[] = [
  "fuel",
  "maintenance",
  "inspection",
  "other",
]

export const VEHICLE_FIXED_CATEGORIES: readonly VehicleCostCategory[] = [
  "insurance",
  "tax",
  "inspection",
  "fine",
  "parking",
  "other",
]

// ─── Maintenance groups ─────────────────────────────────────────────

/**
 * Which part of the plan an item belongs to.
 *
 * Deliberately **not** called a category: {@link VEHICLE_COST_CATEGORIES}
 * already owns that word for what an outlay was *for*, and one concept per
 * term is a house rule. The two are different axes — an `inspection` cost
 * closes an `obligations` item, and a `maintenance` cost can close either a
 * `routine` or a `long_life` one.
 *
 * Membership is about **kind, not interval length**: the fuel filter is
 * `routine` even though it is replaced every *other* service, because it is a
 * service consumable and that is where its owner looks for it. Its interval is
 * what actually decides when it comes due.
 *
 * Order is display order, most-frequently-consulted first: the periodic-service
 * items change several times a year, the long-life parts once in several
 * years, and the obligations run on a calendar the owner already knows. An
 * overdue obligation is never buried by that ordering — the due-at-next-service
 * bundle sits above the plan and ignores groups entirely.
 *
 * The stored value stays `routine` deliberately: it is an internal enum, never
 * shown, and renaming it would cost a migration and a CHECK rewrite to change
 * nothing anybody sees. The label is the single source of the visible term.
 */
export const MAINTENANCE_GROUPS = [
  { value: "routine", label: "Periodic service" },
  { value: "long_life", label: "Long-term" },
  { value: "obligations", label: "Insurance, tax & inspection" },
] as const

export type MaintenanceGroup = (typeof MAINTENANCE_GROUPS)[number]["value"]

export const MAINTENANCE_GROUP_LABELS: Record<string, string> =
  Object.fromEntries(MAINTENANCE_GROUPS.map((g) => [g.value, g.label]))

/**
 * The four buckets the ledger totals by: fuel, maintenance, the recurring
 * obligations, and everything else.
 *
 * Coarser than the nine categories on purpose. Nine rows of spend is a table
 * nobody reads — an earlier version of this breakdown was cut for exactly
 * that — while four is the question actually being asked: how much of this car
 * is petrol, how much is keeping it running, how much is the state and the
 * insurer, and how much is neither.
 *
 * The obligations bucket reuses the maintenance group's own label rather than
 * inventing a second name for the same family. One concept, one term.
 *
 * Each bucket sits wholly inside one side of the fixed/variable split, so the
 * two cuts never contradict each other: fuel and maintenance are variable,
 * obligations and other are fixed. This answers "where did the money go"; the
 * split answers "which denominator does it belong under".
 */
export const VEHICLE_COST_GROUPS = [
  { value: "fuel", label: "Fuel", categories: ["fuel"] },
  { value: "maintenance", label: "Maintenance", categories: ["maintenance"] },
  {
    value: "obligations",
    label: MAINTENANCE_GROUP_LABELS.obligations,
    categories: ["insurance", "tax", "inspection"],
  },
  { value: "other", label: "Other", categories: ["fine", "parking", "other"] },
] as const satisfies readonly {
  value: string
  label: string
  categories: readonly VehicleCostCategory[]
}[]

export type VehicleCostGroup = (typeof VEHICLE_COST_GROUPS)[number]["value"]

/** The ledger's one non-bucket filter: rows recorded without a price. They
 *  belong to a category but contribute to no total, so they are reachable
 *  only through their own chip. */
export const UNPRICED_FILTER = "unpriced" as const

/** Category → bucket, derived so the two lists cannot disagree. */
export const VEHICLE_COST_GROUP_OF: Record<string, VehicleCostGroup> =
  Object.fromEntries(
    VEHICLE_COST_GROUPS.flatMap((g) =>
      g.categories.map((c) => [c, g.value as VehicleCostGroup]),
    ),
  )

/** A hand-added item is usually a service consumable, and it is the one value
 *  that never hides anything: a long-life part mis-filed here still shows its
 *  own interval, where defaulting to `obligations` would file real maintenance
 *  under paperwork. Mirrors the column default. */
export const DEFAULT_MAINTENANCE_GROUP: MaintenanceGroup = "routine"

/** The group whose items recur on a calendar and never on distance —
 *  insurance, tax, inspection. Named so the form can drop the km field for
 *  them rather than testing a string literal at the call site. */
export const OBLIGATIONS_GROUP: MaintenanceGroup = "obligations"

/** Rank for sorting, from {@link MAINTENANCE_GROUPS}' own order. */
export const MAINTENANCE_GROUP_RANK: Record<string, number> =
  Object.fromEntries(MAINTENANCE_GROUPS.map((g, i) => [g.value, i]))

/**
 * What happens at an item's interval.
 *
 * `service` covers everything that is DONE — a part replaced, a fluid renewed,
 * a policy paid, the periodic service itself — and keeps the neutral
 * "last done / next due" wording that reads correctly for all of them.
 * `inspect` is the one that needed a name: brake pads at 30,000 km are very
 * probably fine, so the interval is not "replace them", it is "have them
 * looked at", and recording that check must reset the reminder without
 * claiming a part was fitted.
 *
 * Affects **wording only** — the arithmetic is identical either way. But the
 * wording is what decides what the owner does: "next due at 158,000 km" reads
 * as an instruction to buy pads; "next check at 158,000 km" reads correctly.
 * Neither Carfax nor Fuelly models this; both bury the verb in the item's own
 * name, which is why their schedules cannot style or sort by it.
 */
export const MAINTENANCE_KINDS = [
  { value: "service", label: "Replace or renew" },
  { value: "inspect", label: "Check only" },
] as const

export type MaintenanceKind = (typeof MAINTENANCE_KINDS)[number]["value"]

export const DEFAULT_MAINTENANCE_KIND: MaintenanceKind = "service"
export const INSPECT_KIND: MaintenanceKind = "inspect"

/**
 * The periodic service itself. At most one per vehicle (a partial unique
 * index enforces it), shown as its own surface rather than as a row in the
 * plan — it is the event the rest of the plan happens AT, not a part.
 *
 * Deliberately not offered in the kind picker: there is one service cadence
 * per car and it is not something to create a second of by hand.
 */
export const SERVICE_VISIT_KIND = "service_visit" as const

/** Every kind a stored item can carry — the two a person picks, plus the
 *  service visit, which is created by the seed rather than chosen. */
export type MaintenanceItemKind = MaintenanceKind | typeof SERVICE_VISIT_KIND

/**
 * How many periodic services pass between an item being done, when it is tied
 * to the service rhythm at all: 1 = every service, 2 = every other.
 *
 * This cannot be derived from the km interval — 40,000 km against a 15,000 km
 * service is 2.67 services, while the trade rule is plainly "every second
 * one" — so the cadence is its own small fact and has to be stated.
 *
 * A hand-added item defaults to every service, because that is what almost
 * everything in the periodic-service group is. Null (the column default, and
 * what an obligation or a long-life part keeps) means the item is not tied to
 * the rhythm at all and runs on its own km/time interval instead.
 */

// ─── Maintenance status ladder ──────────────────────────────────────

export const MAINTENANCE_STATUS = {
  ok: "ok",
  dueSoon: "due_soon",
  overdue: "overdue",
  /**
   * Nothing has ever closed this item, so its interval is measured from the
   * purchase — a **floor, not a fact**.
   *
   * It exists because the alternative was dishonest: an item with no history
   * was reaching 100% of a from-purchase estimate and then asserting a red
   * "Overdue" badge, filling the due-at-next-service bundle, and raising a red
   * dashboard banner reading "MTV instalment — overdue, 11 months over".
   * Nothing had been missed; a date had never been entered. Money on this page
   * renders "—" plus a reason rather than a flattering zero, and the schedule
   * has to hold the same line.
   *
   * It still shows its from-purchase estimate, because for a used car that
   * floor is genuinely informative — it just never claims to be a fact, never
   * enters the due bundle, and never warns on the dashboard.
   */
  unrecorded: "unrecorded",
  dormant: "dormant",
} as const

export type MaintenanceStatus =
  (typeof MAINTENANCE_STATUS)[keyof typeof MAINTENANCE_STATUS]

/**
 * How much of an interval must be used before an item speaks up: 90%, i.e.
 * **within 10% of due**, on whichever dimension is closest.
 *
 * This is Fuelly's rule, adopted because it is scale-free — one threshold that
 * behaves correctly for a 10,000 km oil change (warns 1,000 km out) and a
 * 100,000 km drive belt (warns 10,000 km out) alike. A fixed "warn 500 km
 * ahead" is simultaneously too early for short intervals and far too late for
 * long ones, and Carfax's undocumented thresholds are a standing user
 * complaint precisely because they cannot be reasoned about.
 */
export const MAINTENANCE_DUE_SOON_PCT = 90

/** An item at or past 100% of its interval is overdue. */
export const MAINTENANCE_OVERDUE_PCT = 100

/** Loudest first — the display order everywhere the plan is listed. */
export const MAINTENANCE_STATUS_RANK: Record<MaintenanceStatus, number> = {
  [MAINTENANCE_STATUS.overdue]: 0,
  [MAINTENANCE_STATUS.dueSoon]: 1,
  // Above `ok`: an unrecorded item whose floor has already passed is worth
  // looking at, even though it is not a warning.
  [MAINTENANCE_STATUS.unrecorded]: 2,
  [MAINTENANCE_STATUS.ok]: 3,
  [MAINTENANCE_STATUS.dormant]: 4,
}

export const MAINTENANCE_WARNING_STATUSES: readonly MaintenanceStatus[] = [
  MAINTENANCE_STATUS.overdue,
  MAINTENANCE_STATUS.dueSoon,
]

export const MAINTENANCE_STATUS_LABELS: Record<MaintenanceStatus, string> = {
  [MAINTENANCE_STATUS.overdue]: "Overdue",
  [MAINTENANCE_STATUS.dueSoon]: "Due soon",
  [MAINTENANCE_STATUS.unrecorded]: "Not recorded",
  [MAINTENANCE_STATUS.ok]: "OK",
  [MAINTENANCE_STATUS.dormant]: "Not tracked",
}

/**
 * Status tones. Deliberately NOT `gainLossClass` — maintenance is neither a
 * gain nor a loss, the same rule Components 15 and 16 follow for rates. The
 * bar colours reuse the ladder `ForeignIncomeCard` already established
 * (primary → amber-500 → red-500) so a meter means one thing app-wide.
 */
export const MAINTENANCE_BAR_CLASSES: Record<MaintenanceStatus, string> = {
  [MAINTENANCE_STATUS.overdue]: "bg-red-500",
  [MAINTENANCE_STATUS.dueSoon]: "bg-amber-500",
  // Muted, not coloured: an estimate must not look like a reading.
  [MAINTENANCE_STATUS.unrecorded]: "bg-muted-foreground/40",
  [MAINTENANCE_STATUS.ok]: "bg-primary",
  [MAINTENANCE_STATUS.dormant]: "bg-muted-foreground/30",
}

export const MAINTENANCE_TEXT_CLASSES: Record<MaintenanceStatus, string> = {
  [MAINTENANCE_STATUS.overdue]: "text-red-500",
  [MAINTENANCE_STATUS.dueSoon]: "text-amber-500",
  [MAINTENANCE_STATUS.unrecorded]: "text-muted-foreground",
  [MAINTENANCE_STATUS.ok]: "text-muted-foreground",
  [MAINTENANCE_STATUS.dormant]: "text-muted-foreground",
}

/** Dashboard banner tones, matching `INTEREST_ALERT_CLASSES`' two levels. */
export const VEHICLE_ALERT_CLASSES: Record<string, string> = {
  [MAINTENANCE_STATUS.overdue]:
    "border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400",
  [MAINTENANCE_STATUS.dueSoon]:
    "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-500",
}

/** Named items per banner before it summarizes ("and N more"). Same limit as
 *  `INTEREST_ALERT_NAMED_LIMIT` so the two banners read alike. */
export const VEHICLE_ALERT_NAMED_LIMIT = 3

/** Session-scoped dismissal, like the interest banners: a nudge, not a task
 *  list, so it must return on the next visit if nothing was done. */
export const VEHICLE_ALERT_DISMISS_KEY = "vehicle-maintenance-alert-dismissed"

// ─── Fuel economy ───────────────────────────────────────────────────

/** Litres per 100 km is the unit Turkey quotes consumption in. */
export const FUEL_ECONOMY_UNIT = "L/100km"

/** Distance the economy figure is expressed over. */
export const FUEL_ECONOMY_DISTANCE = 100

/**
 * Consumption assumed when nothing has been measured, in L/100 km.
 *
 * A fallback, not a claim: it is only used until two full-tank fills give a
 * real figure, and the card says which of the two it is showing. The owner
 * chose 6.0 for his own car.
 */
export const ASSUMED_CONSUMPTION = 6.0

/**
 * Pump price used when the owner's own fills cannot supply one — motorin, lira
 * per litre, VAT included, İstanbul Avrupa, with the day it was read.
 *
 * **This figure goes stale faster than almost any other number in the app**,
 * from two independent directions:
 *
 *  - **Market.** Motorin rose **+7.76 TL/L overnight on 4 September 2026** —
 *    9.6% in one night — on Brent at 95–96 USD/bbl and a diesel crack-spread
 *    blowout. Even the previous day's press forecast (+8.24) missed by half a
 *    lira. EPDK's own monthly averages moved ±9% month-over-month repeatedly
 *    through 2026 (Apr 74.17 → May 68.34 → Jun 65.42 → Jul 71.41 → Aug 79.77).
 *  - **Duty, and this part is legislated rather than guessed.** A
 *    Cumhurbaşkanı Kararı (reported RG 13.08.2026) put the maktu ÖTV on
 *    motorin on a monthly staircase: 0.00 for 13–31 Aug 2026, then 3.00 in
 *    September, 6.00 in October, 9.00 in November, 12.00 in December and
 *    13.9006 from January 2027. Each 3.00 step is about +3.60 at the pump once
 *    VAT applies — so from tax alone this figure is ~4% low by 1 October, ~8%
 *    by 1 November and ~15% by January, with market drift on top.
 *
 * A constant is the wrong shape for this number. It is here because the
 * official source cannot be fetched — EPDK's province-level dealer report now
 * redirects to an e-Devlet login, and its public query page is a JSF form
 * requiring a POST with ViewState, with no JSON, no XML and no stable GET.
 * Distributor APIs do exist without a key (Opet publishes plain JSON per
 * province) and would be the real fix; see the component's technical doc.
 *
 * Until then: stored WITH its date, displayed WITH its date and its age, and
 * replaced by the owner's own price the moment one fill records both litres
 * and an amount. Never present it as current.
 */
export const DEFAULT_FUEL_PRICE = {
  tryPerLitre: 88.88,
  asOf: "2026-09-04",
} as const

// ─── The default maintenance plan ───────────────────────────────────

/**
 * A starting plan for a car in Turkey, seeded on first use and fully editable.
 * It exists because **there is no free source of manufacturer service
 * intervals**: Edmunds' maintenance API was closed to new keys in 2018, MOTOR
 * and ALLDATA are commercial, and the one buyable dataset is $1,000 and
 * mileage-only. So the owner supplies the intervals, and this template saves
 * them typing the common ones.
 *
 * These are TYPICAL Turkish intervals, not any specific car's schedule — the
 * authority is always the car's own bakım kitabı, which is why the UI says so
 * and every value here is editable. Sources, per row:
 *
 *  - Oil + filter, filters, fuel filter, coolant, transmission oil: Bosch Car
 *    Service Türkiye's periodic-maintenance guidance, cross-checked against
 *    Volkswagen Türkiye's authorised-service schedule (15,000 km steps for
 *    petrol, 10,000 then 20,000 for diesel) and Toyota Türkiye's guidance
 *    ("or annually").
 *  - Brake fluid: time-based, not km-based — VW Türkiye specifies 3 years from
 *    registration then every 2, so 24 months is the recurring figure.
 *  - Drive belt (triger kayışı): Bosch Car Service Türkiye states
 *    60,000–120,000 km **or** 4–6 years, whichever comes first, and is explicit
 *    that age matters independently because the belt hardens and cracks even
 *    on a barely-driven car. VW Türkiye's schedule uses 90,000 / 120,000 /
 *    180,000 km by engine. 90,000 km / 72 months is the conservative middle.
 *    NOTE: many modern engines (Fiat 1.6 E-Torq, various Hyundai/Kia diesels)
 *    drive the cam with a CHAIN and have no scheduled replacement at all — for
 *    those, delete this row rather than editing it.
 *  - Tyres: legal minimum tread in Turkey is 1.6 mm; replacement is usually
 *    age-driven (5–6 years typical) well before any km figure.
 *  - Muayene: TÜVTÜRK — a private car's first inspection is at 3 years, then
 *    **every 2 years**, so 24 months. Time-only; it does not care about km.
 *  - Trafik sigortası / kasko: annual policies, hence 12 months, time-only.
 *  - MTV: assessed annually but paid in **two equal instalments, in January
 *    and July** (Law 197 art. 9) — so a 6-month interval anchored on the last
 *    payment lands on both windows.
 *
 * `intervalKm: null` / `intervalMonths: null` means that dimension is not
 * tracked for the item — see the migration's note on blank-means-ignore.
 */
export interface MaintenanceItemTemplate {
  name: string
  /** How many services pass between doings: 1 = every service, 2 = every
   *  other, null = not tied to the service rhythm. */
  everyNServices: number | null
  /** The outlay category that closes this without being asked; null when it
   *  is only ever ticked by hand (every real maintenance item). */
  costCategory: VehicleCostCategory | null
  intervalKm: number | null
  intervalMonths: number | null
  group: MaintenanceGroup
  kind: MaintenanceItemKind
  note: string | null
}

export const DEFAULT_MAINTENANCE_PLAN: readonly MaintenanceItemTemplate[] = [
  {
    name: "Periodic service",
    everyNServices: null,
    costCategory: null,
    kind: SERVICE_VISIT_KIND,
    group: "routine",
    intervalKm: 15000,
    intervalMonths: 12,
    note: "The visit itself, so it can be tracked whether or not any single part was changed. Everything else in this group is normally done at one of these, and the check-only items are looked at during it.",
  },
  {
    name: "Engine oil",
    everyNServices: 1,
    costCategory: null,
    kind: "service",
    group: "routine",
    intervalKm: 10000,
    intervalMonths: 12,
    note: "Bosch TR / Toyota TR: 10,000–15,000 km or annually, whichever first.",
  },
  {
    // Its own row: oil and its filter are bought separately and can be done
    // separately, and a welded-together item cannot record either alone.
    name: "Oil filter",
    everyNServices: 1,
    costCategory: null,
    kind: "service",
    group: "routine",
    intervalKm: 10000,
    intervalMonths: 12,
    note: "Changed with the oil as a rule, but recorded separately so a top-up is not mistaken for a filter change.",
  },
  {
    name: "Air filter",
    everyNServices: 1,
    costCategory: null,
    kind: "service",
    group: "routine",
    intervalKm: 20000,
    intervalMonths: 24,
    note: "Bosch TR: 20,000–30,000 km.",
  },
  {
    name: "Cabin (pollen) filter",
    everyNServices: 1,
    costCategory: null,
    kind: "service",
    group: "routine",
    intervalKm: 20000,
    intervalMonths: 24,
    note: "Bosch TR: 20,000–30,000 km.",
  },
  {
    name: "Fuel filter",
    everyNServices: 2,
    costCategory: null,
    kind: "service",
    group: "routine",
    intervalKm: 40000,
    intervalMonths: 48,
    note: "Bosch TR: 40,000–50,000 km. VW diesel schedules it every 20,000.",
  },
  {
    name: "Spark plugs",
    everyNServices: null,
    costCategory: null,
    kind: "service",
    group: "long_life",
    intervalKm: 60000,
    intervalMonths: null,
    note: "Petrol engines only — delete this row on a diesel (it has glow plugs, on no scheduled interval). Highly engine-dependent otherwise: VW TR quotes 60k/90k/120k/180k. Check your bakım kitabı.",
  },
  {
    name: "Brake fluid",
    everyNServices: null,
    costCategory: null,
    kind: "service",
    group: "long_life",
    intervalKm: null,
    intervalMonths: 24,
    note: "Time-based, not distance-based. VW TR: 3 years from new, then every 2.",
  },
  {
    name: "Brake pads",
    everyNServices: null,
    costCategory: null,
    kind: "inspect",
    group: "long_life",
    intervalKm: 30000,
    intervalMonths: null,
    note: "A WEAR item, not a scheduled one: how long pads last depends entirely on how the car is driven, and typical figures run 30,000-70,000 km. Seeded at the low end deliberately, because brakes are the one place where being early costs a service and being late costs more than that. Renault Türkiye's only published brake figure is an INSPECTION every 2 years or 20,000 km — so treat this as a prompt to have them looked at, and set your own number once you know how yours wear.",
  },
  {
    name: "Brake discs",
    everyNServices: null,
    costCategory: null,
    kind: "inspect",
    group: "long_life",
    intervalKm: 80000,
    intervalMonths: null,
    note: "Usually replaced on every second or third pad change rather than on a schedule of its own; typical figures run 80,000-120,000 km, and warping or a lip on the edge decides it long before any odometer reading does. Seeded at the low end, same reasoning as the pads.",
  },
  {
    name: "Coolant / antifreeze",
    everyNServices: null,
    costCategory: null,
    kind: "service",
    group: "long_life",
    intervalKm: 40000,
    intervalMonths: 48,
    note: "Bosch TR: 40,000–50,000 km; sources differ on the time interval (2–4 years).",
  },
  {
    name: "Drive belt (triger kayışı)",
    everyNServices: null,
    costCategory: null,
    kind: "service",
    group: "long_life",
    intervalKm: 90000,
    intervalMonths: 72,
    note: "Bosch TR: 60,000–120,000 km or 4–6 years, whichever first. Chain-driven engines need no replacement — delete this row if yours has a chain.",
  },
  {
    name: "Automatic transmission oil",
    everyNServices: null,
    costCategory: null,
    kind: "service",
    group: "long_life",
    intervalKm: 50000,
    intervalMonths: 60,
    note: "Bosch TR: 50,000–60,000 km. Remove if your car is manual.",
  },
  {
    name: "Tyres",
    everyNServices: null,
    costCategory: null,
    kind: "service",
    group: "long_life",
    intervalKm: 100000,
    intervalMonths: 60,
    note: "Usually age-driven (5–6 years) before km. Legal minimum tread in Turkey is 1.6 mm.",
  },
  {
    name: "Muayene (TÜVTÜRK)",
    everyNServices: null,
    costCategory: "inspection",
    kind: "service",
    group: "obligations",
    intervalKm: null,
    intervalMonths: 24,
    note: "Private cars: first at 3 years, then every 2. Late costs 5% of the fee per month.",
  },
  {
    name: "Trafik sigortası",
    everyNServices: null,
    costCategory: "insurance",
    kind: "service",
    group: "obligations",
    intervalKm: null,
    intervalMonths: 12,
    note: "Compulsory. Premiums are capped monthly by SEDDK per province and hasarsızlık basamağı.",
  },
  {
    name: "Kasko",
    everyNServices: null,
    costCategory: "insurance",
    kind: "service",
    group: "obligations",
    intervalKm: null,
    intervalMonths: 12,
    note: "Optional, free tariff — there is no published kasko price list, so record what you actually paid.",
  },
  {
    name: "MTV instalment",
    everyNServices: null,
    costCategory: "tax",
    kind: "service",
    group: "obligations",
    intervalKm: null,
    intervalMonths: 6,
    note: "Two equal instalments, January and July (Law 197 art. 9). A car registered before 2018 is taxed on engine size × age only, with no vehicle-value tier.",
  },
] as const

// ─── Copy ───────────────────────────────────────────────────────────

export const VEHICLE_COPY = {
  navLabel: "Vehicle",
  pageTitle: "Vehicle",
  pageSubtitle:
    "What the car has really cost you — cash out plus the value it lost — and what needs doing next.",

  // Empty states
  emptyTitle: "No car yet",
  emptyBody:
    "Add your car and its purchase price, then log what you spend on it. The maintenance plan starts from a typical Turkish schedule you can edit.",
  addVehicle: "Add car",
  editVehicle: "Edit car",

  // Cost of ownership
  costHeading: "Cost of ownership",
  totalCost: "Total cost",
  cashCost: "Cash spent",
  depreciation: "Depreciation",
  runningCostHeading: "Running cost",
  perMonth: "Fixed, per month",
  perKm: "Variable",
  blendedPerKm: "Blended",
  kmDriven: "Distance driven",
  monthsOwned: "Owned for",

  /** Why two denominators — stated once, on the card, rather than per figure. */
  denominatorHint:
    "Costs that scale with distance are shown per km; costs that accrue whether or not you drive — insurance, MTV, muayene, depreciation — are shown per month. A single blended per-km figure moves by a third on the mileage assumption alone, so it is shown last, with the distance it assumes.",

  /** Why depreciation is computed against each date's own rate. */
  depreciationHint:
    "Purchase price and current value are each converted at their own date's exchange rate. That is what stops a car whose lira price merely kept up with inflation from reading as a gain — measured in dollars it still lost value.",

  // Opportunity cost
  opportunityHeading: "Capital tied up",
  opportunityCost: "Foregone return",
  trueCost: "Cost including foregone return",
  opportunityHint:
    "What the purchase price would have become had it stayed in your portfolio, compounding at your own lifetime return rate over the same period. Not money you spent — money you didn't make.",
  opportunityUnavailable:
    "Needs at least a year of portfolio history before a rate can be annualized.",

  // Fuel economy
  fuelHeading: "Fuel",
  monthlyFuelHeading: "Fuel, per month",
  logMonthlyFuel: "Log a month of fuel",
  monthlyFuelNote: "Rough monthly estimate.",
  monthlyFuelUnavailable:
    "Needs a second odometer reading before the app knows how far you drive in a month.",
  economyAverage: "Average",
  economyBest: "Best",
  economyWorst: "Worst",
  pricePerLitre: "Average price / litre",
  totalLitres: "Total litres",
  /** Drivvo's honest-blank policy is right; its silence about it is not. Users
   *  read the blank as a bug ("I get a zero for mpg. What's up with that?"),
   *  so the reason is always stated inline. */
  economyUnavailable:
    "Consumption is measured between two full tanks. Log at least two fills with \"filled the tank\" ticked and an odometer reading on each.",

  // Maintenance
  planHeading: "Maintenance plan",
  addItem: "Add item",
  editItem: "Edit item",
  seedPlan: "Start from the Turkish default plan",
  seedPlanHint:
    "Adds the common items with typical Turkish intervals. Your car's bakım kitabı is the real authority — edit anything that differs, and delete what doesn't apply.",
  everyPrefix: "Every",
  ungroupedHeading: "Other",
  fieldGroup: "Part of the plan",
  fieldGroupHint:
    "Which part of the plan this belongs to. About kind, not how often: the fuel filter belongs with the periodic-service items even though it is changed every other service — its interval decides when it is actually due.",
  dormantCaption: "No interval set — never comes due",
  nextDue: "next due",
  nextCheck: "next check",
  lastChecked: "Last checked",
  /** An unrecorded row explains itself on the row rather than in a footnote —
   *  the status badge says "Not recorded", this says what to do about it. */
  unrecordedCaption: "no history yet — this is measured from purchase, so treat it as a floor. Log it once and it starts tracking properly.",
  fieldEveryNServices: "Every N services",
  fieldEveryNServicesHint:
    "How many periodic services pass between this item being done. 1 means every service; 2 means every other one, like a diesel fuel filter. Leave it empty for anything that is not tied to the service rhythm at all \u2014 a drive belt or an annual policy runs on its own km or time interval instead.",
  fieldKind: "At the interval",
  fieldKindHint:
    "Whether the part is replaced at the interval, or just looked at. Brake pads at 30,000 km are usually fine — the interval is a prompt to have them checked, not an instruction to buy pads. Wording only; the due point is worked out the same way either way.",
  unpricedNote: "unpriced",
  clearFilter: "Show all rows",
  per100km: "/ 100 km",
  lastDone: "Last done",
  neverDone: "Never recorded",
  serviceHeading: "Next service",
  serviceEvery: "Every",
  serviceNever: "No service recorded yet — log one and this starts tracking.",
  serviceNone: "No service interval set. Add an item and mark it as the periodic service to track one.",
  serviceDueAt: "due at",
  serviceDueBy: "or by",
  serviceProjected: "on current pace",
  serviceDueThisTime: "due this service",
  /** The cadence in words. `everyNServices` keeps the literal `{n}` — the call
   *  site interpolates it, so the string stays a string here. */
  everyService: "every service",
  everyOtherService: "every other service",
  everyNServices: "every {n} services",
  serviceBundleHeading: "What will be due by then",
  serviceBundleEmpty: "Nothing else falls due by then — a plain service.",
  lastServiceHeading: "Last service",
  lastServiceCovered: "covered",
  lastServiceNothing: "nothing recorded against it",
  lastServiceSkipped: "not done then",
  serviceObligationsHeading: "Also due around then — pay these separately",
  serviceUnknownHeading: "Worth asking them to check",
  serviceUnknownHint:
    "No history recorded for these, so the app cannot say when they were last done. Ask at the next service and log what you learn — each one starts tracking properly from then on.",
  logService: "Log a service",
  nothingDue: "Nothing due — the closest item is",
  projectedFrom: "on current pace",
  perDay: "km/day",

  // Odometer
  odometerHeading: "Odometer",
  updateOdometer: "Update reading",
  odometerAsOf: "as of",
  odometerHint:
    "Every reading sharpens the projected due dates. Any cost entry can carry one, or update it here on its own.",
  odometerBackwards:
    "That reading is lower than one already recorded on a later date. Saved anyway — check it if the due dates look wrong.",

  // Cost entries
  ledgerHeading: "Costs",
  addCost: "Add cost",
  editCost: "Edit cost",
  costAmountOptional:
    "Leave the amount empty to record that work was done without a price — the interval still resets.",
  closesItems: "Resets",
  closesItemsHint:
    "Tick every maintenance item this visit covered. Only the items you tick have their interval reset.",
  deleteCostConfirm: "Delete this cost entry?",
  deleteItemConfirm: "Delete this maintenance item?",
  deleteVehicleConfirm: "Delete this car and everything logged against it?",
  deleteItemBody:
    "Its history stays on the cost entries that closed it, but it will no longer be tracked or warned about.",
  deleteVehicleBody:
    "Every cost entry and maintenance item for it is deleted too. This cannot be undone.",

  // Value
  valueHeading: "Value",
  currentValue: "Current value",
  purchasePrice: "Bought for",
  updateValue: "Update value",
  valueSourceHint:
    "No free valuation API exists for Turkey. Look the car up in TSB's Kasko Değer Listesi (free, no signup) or arabam.com's valuation, then type the figure.",
  valueMissing: "Add the car's current value to see depreciation and total cost.",
  valueStale: "Value last read",

  // Shared form chrome and field labels
  save: "Save",
  saving: "Saving\u2026",
  cancel: "Cancel",
  delete: "Delete",
  writeFailed: "Could not save. Try again.",
  fieldDate: "Date",
  fieldCategory: "Category",
  fieldAmount: "Amount (optional)",
  fieldCurrency: "Currency",
  fieldOdometer: "Odometer (km)",
  fieldLitres: "Litres",
  fieldFullTank: "Filled the tank",
  fieldNote: "Note",
  fieldName: "Name",
  fieldIntervalKm: "Every (km)",
  fieldIntervalMonths: "Every (months)",
  fieldVehicleName: "Name",
  fieldPlate: "Plate",
  fieldMake: "Make",
  fieldModel: "Model",
  fieldModelYear: "Year",
  fieldPurchasedOn: "Bought on",
  fieldPurchasePrice: "Purchase price",
  fieldPurchaseOdometer: "Odometer at purchase",
  fieldCurrentValue: "Current value (optional)",
  columnAmount: "Amount",
  atTheTime: "at the time",
  valuePlaceholder: "Value in",
  averageSuffix: "average",
  fullTankSuffix: "full",
  tankMeasured: "tank measured",
  tanksMeasured: "tanks measured",

  // Dashboard banner
  alertOverdueTitle: "Car maintenance overdue",
  alertDueSoonTitle: "Car maintenance due soon",
  alertAndMorePrefix: "and ",
  alertAndMoreSuffix: " more",
  alertDismiss: "Dismiss",
  switcherLabel: "Which car",
  deleteVehicle: "Delete car",
  showLess: "Show less",
  showAll: "Show all",

  // Validation
  errorDateRequired: "Pick a date.",
  errorAmountInvalid: "That amount isn't a number.",
  errorOdometerInvalid: "That odometer reading isn't a number.",
  errorLitresInvalid: "That litre figure isn't a number.",
  errorNameRequired: "Give the item a name.",
  errorEveryNInvalid: "Services between doings has to be a whole number, 1 or more.",
  errorIntervalInvalid: "An interval has to be a positive number.",
  errorPriceRequired: "Enter what you paid for the car.",
  /** Both blank is legal (a dormant item) but worth saying out loud, since an
   *  item with no interval can never come due. */
  intervalBothBlankHint:
    "Leave a box empty to stop tracking that dimension \u2014 blank km means time-only (brake fluid, muayene), blank months means distance-only (drive belt). Both empty parks the item: it never comes due.",

  // Boundary rule, stated on the page
  boundaryNote:
    "This page never touches your portfolio: nothing here creates a transaction or changes any balance, net worth or P&L figure. Car spending is already inside the Budget page's \"spent\" — this explains part of it rather than adding to it.",
} as const

/** TSB's Kasko Değer Listesi — free, no key, no signup; the reference Turkish
 *  insurers themselves use for a car's value, and the basis for the MTV kasko
 *  relief. A monthly HTML query plus a file download, so it is a link for the
 *  owner to read, not something the app can fetch. */
export const TSB_KASKO_VALUE_URL = "https://www.tsb.org.tr/tr/kasko-deger-listesi"
