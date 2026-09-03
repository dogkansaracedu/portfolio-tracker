# Component 17: Vehicle — Technical (this build)

> Layer: React/Vite/Supabase implementation. Contract → [../17-vehicle.md](../17-vehicle.md)
>
> **Status: built and shipped** (v0.16.0). Every path below is a real pointer.

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
| `src/lib/constants/vehicle.ts` | Route and table names, `VEHICLE_DEFAULT_CURRENCY`, `VEHICLE_COST_CATEGORIES` (+ labels, fixed/variable split), `MAINTENANCE_STATUS` (+ `MaintenanceStatus`), `MAINTENANCE_DUE_SOON_PCT` / `MAINTENANCE_OVERDUE_PCT`, `MAINTENANCE_STATUS_RANK` / `_LABELS` / `_BAR_CLASSES` / `_TEXT_CLASSES`, `VEHICLE_ALERT_*`, `FUEL_ECONOMY_*`, `DEFAULT_MAINTENANCE_PLAN` (the seeded plan, each row sourced in a comment), `TSB_KASKO_VALUE_URL`, and **all** user-visible copy (`VEHICLE_COPY`). |
| `src/lib/vehicle/schedule.ts` | Pure schedule engine: `addDaysIso`, `addMonthsIso`, `odometerReadings`, `odometerView`, `maintenanceItemState`, `maintenancePlanState`, `dueItems`, `nextUpItem`. Types `OdometerReading`, `OdometerView`, `MaintenanceItemState`. |
| `src/lib/vehicle/costs.ts` | Pure cost engine: `computeOwnershipCost`, `computeOpportunityCost`. Types `OwnershipCost`, `OpportunityCost`, `CategoryTotal`. |
| `src/lib/vehicle/fuel.ts` | Pure `computeFuelEconomy` (full-tank segmentation). Types `FuelEconomy`, `FuelSegment`. |
| `src/lib/vehicle/index.ts` | Barrel, matching `lib/budget` / `lib/retirement`. |
| `src/lib/vehicle/schedule.test.ts` | Vitest (27 cases): calendar-month clamping, odometer collection and pace, backwards readings, the drive-belt case end to end, the reset rule (only named items, same-day tie, multi-item visit, null amount), the two dimensions incl. dormant, the 90/100% boundaries, threshold scaling, plan ordering. |
| `src/lib/vehicle/costs.test.ts` | Vitest (15 cases): lira-gain/dollar-loss depreciation, per-date vs today's-rate conversion, null-value propagation, null amounts, the fixed/variable split and both denominators, distance edge cases, opportunity cost incl. null rate and a negative rate. |
| `src/lib/vehicle/fuel.test.ts` | Vitest (12 cases): the two-full-tank rule, partial fills folded in, distance-weighted average, withheld readings on missing litres or a missing odometer, same-day ordering, per-date fuel pricing. |
| `src/lib/queries/vehicle.ts` | CRUD for all four tables, plus `seedMaintenancePlan` (one bulk insert from the template) and `setEntryItems` (delete-then-insert the join rows). `fetchCostEntries` nests the join table and flattens it to `item_ids`. |
| `src/contexts/VehicleContext.tsx` | Provider: `{ vehicles, items, entries, loading, error, refresh, addVehicle, editVehicle, removeVehicle, addItem, editItem, removeItem, seedPlan, addEntry, editEntry, removeEntry }`. Loads all three tables in one `Promise.all`; writes patch the local lists in place. Mounted innermost in `src/main.tsx`. |
| `src/hooks/useVehicle.ts` | `useVehicle(vehicleId?)` composes the stored rows with rates and the portfolio rate into everything the page renders. `useVehicleAlerts()` is the banner's separate, cheaper path. |
| `src/components/vehicle/display.ts` | Render-side wording, kept out of the components and out of the pure lib: `NO_DATA`, `formatKm`, `formatVehicleDay`, `statusLabel`, `formatInterval`, `remainingPhrase`, `duePhrase`, `lastDonePhrase`, `formatConsumption`, `formatLitres`, `formatMonths`, `formatUsedPct`, `projectionLabel`. |
| `src/components/vehicle/MaintenanceChart.tsx` | The chart (one meter per item, with edit/delete) **and** `DueSummary` (the next-visit bundle). |
| `src/components/vehicle/CostOfOwnershipCard.tsx` | The headline: cash / depreciation / total, the two denominators, the denominators' own values, and the capital-tied-up block. |
| `src/components/vehicle/CostBreakdown.tsx` | Cash spend by category as ranked bars. |
| `src/components/vehicle/FuelCard.tsx` | Average / best / worst consumption, litres and price per litre; the withheld-figure explanation. |
| `src/components/vehicle/VehicleReadingsCard.tsx` | Odometer and market value, both updated in place and stamped today; the pace figure, the backwards-reading warning, and the TSB link. |
| `src/components/vehicle/CostEntryForm.tsx` | Add/edit a cost entry, including the fuel-only fields and the item checkboxes that reset intervals. |
| `src/components/vehicle/MaintenanceItemForm.tsx` | Add/edit a plan item — two free numeric interval boxes, both optional. |
| `src/components/vehicle/VehicleForm.tsx` | Add/edit the car; on create, the caller seeds the default plan. |
| `src/components/dashboard/VehicleAlerts.tsx` | The two dashboard banners, mirroring `InterestAlerts` (same tones, named-then-summarized list, session dismissal). |
| `src/pages/VehiclePage.tsx` | Composes the page; owns every dialog and confirmation. |

Edits to **existing** files:

| Path | Change |
|---|---|
| `src/types/database.ts` | `Vehicle`, `VehicleMaintenanceItem`, `VehicleCostEntry` row interfaces + the six numeric-widening insert/update types. |
| `src/main.tsx` | `<VehicleProvider>` mounted inside `<InterestProvider>`. |
| `src/App.tsx` | Lazy `VehiclePage` + the `vehicle` route. |
| `src/lib/constants/navigation.ts` | Secondary nav entry (`Car` icon), between Campaigns and Settings. |
| `src/pages/DashboardPage.tsx` | `<VehicleAlerts />` under `<InterestAlerts />`. |
| `docs/components/GLOSSARY.md` | Eleven new entries (vehicle, cost entry, cost category, maintenance item, interval used, status ladder, depreciation, cost of ownership, foregone return, fuel economy). |
| `package.json` / `CHANGELOG.md` | 0.15.0 → 0.16.0. |

## Schema (as shipped)

Four tables. `vehicles` carries the purchase trio plus two all-or-nothing
column groups (value + currency + date; odometer + date), each guarded by a
`CHECK`. `vehicle_maintenance_items` holds nullable `interval_km` /
`interval_months`. `vehicle_cost_entries` is the single ledger, with a
**nullable `amount`** and fuel-only `litres` / `is_full_tank` (guarded by a
`CHECK` that they are absent on a non-fuel row).
`vehicle_cost_entry_items` is the many-to-many that records which items an
entry closed.

Indexes cover the read paths (`vehicle_id, date`; `vehicle_id, sort_order`;
`user_id, is_active`), the RLS predicates, and every `auth.users` FK — Postgres
does not index FK columns automatically and an unindexed one turns user
deletion into a sequential scan. `vehicle_cost_entry_items` gets an index on
`item_id` for the "which entries closed this item?" direction the PK does not
cover.

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
