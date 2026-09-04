# Component 17: Vehicle — Technical (this build)

> Layer: React/Vite/Supabase implementation. Contract → [../17-vehicle.md](../17-vehicle.md)
>
> **Status: built and shipped** (v0.16.0; UX-review fixes in v0.16.1; grouped
> maintenance plan in v0.17.0; the service visit as its own kind, the services
> cadence and the oil/filter split in v0.20.0). Every path below is a real
> pointer.

## Stack

- **Supabase Postgres** — four per-user tables with the standard four
  `auth.uid() = user_id` RLS policies (the join table inherits ownership via
  `EXISTS`). No edge function, no cron: every row is hand-entered from the
  client.
- Frontend: a React context provider (repo convention — shared server data
  never fetch-on-mount per call site), shadcn/ui `Card` / `Dialog` /
  `AlertDialog` / `Select` / `Table` / `Input`, BigNumber.js for all money and
  quantity math.
- **No new price, chart or P&L code.** Rates come from
  `TransactionDataContext`; the "chart" is the meter idiom `ForeignIncomeCard`
  already established, so Recharts is not involved.

## File map

| Path | Role |
|---|---|
| `supabase/migrations/20260904120000_vehicle.sql` | Four tables + indexes + RLS. Carries the design rationale in comments (one ledger, blank-means-ignore, nullable amount). |
| `supabase/migrations/20260904190000_vehicle_item_kind.sql` | Adds `item_kind` (service / inspect) and moves the brake items onto the periodic-service cadence. |
| `supabase/migrations/20260904220000_vehicle_auto_close.sql` | Adds `cost_category` (the auto-close link) and folds the `tyres` cost category into `maintenance`. |
| `supabase/migrations/20260904160000_vehicle_maintenance_groups.sql` | Adds `item_group` (CHECKed to three values, defaulting to `routine`) and backfills a seeded plan **by name**, so an existing plan groups itself. |
| `supabase/migrations/20260905090000_vehicle_service_visit.sql` | Widens the `item_kind` CHECK to a third value, `service_visit`, promotes the seeded "Periodic service" / "Periyodik bakım" row to it **by name**, and adds the partial unique index `idx_vehicle_one_service_visit` (`vehicle_id` WHERE `item_kind = 'service_visit'`). Carries the argument for a kind over interval columns on `vehicles` in comments. |
| `supabase/migrations/20260905120000_vehicle_service_cadence.sql` | Adds nullable `every_n_services integer CHECK (> 0)`, backfills `1` for the periodic-service group and `2` for the fuel filter (by name, TR and EN), then splits "Engine oil & filter" into `Engine oil` + a new `Oil filter` row that copies the interval, group, kind, cadence, sort order, note **and every join row the oil item had** (`ON CONFLICT DO NOTHING`), so the shared history anchors both. |
| `src/lib/constants/vehicle.ts` | Route and table names, `VEHICLE_DEFAULT_CURRENCY`, `VEHICLE_COST_CATEGORIES` (+ labels, fixed/variable split), `MAINTENANCE_GROUPS` (+ `MaintenanceGroup`, `_LABELS`, `_RANK`, `DEFAULT_MAINTENANCE_GROUP`), `MAINTENANCE_KINDS` / `DEFAULT_MAINTENANCE_KIND` / `INSPECT_KIND` / **`SERVICE_VISIT_KIND`** (the last deliberately *outside* `MAINTENANCE_KINDS`, so the form's picker cannot offer it), `MAINTENANCE_STATUS` (+ `MaintenanceStatus`), `MAINTENANCE_DUE_SOON_PCT` / `MAINTENANCE_OVERDUE_PCT`, `MAINTENANCE_STATUS_RANK` / `_LABELS` / `_BAR_CLASSES` / `_TEXT_CLASSES`, `VEHICLE_ALERT_*`, `FUEL_ECONOMY_*`, `DEFAULT_MAINTENANCE_PLAN` (the seeded plan, each row sourced in a comment), `TSB_KASKO_VALUE_URL`, and **all** user-visible copy (`VEHICLE_COPY`). |
| `src/lib/vehicle/schedule.ts` | Pure schedule engine: `addDaysIso`, `addMonthsIso`, `odometerReadings`, `odometerView`, `maintenanceItemState`, `maintenancePlanState`, `dueItems`, `nextUpItem`, and the service trio `nextServiceState` / `planItems` / `nextServiceBundle`. Types `OdometerReading`, `OdometerView`, `MaintenanceItemState` (now also carrying `servicesSince` / `dueThisService`), `NextServiceBundle`. |
| `src/lib/vehicle/costs.ts` | Pure cost engine: `computeOwnershipCost`, `computeOpportunityCost`. Types `OwnershipCost`, `OpportunityCost`. |
| `src/lib/vehicle/fuel.ts` | Pure `computeFuelEconomy` (full-tank segmentation). Types `FuelEconomy`, `FuelSegment`. |
| `src/lib/vehicle/index.ts` | Barrel, matching `lib/budget` / `lib/retirement`. |
| `src/lib/vehicle/schedule.test.ts` | Vitest (49 cases): calendar-month clamping, odometer collection and pace, backwards readings, the drive-belt case end to end, the reset rule (only named items, same-day tie, multi-item visit, null amount), the two dimensions incl. dormant, the 90/100% boundaries, threshold scaling, plan ordering, the unrecorded rung — and the service-cadence block: the count itself, the same-day exclusion, every-service vs every-other in both directions, more than one service behind, an item with no history, an item not tied to the rhythm, a car with no service visit, only entries that closed the service item counting, and that none of it moves the meter or the status. |
| `src/lib/vehicle/costs.test.ts` | Vitest (14 cases): lira-gain/dollar-loss depreciation, per-date vs today's-rate conversion, null-value propagation, null amounts, the fixed/variable split and both denominators, distance edge cases, opportunity cost incl. null rate and a negative rate. |
| `src/lib/vehicle/fuel.test.ts` | Vitest (12 cases): the two-full-tank rule, partial fills folded in, distance-weighted average, withheld readings on missing litres or a missing odometer, same-day ordering, per-date fuel pricing. |
| `src/lib/queries/vehicle.ts` | CRUD for all four tables, plus `seedMaintenancePlan` (one bulk insert from the template) and `setEntryItems` (delete-then-insert the join rows). `fetchCostEntries` nests the join table and flattens it to `item_ids`. |
| `src/contexts/VehicleContext.tsx` | Provider: `{ vehicles, items, entries, loading, error, refresh, addVehicle, editVehicle, removeVehicle, addItem, editItem, removeItem, seedPlan, addEntry, editEntry, removeEntry }`. Loads all three tables in one `Promise.all`; writes patch the local lists in place. Mounted innermost in `src/main.tsx`. |
| `src/hooks/useVehicle.ts` | `useVehicle(vehicleId?)` composes the stored rows with rates and the portfolio rate into everything the page renders; `allStates` is computed once and split into `service` (`nextServiceState`), `plan` (`planItems`) and `serviceBundle` (`nextServiceBundle`). `useVehicleAlerts()` is the banner's separate, cheaper path. |
| `src/components/vehicle/display.ts` | Render-side wording, kept out of the components and out of the pure lib: `NO_DATA`, `formatKm`, `formatVehicleDay`, `statusLabel`, **`formatMonthSpan`** / **`formatDaySpan`** (the one span convention — days to a quarter, then months, then years), `formatInterval`, `remainingPhrase`, `duePhrase`, `lastDonePhrase`, `formatShortDay` (the narrow-screen date, so a table row keeps room for its actions), `formatConsumptionValue` / `formatConsumption`, `formatLitres`, `formatMonths`, `formatUsedPct`, `projectionLabel`. |
| `src/components/vehicle/MaintenanceChart.tsx` | The chart only: one meter per item, with edit/delete, the item's note behind a `HintPopover`, and `showProjection` gating the projected-date line. `DueSummary` **was removed from this file** in v0.20.0 — the next-visit bundle now belongs to the service surface, which asks a different question. |
| `src/components/vehicle/NextServiceCard.tsx` | The service surface: the cadence in its title, then when the service is due (remaining figure leading, then due point / due-by date / projected date / last done), `bundle.due` (each row reading either `serviceDueThisTime` or its remaining figure, so the reason it is listed is visible), `bundle.unknown` behind its own divider and hint, and one "Log a service" button that hands `[service.item.id, ...bundle.due]` to the cost form. Renders `VEHICLE_COPY.serviceNone` and nothing else when the car has no service item; swaps the whole due block for `serviceNever` while the status is `unrecorded`. |
| `src/components/vehicle/CostOfOwnershipCard.tsx` | The headline: cash / depreciation / total, the two denominators, the denominators' own values, and the capital-tied-up block. Takes the `vehicle` so the purchase price and current value render in their **own** recorded currency. |
| `src/components/vehicle/FuelCard.tsx` | Average / best / worst consumption, litres and price per litre; the withheld-figure explanation. |
| `src/components/vehicle/VehicleReadingsCard.tsx` | Odometer and market value, both updated in place and stamped today; the pace figure, the backwards-reading warning, and the TSB link. |
| `src/components/vehicle/CostEntryForm.tsx` | Add/edit a cost entry, including the fuel-only fields and the item checkboxes that reset intervals. |
| `src/components/vehicle/MaintenanceItemForm.tsx` | Add/edit a plan item — two free numeric interval boxes plus the services cadence, all optional. The cadence box is hidden for the obligations group (a policy renewal has no service rhythm), blank saves NULL rather than zero, and a non-integer or `< 1` fails with `errorEveryNInvalid` before the write. The kind picker iterates `MAINTENANCE_KINDS`, which is why it cannot offer `service_visit`, and an unrecognised stored kind falls back to the default for display. |
| `src/components/vehicle/VehicleForm.tsx` | Add/edit the car; on create, the caller seeds the default plan. |
| `src/components/dashboard/VehicleAlerts.tsx` | **One** dashboard banner covering both loud statuses (overdue first, taking their tone), borrowing `InterestAlerts`' shape but not its two-banner split. |
| `src/pages/VehiclePage.tsx` | Composes the page; owns every dialog and confirmation. `vehicleSubtitle` renders the car identity. Layout order: cost card, then the service card **beside** the readings card (they share a `lg:grid-cols-2` row — a short list alone at full content width throws its figures a thousand pixels from their labels), then the plan, fuel, ledger. |

Edits to **existing** files:

| Path | Change |
|---|---|
| `src/types/database.ts` | `Vehicle`, `VehicleMaintenanceItem`, `VehicleCostEntry` row interfaces + the six numeric-widening insert/update types. `VehicleMaintenanceItem` carries `item_kind` and the nullable `every_n_services`; both are optional on insert, so a row that says nothing about the service rhythm keeps the column's NULL. |
| `src/main.tsx` | `<VehicleProvider>` mounted inside `<InterestProvider>`. |
| `src/App.tsx` | Lazy `VehiclePage` + the `vehicle` route. |
| `src/lib/constants/navigation.ts` | Secondary nav entry (`Car` icon), between Campaigns and Settings. |
| `src/pages/DashboardPage.tsx` | `<VehicleAlerts />` under `<InterestAlerts />`. |
| `src/lib/queries/vehicle.ts` | `seedMaintenancePlan` maps the template's `everyNServices` onto `every_n_services`, so a newly created car gets the same cadences the migration backfilled onto existing ones. |
| `docs/components/GLOSSARY.md` | Eleven entries for the original build, plus **service visit** and **services cadence** in v0.20.0; the maintenance-item, maintenance-group, interval-used and status-ladder entries all point at them. |
| `package.json` / `CHANGELOG.md` | 0.15.0 → 0.16.0, then 0.16.1 for the review fixes; 0.20.0 for the service visit, the services cadence and the oil/filter split. |

## Schema (as shipped)

Four tables. `vehicles` carries the purchase trio plus two all-or-nothing
column groups (value + currency + date; odometer + date), each guarded by a
`CHECK`. `vehicle_maintenance_items` holds nullable `interval_km` /
`interval_months`, an `item_kind` CHECKed to `service` / `inspect` /
`service_visit`, and a nullable `every_n_services` (CHECK `> 0`). `vehicle_cost_entries` is the single ledger, with a
**nullable `amount`** and fuel-only `litres` / `is_full_tank` (guarded by a
`CHECK` that they are absent on a non-fuel row).
`vehicle_cost_entry_items` is the many-to-many that records which items an
entry closed.

Indexes cover the read paths (`vehicle_id, date`; `vehicle_id, sort_order`;
`user_id, is_active`), the RLS predicates, and every `auth.users` FK — Postgres
does not index FK columns automatically and an unindexed one turns user
deletion into a sequential scan. `vehicle_cost_entry_items` gets an index on
`item_id` for the "which entries closed this item?" direction the PK does not
cover. One more index is a constraint rather than a read path:
`idx_vehicle_one_service_visit` is **partial and unique** on `vehicle_id` where
`item_kind = 'service_visit'`, which is what makes "at most one service visit
per car" a database fact instead of a client convention.

RLS: the standard four `(SELECT auth.uid()) = user_id` policies on the three
owned tables (the scalar subquery makes Postgres evaluate `auth.uid()` once per
statement rather than once per row). The join table has no `user_id` of its own
and inherits ownership through an `EXISTS` against `vehicle_cost_entries`.

## Logic

- **`odometerView`** collects readings from three sources, sorts by date (ties
  by the higher reading), and reports the **maximum** as current so a backwards
  log cannot make "current" go down. `kmPerDay` spans first→last reading and is
  `null` for a single reading, a zero-length span, or no forward movement.
  `hasBackwardsReading` drives a warning, not a rejection.
- **`maintenanceItemState`** anchors on `lastCompletion` — the latest entry whose
  `item_ids` contains this item, same-day ties broken by odometer — falling back
  to the purchase point with `anchoredAtPurchase: true`. Each dimension is
  computed only when its interval is non-null and positive; `intervalUsedPct` is
  `Math.max` over the tracked ones, `null` only when neither is tracked (→
  `dormant`). The time percentage is measured against **the same calendar span
  the due date uses** (`daysBetween(lastDone, dueDate)`), so the bar and the date
  can never disagree. `projectedDueDate` is the earlier of the time due date and
  `today + kmRemaining / kmPerDay`, by string comparison on ISO days.
- **`addMonthsIso`** builds the target month from `Date.UTC(year, month + n, 1)`
  and then clamps the day-of-month to that month's length, so 31 Jan + 1 month
  is 28/29 Feb rather than spilling into March.
- **Day arithmetic** reuses `daysBetweenIsoDays` / `isoDayToUtcMs` from
  `src/lib/campaigns.ts` — the app's one implementation of "whole days between
  two `YYYY-MM-DD` values", which Component 16 already reuses rather than
  restating.
- **The service trio is three filters over one already-computed plan state**,
  not a second pass: `nextServiceState` finds the `SERVICE_VISIT_KIND` row,
  `planItems` returns everything else, and `nextServiceBundle` partitions the
  parts. So the visit's remaining distance, due date and projected date come out
  of `maintenanceItemState` exactly as a part's do — the reason it is a kind and
  not a pair of columns on `vehicles`.
- **`nextServiceBundle`** drops `unrecorded` (no honest due point) and `dormant`
  (no due point at all) from the schedulable set, returning the `unrecorded`
  ones separately as `unknown`. An item joins `due` if it is already in a
  warning status, if `dueThisService` (the count rule can fire long before the
  km one), or if its own due point is at or before the service's:
  `projectedDueDate ?? dueDate` compared as ISO strings first — the projection
  has already resolved whichever-comes-first on both sides — then `dueKm`
  against the service's `dueKm`. With `service === null` it degrades to
  `dueItems`-equivalent filtering, because there is no future point to compare
  against.
- **The cadence is answered by `serviceCadence`, and it is a whole-plan
  question.** `maintenanceItemState` is only ever handed one item, so it sets
  `servicesSince: null` / `dueThisService: false` and `maintenancePlanState`
  overwrites both — threading the car's service item and its entries through
  every caller to compute a field the plan function already has the material
  for would be the wrong shape. `servicesSince` counts the entries that closed
  the **service-visit item** and fall **strictly after** the item's own last
  completion (a service and the work done at it share a date, so a same-day
  service is the one the item was just done at); an item anchored at the
  purchase point counts every service ever recorded, since a floor is not a day
  anything happened on. `dueThisService` is `servicesSince + 1 >= cadence`: the
  cadence counts the service the item is done AT, so 2 means #1, #3, #5, and
  what decides is which number the upcoming service will be. Without the `+ 1`
  an every-service item would stop being due the instant it was logged.
- **`every_n_services` never enters `intervalUsedPct` or the status ladder**, by
  design (both migration comment and function comment carry the argument): the
  meter answers "how far through its own interval", the cadence answers "is it
  this service's turn", and one percentage cannot hold both.
- **`computeOwnershipCost`** is BigNumber throughout. Every amount goes through
  `normalizeToUsd(amount, currency, entry.date, rates)` from `src/lib/pnl/currency.ts`
  — per-entry-date, the same convention Component 14 uses. A `null` amount
  contributes nothing (it is not zero). Depreciation, and therefore `totalUsd`,
  `fixedUsd`, `fixedPerMonthUsd` and `blendedPerKmUsd`, are `null` when the car
  has no recorded value. `kmDriven` is `null` unless the current reading exceeds
  the purchase baseline.
- **`computeOpportunityCost`** reuses `compoundFactor` from
  `src/lib/retirement/projection.ts` (the app's one `(1 + r)^years`) rather than
  restating it, and returns `null` for a null rate, a zero price or a zero span.
- **`computeFuelEconomy`** walks the fuel rows in happened order and opens a
  segment at each full tank with a reading. The opening fill's own litres are
  **excluded** (they belong to the previous segment); a fill with no litres marks
  the open segment incomplete so it is skipped rather than under-reported; a full
  tank with no reading breaks the chain. The average is distance-weighted
  (total litres ÷ total distance), not a mean of segment figures.
- **`useVehicle`** pulls rates from `TransactionDataContext` (already loaded for
  the budget and P&L surfaces) and the portfolio rate from `usePnLSummary` +
  `computeLifetimeXirrPct`, then passes the rate into the pure module **as a
  plain percentage** — so `lib/vehicle` still knows nothing about the portfolio.

## Frontend notes & gotchas

- **`useVehicleAlerts` is deliberately a second hook, not a slice of the
  first.** The schedule needs no exchange rates and no P&L, so the dashboard
  banner costs nothing beyond the rows the provider holds — no rate table, no
  XIRR solve, no P&L engine on a page that only needs to know what is overdue.
- The three tables load together in one `Promise.all`: the schedule cannot say
  what is due without both the plan and the entries that closed its items, so
  splitting them would buy two round-trips and a partial render.
- `fetchCostEntries` asks for `*, vehicle_cost_entry_items(item_id)` and
  `withItemIds` flattens the nested rows into `item_ids`, so nothing downstream
  knows a join table exists. `updateCostEntry` takes `itemIds?` where
  `undefined` means "leave the links alone" and `[]` means "clear them".
- `setEntryItems` is delete-then-insert rather than a diff: the set is a handful
  of rows and what is at stake is whether an interval reset.
- `removeItem` also strips the id from every local entry's `item_ids`, mirroring
  the database's cascade on the join table — otherwise the schedule would keep
  anchoring on an item that no longer exists until the next refresh.
- **`item_group`, not `category`.** `vehicle_cost_entries.category` already owns
  that word for what an outlay was *for*; one concept per term is a house rule,
  and the two really are different axes. The migration backfills existing plans
  **by name** rather than by position, so a plan seeded before the column
  existed groups itself; anything unrecognised keeps the `routine` default,
  which is the only value that never hides a real maintenance item under
  paperwork.
- **`vehicle_maintenance_items.cost_category` is the auto-close link**:
  nullable, un-CHECKed (it mirrors `vehicle_cost_entries.category`, and two
  constraints over one vocabulary drift the moment either changes), and NULL
  means "only ever closed by hand", which is every real maintenance item. The
  form auto-closes when exactly one item claims the entry's category, and
  keeps unclaimed items selectable so they cannot become unreachable — the
  case that made this necessary was a renamed obligation claiming nothing.
- **Tyres is no longer a cost category.** It existed because AAA breaks tyres
  out separately, but the breakdown card that would have shown it is gone and
  both tyres and maintenance are variable costs, so the split bought a dropdown
  row and changed no figure.
- **`VEHICLE_CATEGORY_CLOSES` maps a cost category to the item groups it can
  close**, which is the third axis in play and the one that stops the form
  offering nonsense: `tax` → `obligations` only, `fuel`/`fine`/`parking` → `[]`
  (the section does not render), `other` → everything. `setCategory` re-filters
  `itemIds` on every change, because a tick that survives a narrowing is
  invisible and still resets its item on save.
- **`DAYS_PER_MONTH` lives in `src/lib/xirr.ts`**, beside `DAYS_PER_YEAR`,
  imported by both `costs.ts` and `fuel.ts`. It was briefly declared in each,
  which is exactly the drift a shared constant exists to prevent — a month has
  to mean one thing wherever this component divides by it.
- **`DEFAULT_FUEL_PRICE` is a constant only because the official source is
  shut.** EPDK's province dealer report now redirects to an e-Devlet login and
  its public page is a JSF POST form with no JSON and no stable GET. Two
  key-free distributor endpoints DO exist and would be the real fix —
  `api.opet.com.tr/api/fuelprices/prices?ProvinceCode=934` (plain JSON, no
  timestamp field) and `ucuzyakitbul.com.tr/api/prices/national` (documented
  public, carries an ISO date) — which would want an edge function, following
  `fetch-prices`. Not built. Sources and the legislated duty schedule are in
  `docs/prior-art/vehicle-cost-of-ownership.md`.
- **`avgPricePerLitreUsd` is null, not zero, when litres were logged without
  amounts.** It divides spend by litres, so an amount-less book produced a
  literal zero — and a zero made the measurement *worse* than none, because
  the monthly estimate then refused to run rather than falling back to its
  default. Found in review, pinned with a test.
- **The bucket totals are `<button aria-pressed>`, not styled divs.** They
  change what the table below shows, so they have to be keyboard-reachable and
  announced as toggles, and they carry `max-sm:min-h-10` because a 20px figure
  is not a tap target. `UNPRICED_FILTER` is the one non-bucket filter value.
  The visible-row slice and the "show all N" count both apply to the filtered
  set, not the whole ledger.
- **`VEHICLE_COST_GROUPS` folds the nine categories into the four the ledger
  totals by**, and `VEHICLE_COST_GROUP_OF` is derived from it so the two cannot
  disagree. The obligations bucket reads its label from
  `MAINTENANCE_GROUP_LABELS` rather than restating it — one concept, one term.
  An unrecognised category is bucketed as `other`, so `byGroup` always sums to
  `cashUsd`; a test pins that, and another pins that no bucket straddles the
  fixed/variable split.
- **Two constants gate every km figure**, so "no distance dimension" is stated
  once each side: `OBLIGATIONS_GROUP` (no km interval on the item form) and
  `VEHICLE_ODOMETER_CATEGORIES` (no reading on the cost form). `lastDonePhrase`
  is the third place and reads `item.interval_km === null` directly. Both forms
  also null the value on save, since a field that has gone away can still hold
  what was typed before the category or group changed.
- **`OBLIGATIONS_GROUP` is a named constant, not a string literal at the call
  site.** `MaintenanceItemForm` drops the km input for that group and forces
  `interval_km` null on save; the name keeps the form and the constants from
  drifting.
- **`SERVICE_VISIT_KIND` lives outside `MAINTENANCE_KINDS`**, which is what
  keeps it out of `MaintenanceItemForm`'s picker without a filter at the call
  site: the picker iterates the array, the constant is not in it. Uniqueness is
  not enforced in the client at all — the partial unique index is, so a second
  visit row fails on insert rather than silently making "the" next service
  arbitrary.
- **The service item is promoted by name, not by position.** A plan whose
  service row was renamed to something the migration's `ILIKE` list does not
  match stays a plain item, and the card then reads "no service interval set"
  — recoverable only by editing the row's kind, which the form does not offer.
  The trade was deliberate: guessing at an unrecognised name is worse than
  saying nothing.
- **`planItems` is applied before `dueItems` / `nextUpItem` in the hook**, so
  the service visit can never appear in the plan chart or as "the closest thing
  coming up" — it is the thing they are measured against. `useVehicleAlerts`
  keeps its own `dueItems(states)` over the *unfiltered* states; the visit
  falling due is exactly the thing the dashboard banner should say.
- **The oil/filter split copies join rows, not amounts.** The new `Oil filter`
  row inherits every `vehicle_cost_entry_items` link the oil row had, so both
  items anchor on the same completions — but nothing is copied into
  `vehicle_cost_entries`, so no cost is double-counted. A visit that changed
  "oil & filter" now shows as having closed two items.
- **Desktop layout is where the groups pay off twice.** `MaintenanceChart`
  renders its groups as grid COLUMNS (`md:grid-cols-2 xl:grid-cols-3`,
  `items-start` so the uneven 4/6/4 columns do not stretch), collapsing to the
  original single stack below `md`. The page then puts the service card, the
  readings card and the fuel card in one `lg:grid-cols-2 xl:grid-cols-3` band,
  and the cost card pairs its denominators with its capital block from `xl`.
  A consequence: every row now lives in a narrow column at every breakpoint,
  so the projected-due-date moved from sharing the "next due" line to a line of
  its own — inline it wrapped at all widths rather than only on a phone.
- **The chart groups; the engine does not.** `maintenancePlanState` still sorts
  purely by status and interval-used, and `MaintenanceChart` partitions the
  result in `MAINTENANCE_GROUPS` order. Sorting by group inside the engine would
  make a pure function depend on a display concern. The chart also renders an
  "Other" section for any group value not in the constants, so a value added to
  the CHECK but not to the array cannot make rows silently vanish.
- **Every vehicle write backfills the TCMB rate for its own date**
  (`ensureRatesFor` in `VehicleContext`, wrapping `ensureHistoricalRate` — the
  same contract the transaction path uses: non-fatal, the row is already saved).
  This is not optional here: the vehicle tables carry dates the transaction
  tables never saw (a purchase predating the portfolio, a valuation read last
  month, a fill on a day nothing was traded) and `exchange_rates` is backfilled
  **on demand**, so those days are routinely missing. Found in production — a
  purchase date sat 18 days past the last known rate, and
  `getExchangeRateForDate` walked back to it silently, worth a $713 error on the
  capital half of cost of ownership.
  **Known wrinkle:** the backfilled row lands in the database but not in the
  `rates` array this session already holds (it comes from
  `TransactionDataContext`), so a figure that needed a new rate is correct on
  the next load rather than immediately. Deliberately not fixed by calling that
  provider's `refresh()` — it would refetch every transaction to pick up one
  rate, and couple two providers that are otherwise independent.
- **Every dialog `<form>` carries `className="contents"`.** Without it the form
  is a `display: block` box between `DialogContent`'s flex column and
  `DialogBody`, so the body's `min-h-0 flex-1 overflow-y-auto` is inert and the
  footer lands below the viewport on a phone (measured 172px below the fold on
  Add cost). Every dialog in the repo does this; mine did not, until a UX review
  measured it. The checkbox list's `max-h-44` clamp was a workaround for the
  same symptom and was removed with the cause.
- **A `SelectValue` with no children renders the raw value**, so the category
  trigger read "fuel" and would have read "tax" instead of "Tax (MTV)". The
  app-wide convention is to resolve the label inside it; both currency triggers
  pass their value explicitly for the same reason.
- **A stored fact renders in its own recorded currency.** The cost card's
  footnote used `useDisplayMoney` for the purchase price and current value,
  which put the same hand-typed value on screen twice with two different
  numbers (₺903,600 in the readings card, ₺904,464 in the cost card — the second
  being a USD normalization re-converted at today's rate). Only derived
  aggregates follow the display toggle.
- **`Figure`'s label row is `min-h-6`.** A `HintPopover` trigger is a 40px tap
  target on a phone against a bare label's 16px, which knocked the figures in a
  row off their shared baseline — in the one card whose whole argument is that
  cash and depreciation are comparable halves.
- **Odometer readings are not masked** by the privacy toggle. The schedule
  prints dozens of km figures that cannot be masked without destroying it, so
  masking one reading hid nothing and read as a bug.
- All three dialogs re-seed on the **closed→open transition, during render**
  (the `wasOpen` pattern from `ScenarioNameDialog` / `InterestPositionForm`), not
  in a `useEffect`: callers build `prefillItemIds` inline, so an effect keyed on
  it would re-seed every render.
- Numeric columns take `BigNumber.toFixed()` strings, so the insert/update types
  widen `amount`, `odometer`, `litres`, `purchase_price`, `purchase_odometer`,
  `current_value` and both intervals to `number | string`.
- `VEHICLE_DEFAULT_CURRENCY` is `TRY`, not the app-wide `DEFAULT_CURRENCY`
  (USD): every cost of running a car here is paid in lira, so defaulting to USD
  would be wrong on essentially every entry. Still per-row editable.
- Status colors come from `MAINTENANCE_BAR_CLASSES` / `MAINTENANCE_TEXT_CLASSES`,
  **never** `gainLossClass` — the rule Components 15 and 16 follow for rates. The
  meter reuses `ForeignIncomeCard`'s exact idiom (`h-2 overflow-hidden
  rounded-full bg-muted` + a tinted inner bar) and its three-step ladder, so a
  meter means one thing app-wide.
- The meter's width is clamped to 100% while the figure beside it reads past
  100, so an overdue item fills the bar without overflowing it and still says
  how far past it is.
- The `projectedDueDate` line renders only when distance falls due before time;
  otherwise it would restate the due date printed beside it.
- `VehicleContext.tsx` trips `react-refresh/only-export-components` — the same
  Provider-plus-hook convention all fourteen other contexts in the repo use, and
  the same lint error they all carry.

## Deviations from the pre-build plan

- **One ledger instead of two tables.** The plan sketched separate cost entries
  and maintenance records; they collapsed into `vehicle_cost_entries` + a join
  table once it was clear that a service visit is a single event that both costs
  money and resets intervals. Recording it twice was the alternative.
- **No `odometer_readings` table.** The vehicle's own `odometer` / `odometer_at`
  pair plus per-entry readings cover what Drivvo needs a dedicated record type
  for.
- **`amount` became nullable**, which was not in the plan. It is what makes
  "belt done at 130,000 km, price forgotten" recordable at all.
- **Delete-car shipped** with a confirmation. It was not asked for, but the
  confirmation dialog was already written and an unreachable dialog is a bug;
  the alternative was a CRUD surface with no way to undo a mistyped car.
- **The category-breakdown card was built and then cut** in the post-build UX
  review, along with `byCategory` in `costs.ts` and its test. It re-sliced
  `cashUsd`, which the headline already shows and the ledger already itemizes,
  and its bars used `bg-primary` — the app's gain colour — on a chart of money
  spent. Restoring it is one component plus one fold.
- **`DueSummary` gained a "Log this visit" action** in the same review. The
  `prefillItemIds` plumbing had shipped with no caller, which made the bundle a
  list you could read but not act on. `emptyForm` defaults the category to
  `maintenance` when items are pre-ticked — it had stayed on `fuel`, which
  filed a servis visit as a fill and showed the litres fields. The component is
  gone in v0.20.0; `NextServiceCard` inherits the same `openAddCost` plumbing
  and the same `maintenance` default.
- **Label rows in `Figure` carry `max-sm:min-h-10`, not just `min-h-6`.** The
  first attempt matched only the bare labels, leaving the row with a
  `HintPopover` 16px taller — the review caught that the pair still did not
  share a baseline.
- **The ledger's date is short below `sm`.** Making it `whitespace-nowrap` (to
  stop a four-line wrap at 320px) widened the table enough to push the row's
  delete action outside the scroll container, so the narrow form is the short
  date rather than a wrapped long one.

## Open questions / recorded extensions

- **`addDaysIso` / `addMonthsIso` want a shared home.** `addDays` already exists
  in `src/lib/interest.ts`, and `daysBetweenIsoDays` / `isoDayToUtcMs` live in
  `src/lib/campaigns.ts`. Three components now do ISO-day arithmetic; a
  `src/lib/isoDay.ts` promoted from all three is the right end state, and was
  deliberately not done mid-feature (it would have edited two shipped
  components).
- **Per-item cost splits inside one visit** — see the behavioral spec's
  out-of-scope list.
- **A budgeting cross-link** ("of which car: $X" against the spent residual) —
  the natural next integration, deliberately unbuilt.
