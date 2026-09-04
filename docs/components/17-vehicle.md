# Component 17: Vehicle — Behavioral Spec

> Layer: behavioral (tech-agnostic). Implementation → [technical/17-vehicle.md](technical/17-vehicle.md)
>
> **Status: built** (v0.16.0; corrected in v0.16.1; grouped plan in v0.17.0;
> desktop layout in v0.17.1). The contract below describes the shipped
> behavior.

## Purpose

Answer two questions about a car the owner keeps but does not invest in:

1. **What has it really cost me?** — not just the receipts, but the receipts
   plus the value the car lost, reduced to a cost per month and a cost per km.
2. **What needs doing next?** — per-item service intervals anchored on the last
   time each was actually done, so "belt changed at 130,000 km" becomes "next
   due at 220,000, and here is what to bundle into the next visit".

The first question is the reason this lives in a finance app rather than a car
app. Every car-tracking app records real receipts and ignores capital
entirely; the cost-of-ownership tools model capital properly but only for a
hypothetical average new car in one low-inflation currency. Neither computes
what a *specific* car cost its *specific* owner. That gap is this component.

It is a **notebook, not a ledger** — the same boundary Components 15 and 16
keep.

## Depends on

- Component 2 (data store & auth) — per-user storage, isolated per account.
- Component 5 (price engine) — **read only**, for the historical exchange rates
  that convert each cost at its own date.
- Component 6 (P&L engine) — **read only**, and only for the portfolio's own
  lifetime return rate, used by [foregone return](GLOSSARY.md#foregone-return).
  Nothing is written back.

Surfaces it appears on: Component 7 (dashboard warnings).

## Concepts used — links into [GLOSSARY](GLOSSARY.md)

- [Vehicle](GLOSSARY.md#vehicle) — the car record.
- [Cost entry](GLOSSARY.md#cost-entry) / [Cost category](GLOSSARY.md#cost-category)
- [Maintenance item](GLOSSARY.md#maintenance-item) /
  [Maintenance group](GLOSSARY.md#maintenance-group) /
  [Interval used](GLOSSARY.md#interval-used) /
  [Maintenance status ladder](GLOSSARY.md#maintenance-status-ladder)
- [Depreciation (vehicle)](GLOSSARY.md#depreciation-vehicle) /
  [Cost of ownership](GLOSSARY.md#cost-of-ownership) /
  [Foregone return](GLOSSARY.md#foregone-return)
- [Fuel economy](GLOSSARY.md#fuel-economy)

## The boundary rule

**A vehicle, its costs and its maintenance plan create no transactions and
touch no holdings, balances, net worth or P&L.** Recording fuel changes no
portfolio number; the car's value is absent from total value and from the
allocation view. A car is consumption with a resale value, not a position —
counting it as one would distort allocation and read its purchase as *invested*
rather than spent.

It also does **not** change budgeting. Component 14 is a residual model
(spent = income − invested), so car spending is *already inside* that residual.
This component explains part of "spent"; it never adds to it, and never
double-counts. For the same reason its rows are **cost entries**, not
"expenses": Component 14 reserves `expense` for its own future ledger.

The single number that crosses the boundary is read-only and inbound: the
portfolio's lifetime annualized return, used to price the capital tied up in
the car.

## Behaviors / rules

### What a vehicle records

- **Identity** — name (what the owner calls it), plate, make, model, year. Only
  the name is required. All of it is displayed, as a caption under the page
  title, which on a narrow screen is the only thing that says which car the
  figures belong to.
- **Purchase** — date, price in the currency actually paid, and **the odometer
  at purchase**. A used car does not start at zero; treating it as though it did
  would inflate every per-km figure.
- **Current value** — hand-entered, with the currency and **the date it was
  read**. Always all three or none: a value without its date cannot be converted
  honestly, and a value without its currency cannot be converted at all.
- **Odometer** — the latest standalone reading, with its date. All-or-nothing
  for the same reason.
- **Archive flag** — stored and read (lists show active cars, and only active
  cars raise warnings), but **no control writes it**, so in this build every car
  is permanently active. The only removal shipped is a confirmed delete. The
  read path exists for the archive control that is out of scope, not for a
  state the owner can currently reach.

The current value is **always typed, never fetched.** No free machine-readable
valuation source exists for the Turkish market: the insurers' reference list is
a monthly file download rather than an API, and the classified sites refuse
automated access. So the app links to the free reference and asks the owner to
read it — the same `manual` convention an unpriced asset already uses. A stale
value is visible as a date, never hidden.

### The one ledger

Every outlay is one [cost entry](GLOSSARY.md#cost-entry), and an entry **may
additionally close one or more maintenance items**. So one visit to the servis
is one row that both costs money and resets the intervals it covered; a fuel
fill is one row that closes nothing. Cost and schedule are not two ledgers to
keep in agreement.

Three rules on entries:

- **Amounts are recorded in the currency actually paid** and normalized at
  **each entry's own date's rate**, never at today's. Saving a row also ensures
  the rate for that day exists, because a car's dates routinely fall outside
  what the rest of the app has needed — otherwise a conversion silently
  degrades to the nearest earlier day it does know. Single amounts render in
  their own currency and are never re-denominated; only aggregates convert.
- **The amount is optional.** An empty amount records that work was done at a
  price no longer remembered — it contributes nothing to any total (it is not
  zero) and still resets whatever the row closes. This is exactly how a
  remembered-but-unpriced past service is entered.
- **An odometer reading is optional but always offered**, because every reading
  sharpens the projections.

### The maintenance plan

One [maintenance item](GLOSSARY.md#maintenance-item) per recurring job, each
with its own intervals — per item, not per mileage milestone.

Items carry a [group](GLOSSARY.md#maintenance-group), and the plan is read a
group at a time: **every-service** consumables, **long-term** parts, and the
**insurance, tax & inspection** obligations that recur on a clock but are not
maintenance. A plan of fourteen rows is otherwise a flat list of three quite
different kinds of thing.

Group membership is about **kind, not interval length** — a fuel filter replaced
every *other* service still sits with the every-service consumables, because
that is what it is and where its owner looks for it; its interval decides when
it is actually due. Grouping is presentation only: it never changes a due point,
and the due-at-next-service bundle ignores groups, so an overdue obligation is
never buried by it.

**A blank interval means that dimension is not tracked.** There is no separate
"track by distance / time / both" setting; the blank is the instruction:

| distance | time | meaning |
|---|---|---|
| set | blank | distance-only (a drive belt) |
| blank | set | time-only (brake fluid, an inspection, an annual policy) |
| set | set | whichever comes first |
| blank | blank | dormant — never becomes due, never warns |

Intervals are **free numeric entry**. A schedule that cannot express what the
owner's own mechanic told them gets abandoned, so no picker constrains them to
a fixed set of values.

Some items are **wear** items rather than scheduled ones — brake pads and discs
above all, whose life depends entirely on how the car is driven. They are
seeded at the **low end** of their published range, because on brakes being
early costs a service and being late costs more than that, and their notes say
plainly that the figure is a prompt to have them inspected rather than a
replacement date.

Because no free source of manufacturer schedules exists, the app offers a
**default plan of typical local intervals** on first use — oil and filters,
fuel filter, plugs, brake fluid, brake pads and discs, coolant, transmission
oil, the drive belt, tyres, plus the local recurring obligations (inspection every 2 years, annual
policies, the twice-yearly vehicle tax instalment). It is a starting point,
fully editable, and the UI says plainly that the car's own service book is the
authority.

### When an item is due

An item is anchored on **the last time it was actually done**: the most recent
cost entry naming it, a same-day tie broken by the higher odometer. The app
does the forward arithmetic — the owner never computes a future target.

With nothing ever recorded, the interval is measured from the purchase point
and the item **says so**. For a used car that is a floor rather than a fact,
and presenting it as a fact is how a schedule quietly misleads.

- **Distance due point** = last-done odometer + distance interval.
- **Time due point** = last-done date + the interval in *calendar* months (a
  day-of-month the target month lacks clamps to that month's end).
- **[Interval used](GLOSSARY.md#interval-used)** is the further along of the two
  dimensions, so an item that has aged past its interval is due even if it has
  barely moved — which is the whole point for a rubber belt.
- **A distance due point is also projected as a date**, from the car's average
  pace, so "whichever comes first" can be read off a calendar. The projection is
  shown only when distance is what actually falls due first; otherwise it would
  just repeat the date already printed.

An interval resets **only for the items an entry explicitly names.** Nothing
resets on a timer.

### Status and warnings

The [status ladder](GLOSSARY.md#maintenance-status-ladder) — overdue, due soon,
OK, not tracked — is derived from interval used on every read and **never
stored**; a stored status is wrong the morning after it is written.

The due-soon threshold is a **proportion** of the interval (within 10% of due),
not a fixed distance or number of days, so one rule works at every scale.

Items already due are grouped into a **"due at your next service"** bundle —
the real workflow is one visit closing several items, and the list is shaped to
be handed to the mechanic. **The bundle is actionable**: one action opens a cost
entry with every listed item already ticked — and categorized as maintenance,
since a row that closes service items is a visit, not a fill — so closing a
whole visit does not mean hunting for each item in a long checkbox list. When nothing is due, the
card names the closest upcoming item rather than rendering empty.

Overdue and due-soon items raise **one dashboard banner** covering both levels
across every active car, overdue first and taking their tone. Deliberately one
rather than one per level: both levels mean the same thing to the owner ("book
a servis"), and a second banner costs a phone's whole first screen on the
dashboard of a *portfolio* tracker. It names a few items, summarizes the rest,
names the car only when several are involved, and links to the vehicle page.
Dismissal lasts the browser session only: this is a nudge, not a task list, so
it returns on the next visit if nothing was done.

### The odometer

There is no separate odometer log. The current reading is the freshest of: the
purchase baseline, the vehicle's own standalone reading, and any reading carried
by a cost entry. The standalone pair exists so "I drove but bought nothing" can
be recorded in one gesture.

**Average pace** is measured across the whole recorded span, not the most
recent pair, so one long trip or one quiet fortnight cannot swing every
projected date. With one reading, no span, or no forward movement there is **no
pace figure at all** — a zero would project every distance-based item as due
infinitely far away.

**A reading lower than one on an earlier date is warned about, never
rejected.** A hard block makes a single typo permanent and backfilling
impossible; the current reading takes the highest known value so it cannot go
backwards, and the owner is told to check it.

### Cost of ownership

[Cost of ownership](GLOSSARY.md#cost-of-ownership) = every cost entry (each at
its own date's rate) + [depreciation](GLOSSARY.md#depreciation-vehicle). Cash
and capital are shown **side by side and then summed** — depreciation is
usually the largest single component and burying it is the standard mistake.

Two denominators, because the halves accrue differently: **fixed costs plus
depreciation per month**, **variable costs per km**. The blended per-km figure
is offered last and never without the distance it assumes.

With no current value recorded there is no depreciation, therefore no total, no
fixed-per-month and no blended per-km — all render as unknown, with the reason
stated. What remains knowable (cash spent, variable per km) still shows.

Neutral palette throughout: spending is not a loss, so the gain/loss colors
never appear on this page.

### Capital tied up

[Foregone return](GLOSSARY.md#foregone-return) prices the capital: what the
purchase price would have become at the owner's own lifetime annualized return
over the holding period, and the cost of ownership plus that figure.

It is kept visually apart from the cash figures because it is money *not made*,
not money spent. It is unavailable — with the reason stated — when the
portfolio is too young for a rate to be annualized. A negative rate produces a
negative foregone figure, which is the honest answer: had the money stayed
invested it would have shrunk, so the car cost less than its receipts suggest.

### Fuel

[Fuel economy](GLOSSARY.md#fuel-economy) is measured only between two full
tanks, distance-weighted across every complete span (not a mean of the spans).
Best and worst spans are named; with only one span there is an average but no
"worst", since calling the only reading the worst says nothing.

**Where a figure is withheld, the reason is shown.** The honest blank is
correct; silence about it is what makes owners conclude the feature is broken.

### Display rules

- Every **money** figure follows the **app-wide display currency** toggle and
  the **privacy toggle**, including the ledger's amounts.
- **Odometer readings are not masked.** A distance is not money, and the
  schedule prints dozens of km figures (last done, next due, distance driven)
  that cannot be masked without destroying the thing the page is for — so
  masking one reading would hide nothing while looking broken. One rule,
  applied consistently.
- **A stored fact renders in its own recorded currency; only derived aggregates
  follow the display toggle.** That covers a cost entry's amount, the purchase
  price and the current value — the alternative had the same hand-typed value
  reading two different numbers on one screen.
- Where a stored amount is not in the anchor, **the anchored equivalent at that
  amount's own date is printed beside it**. Without it the depreciation figure
  cannot be checked against the two numbers under it: the operands are lira and
  the difference is dollars, which is the entire point and yet reads as an error
  when only one side is shown.
- Amounts that cannot be computed render as unknown, never as a fake zero — and
  wherever the reason is not obvious, it is stated inline.
- **Every span uses one unit convention**, in the coarsest honest unit: days up
  to a quarter, then months, then years. An interval reads "every 2 years", not
  "every 24 months", and time remaining reads in years rather than as a
  four-digit day count nobody can act on.
- The page states its own boundary rule, so the absence of these figures from
  net worth is never a surprise.

## Edge cases

- **No car yet** — an empty state that explains what the page will do and
  offers to create one; creating a car seeds the default plan.
- **A car that has not moved since purchase** — no distance driven, so no
  per-km figures at all (not a division by a small number).
- **An odometer below the purchase baseline** — treated as no progress rather
  than negative distance.
- **A dormant item** (both intervals blank) — listed, never due, never warned
  about, and labelled as untracked.
- **A deleted maintenance item** — the cost entries that closed it survive; they
  simply stop anchoring anything.
- **Several cars** — supported; a switcher appears only when more than one
  exists. Dashboard banners span all active cars.
- **Deletes are confirmed.** Removing a car removes everything logged against
  it, and the confirmation says so.
- **Every write reports its own failure** on the surface that made it, with the
  editor left open and what was typed still in it. None may fail silently.

## Out of scope (recorded extensions)

- **Per-item cost splits inside one visit** — one visit's cost stays on the
  visit. Splitting it per item would answer "which item costs me most" at the
  price of a fiddlier form than the question warrants today.
- **Any automated valuation** — no free machine-readable source exists; see the
  boundary above.
- **Cost forecasting** of fuel, tax or insurance. Local fuel duty was on a
  monthly escalator at the time of writing, so a projection would be fiction.
- **Reminders outside the app** (email/push).
- **A cross-link from budgeting's "spent" residual** to the car's share of it —
  natural, and deliberately not built until asked for.
- **The car in net worth** — explicitly rejected, not deferred.
- **Archiving a car from the UI.** The flag and the reads exist; no control
  writes it. A confirmed delete is the only removal, which is the honest
  escape hatch for a mistyped car; archive earns its control when a car is
  actually sold.
- **A spend-by-category breakdown.** Built, then cut: it re-sliced a figure
  already in the headline and already itemized in the ledger below it, and it
  was neither of the two things asked for nor one of the three opted-in extras.
