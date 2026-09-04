# Component 17: Vehicle — Behavioral Spec

> Layer: behavioral (tech-agnostic). Implementation → [technical/17-vehicle.md](technical/17-vehicle.md)
>
> **Status: built** (v0.16.0; corrected in v0.16.1; grouped plan in v0.17.0;
> desktop layout in v0.17.1; the periodic service became a first-class thing in
> v0.20.0). The contract below describes the shipped behavior.

## Purpose

Answer two questions about a car the owner keeps but does not invest in:

1. **What has it really cost me?** — not just the receipts, but the receipts
   plus the value the car lost, reduced to a cost per month and a cost per km.
2. **What needs doing at the next service?** — per-item intervals anchored on
   the last time each was actually done, so "belt changed at 130,000 km" becomes
   "next due at 220,000" — and the next periodic service becomes a point on the
   calendar with everything that will have fallen due by then listed against
   it.

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
- [Service visit](GLOSSARY.md#service-visit) /
  [Services cadence](GLOSSARY.md#services-cadence)
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
- **An obligation closes itself.** Paying the road tax means the tax instalment
  is done; there is nothing to choose. So an item can declare which kind of
  outlay closes it, and where exactly one item claims that kind, the entry
  states what it closed instead of asking. Where several claim it — three
  policies, say — it is a real choice and the selector returns, over the
  claimants only. **A service visit is the one genuinely ambiguous case**,
  closing an arbitrary combination of parts, and it is the only place a
  selector is always shown.
  An item that claims nothing stays reachable from every outlay in its group:
  filtering it out everywhere at once would make it impossible to close.
- **An entry only offers the items it could plausibly have closed.** A tax
  payment cannot renew a drive belt and a fill closes nothing, so the reset
  list is filtered by the outlay's category — down to a single item for the
  categories where exactly one thing can be meant, and hidden entirely for the
  ones that close nothing. Narrowing the category also drops any tick that is
  no longer possible: left in place it would be invisible in the form and
  still reset that item on save.
- **An odometer reading is offered only where it is part of the record** — a
  fill, a service, tyres, an inspection. A policy renewal or a tax instalment
  is paid at a desk, and the mileage it happened at is not information, so the
  field is not shown. Where it is offered it stays optional, because every
  reading sharpens the projections. A reading can always be recorded on its own
  from the odometer card.

### The periodic service

The periodic service is not one item among seventeen. It is **the event the
rest of the plan happens at**: parts are replaced at one, wear items are looked
at during one. And the question an owner actually has is not "what is due
today" but **"when I go in at 157,000 km, what will be due by then?"** — a
query over a future point, which a flat list of items cannot answer. An oil
change falling due 2,000 km before the service belongs on that visit; one
falling due 20,000 km after it does not, and no ordering of one list separates
them.

So the [service visit](GLOSSARY.md#service-visit) has **its own surface**, and
the plan below it is the parts.

**The service is a third kind of maintenance item, not a property of the car**
— at most one per car, and never two. Its cadence is a distance-and-time pair
read whichever-comes-first and projected onto a date from the car's own pace:
exactly what a maintenance item already is, and exactly what the schedule
already computes for one. Recording that same pair against the car instead
would fork the arithmetic across two shapes and buy nothing, because the visit
is also a thing that gets done on an interval and has to be anchored on the
last time it happened. Only its kind says it is the visit rather than a part.

Being an item has two consequences the owner sees. The service **is not listed
in the plan** — a plan is a list of parts — and **it cannot be created by
hand**: the item form does not offer that kind, because there is one service
cadence per car and a second row claiming to be "the" next service would make
the surface arbitrary.

The surface answers three questions, in this order:

1. **When is it?** — the distance still to run leads, because that is the
   answer; then the due point, the date it is projected to fall on at the car's
   current pace, and when the last one was.
2. **What will be due by then?** — every item whose own due point falls at or
   before the service's, anything already due, and anything whose turn it is by
   its [cadence in services](GLOSSARY.md#services-cadence). Due points are
   compared on whichever dimension both sides know: the projected dates first
   (the service's own projection has already resolved whichever-comes-first),
   then distance. This is the list to hand the mechanic, and each line says
   which of those reasons put it there — "it is this service's turn" and "it
   has 800 km left" are different things to authorise.
3. **What should they check?** — the items **nothing has ever been recorded
   for**. They cannot be scheduled honestly, so they are **never mixed into the
   list above**; but they are exactly what to raise while the car is on the
   ramp, and asking is how they stop being unknown.

One action **logs the service and closes the bundle**: it opens a cost entry
with the service itself and every listed item already closing, filed as
maintenance rather than as a fill.

**With no cadence recorded** there is no future point to measure against, so
the surface says the cadence is missing rather than inventing one. **With a
cadence but no service ever logged** it says that instead of projecting the
next visit from the purchase point — the same honest-blank rule the rest of the
schedule follows. In both cases the bundle falls back to what is due today,
which is all that can be said without a future point. Dormant items and
never-recorded ones are never in the bundle either way: one has no due point at
all, the other's is a floor.

The **"due at your next service" card this replaces is gone.** It listed what
was already due and called that the next visit, which is the weaker question:
what is overdue today is only a subset of what the visit should cover.

### The maintenance plan

One [maintenance item](GLOSSARY.md#maintenance-item) per recurring job, each
with its own intervals — per item, not per mileage milestone. The plan is the
parts; the service they are done at is the surface above it.

**One job, one item.** Engine oil and the oil filter are two items, not one
row: they are bought separately and can be done separately — a top-up is not a
filter change — and a row that welds them together can record neither on its
own. Where a plan held them as a single row, the history that row carried
counts for **both**, since a service that changed "oil & filter" changed both.

Items carry a [group](GLOSSARY.md#maintenance-group), and the plan is read a
group at a time: **periodic-service** consumables, **long-term** parts, and the
**insurance, tax & inspection** obligations that recur on a clock but are not
maintenance. A plan of seventeen rows is otherwise a flat list of three quite
different kinds of thing.

Group membership is about **kind, not interval length** — a fuel filter replaced
every *other* service still sits with the periodic-service consumables, because
that is what it is and where its owner looks for it; its interval decides when
it is actually due, and its [services cadence](GLOSSARY.md#services-cadence) is
where "every other service" is stated. Grouping is presentation only: it never changes a due point, and the next-service bundle
ignores groups, so an overdue obligation is never buried by it.

**A blank interval means that dimension is not tracked.** There is no separate
"track by distance / time / both" setting; the blank is the instruction:

An **obligation is never offered a distance interval** at all — insurance, tax
and inspection recur on a calendar and cannot care how far the car was driven,
so a km figure there could only mislead. Any value typed before the group was
switched is discarded on save.

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

### Measured in services

Most things in the periodic-service group are done at **every** service. A
diesel fuel filter is done at every **other** one. That cannot be derived from
the distance intervals: 40,000 km against a 15,000 km service is 2.67 services,
while the rule the trade actually works to is plainly "every second service".
So the [cadence in services](GLOSSARY.md#services-cadence) is its own fact and
has to be stated — one means every service, two means every other, and a blank
means the item is not tied to the service rhythm at all, which is the right
answer for a drive belt or an annual policy.

It decides exactly two things: whether logging a service **pre-ticks** the
item, and whether the service surface says it is **due this time**. An item
whose turn it is joins the next-service bundle whatever its own interval says —
the fuel filter is every second service regardless of how far through its
40,000 km it happens to be.

The services that count are the ones recorded **after the item was last done**.
Strictly after: a service and the work done at it share a date, so counting the
same-day one would report a service already gone by the moment the work was
logged. (An item with no history at all is never in the bundle on any grounds —
it is on the ask-them-to-check list instead.)

The count **includes the service the item is done at** — "every second service"
means done at the first, then the third — so what decides is which number the
*upcoming* service will be. An every-service item is due again as soon as one
service sits behind it, and is never due the instant it was logged.

The cadence is **stated on the item**, free numeric entry like its intervals,
and it is **not offered for an obligation**: a policy renewal or a tax
instalment happens at a desk on a calendar and has no service rhythm to be a
multiple of. Blank is the instruction here as it is for the intervals — not
tied to the rhythm — and is never read as a zero.

It is deliberately **not** folded into
[interval used](GLOSSARY.md#interval-used) or into the
[status ladder](GLOSSARY.md#maintenance-status-ladder), both of which stay
distance-and-time. Those answer "how far through its own interval is this?";
this answers "is it this service's turn?". They are different questions, and
merging them would produce a three-dimensional percentage nobody could reason
about.

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

### Replace, or just look

An item records **what happens at its interval**: the part is replaced, or it
is merely checked. Brake pads at 30,000 km are usually fine — the interval is a
prompt to have them looked at, not an instruction to buy pads — and recording
that check must reset the reminder without claiming a part was fitted.

It changes wording only; the due point is computed identically. But the wording
is what decides what the owner does, so "next check at 158,000 km" and "next
due at 158,000 km" are not interchangeable. No comparator models this: they
bury the verb inside the item's own name, which is why their schedules cannot
style or group by it.

The check-only items share the periodic service's cadence, which is what
"looked at during the next service" means in practice — and the service is an
item of its own kind, so the visit is recorded whether or not any single part
was changed.

### Status and warnings

The [status ladder](GLOSSARY.md#maintenance-status-ladder) — overdue, due soon,
not recorded, OK, not tracked — is derived on every read and **never stored**;
a stored status is wrong the morning after it is written.

**An item nothing has ever closed reports "not recorded", never "overdue".**
Its percentage is measured from the purchase, which is a floor and not a fact,
so it shows that estimate but never asserts it: it stays out of the
next-service bundle — it is offered as something to ask the mechanic about
instead — and never warns on the dashboard. This is the honest-blank rule
applied to the schedule — money on this page renders unknown with a reason
rather than a flattering zero, and a red badge built on a placeholder anchor
was the one place the component contradicted itself.

The due-soon threshold is a **proportion** of the interval (within 10% of due),
not a fixed distance or number of days, so one rule works at every scale.

What is due has **no card of its own**: it is part of the periodic service
surface, which asks the stronger question — not "what is overdue today" but
"what will be due by the time I go in". The real workflow is one visit closing
several items, so the bundle stays **actionable** and stays group-blind: one
action opens a cost entry with every listed item already closing — categorized
as maintenance, since a row that closes service items is a visit and not a fill
— so closing a whole visit does not mean hunting for each item in a long
checkbox list.

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

**Cash is also totalled into four buckets** at the head of the ledger — fuel,
maintenance, the recurring obligations, and everything else — with each
bucket's share. Four rather than one per category: nine rows of spend is a
table nobody reads, and four is the question actually being asked, which is
how much of this car is petrol, how much is keeping it running, how much is
the state and the insurer, and how much is neither.

**Each bucket filters the ledger.** Activating one shows only its rows;
activating it again clears the filter, because a filter with no way out is a
trap and there is no other affordance for "show me everything". The unselected
buckets dim rather than disappear — the row exists for the comparison between
them, and a filter that erased three quarters of it would defeat its own
purpose. Entries recorded without a price get their own chip, since they belong
to a category but contribute to no total and would otherwise be unreachable.

Every bucket sits wholly on one side of the fixed/variable split, so the two
cuts can never contradict each other — one says where the money went, the
other says which denominator it belongs under. The buckets always total to the
cash figure: a category that no bucket claims falls into "other" rather than
disappearing, because a breakdown that silently drops spend is worse than no
breakdown. Entries recorded without a price are excluded and counted, since
the totals cannot include them.

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

### What fuel costs a month

A monthly figure, from the car's **own observed pace** — distance per month ×
consumption × price per litre.

**Its purpose is to fill in a cost entry, not to be read.** A figure on a card
changes no total; a logged row changes cost of ownership, which is the thing
being asked for. So the estimate carries one action that opens the normal cost
form prefilled with the month's amount and litres — one rough entry a month
instead of a receipt per fill. The row that results is an ordinary row: the
owner's, editable, deletable, and indistinguishable from a fill logged by hand.

That is also why the app does not try to know pump prices. The owner logs
roughly, and everything else — price per litre, consumption, the fuel share of
running cost — is derived from those logs.

It is **rough, and presented as rough** — a leading `≈` and its three inputs
printed underneath it. Anyone reading "6.0 L/100km · ₺88.88/L" can see exactly
what the figure rests on, and that is the whole disclosure it needs.

**Measured beats assumed, independently for each input, and silently.**
Consumption comes from full-tank data when there is any and from a stated
assumption otherwise; the price comes from the owner's own fills when one
recorded both litres and an amount, and from a stored pump price otherwise. The
inputs are shown, so which of the two supplied them does not need announcing —
an earlier version labelled each one and carried a paragraph on how fast a
stored pump price ages, which was more caveat than a rough estimate is worth.

**The measured price is the last fill's, not the lifetime average.** The two
are different claims: the average is a fact about the history, the last fill a
fact about what fuel costs now, and only the second can forecast a month. In a
currency that loses a third of its value in a year the distance between them is
not a rounding difference — a history of monthly rows running from ₺48 to ₺89
per litre averages near ₺59, and projecting the coming month off that average
comes out a quarter light. (A quarter and not a third, because every outlay is
converted at its own day's rate: the currency fell over the same span the price
rose, so converting first absorbs part of the gap. The correction is smaller
than the raw prices suggest, and still a quarter of the figure.) The average
is still shown, labelled as an average, because the total litres and the
lifetime price per litre are genuinely historical figures.

**A price needs both halves from the same fill.** One row's litres divided by
another row's amount is not a price anybody paid, so a fill that recorded
litres but no cost leaves the previous fill's price standing rather than
reading as free fuel.

**Nothing is shown at all without an observed pace.** No typical annual
mileage is substituted: the whole estimate hangs off how far this car actually
goes, and inventing that would make the rest of it decoration. That is also
the only reachable reason for the figure to be absent, which is why the one
explanation offered is accurate — a measured consumption is positive by
construction, and the fallbacks are constants.

The stored pump price is a fallback of last resort, and it ages fast — Turkish
diesel moved 9.6% in one night in September 2026 and its duty is legislated to
climb monthly into 2027. That is a reason to prefer the owner's own fills, not
a reason to bury the estimate in warnings: logging one fill with its litres and
its amount replaces the stored figure with what was actually paid.

### Distance is shown only where distance applies

A kilometre figure never appears against something that has no distance
dimension. That means: an obligation is offered no km interval; an item with no
km interval shows no due odometer, no distance remaining, and **no odometer on
its last-done line** (the reading at which a tax bill was paid is noise beside
the date that matters); and the cost form asks for a reading only for the kinds
of outlay where the car was actually there.

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
  wherever the reason is not obvious, it is stated inline. **A total that
  excludes something says so**: entries recorded without a price contribute
  nothing to the cash figure, so their count is printed beside it rather than
  leaving a partial sum looking complete.
- **No percentage of an interval is printed.** The meter already encodes it, and
  a figure like "11.4% used" claims a precision neither input has — the interval
  is a round manufacturer guess and the odometer is one moment's reading.
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
- **A car with no service cadence** — the service surface says the cadence is
  missing, and what it can still show is what is due today.
- **A cadence with no service ever logged** — the surface says so rather than
  projecting the next visit from the purchase point.
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
