# Changelog

All notable changes to this project are documented here. Newest first.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versioning is [Semantic Versioning](https://semver.org/spec/v2.0.0.html) — fixes
and patches move only the third digit.

## [0.23.0] — 2026-09-05
- **"Log a month of fuel"** turns the monthly estimate into a real cost entry,
  prefilled and editable — one rough row a month instead of a receipt per fill,
  so fuel actually lands in your total cost of ownership. Everything else
  (price per litre, consumption) is then derived from what you logged.

## [0.22.2] — 2026-09-05
- The monthly fuel figure is just a rough figure again: "≈ ₺7,726" with its
  three inputs under it. The per-input measured/assumed labels and the
  paragraph about pump prices going stale were more hedging than an estimate
  needs.

## [0.22.1] — 2026-09-05
- The stored diesel price is now 88.88 TL/L as of 4 September, not 81.07 — it
  jumped 7.76 TL/L overnight on Brent and a diesel crack-spread blowout, so the
  old figure was 9.6% low. The card now shows how many days old the price is,
  not just its date.

## [0.22.0] — 2026-09-05
- **Click a bucket in the costs table to filter the rows to it** — click it
  again to clear. The unpriced entries get their own chip, so the rows missing
  a price are findable.
- **Fuel now shows roughly what a month costs**, from how far the car actually
  goes. It says which of its inputs are measured and which assumed: your own
  fills replace the assumed consumption and the stored pump price the moment
  one records both litres and an amount. The stored price is shown with the
  date it was read, never as current — Turkish diesel duty was rising monthly,
  so it ages fast.

## [0.21.0] — 2026-09-05
- The costs table now totals your spending into four buckets — **fuel,
  maintenance, insurance/tax/inspection, and other** — with each one's share,
  so you can see where the money actually goes without reading the rows.

## [0.20.0] — 2026-09-05
- **The periodic service is its own thing now, not a line in the plan.** It has
  its own card: when the next one is due, then the more useful answer — what
  will have fallen due by the time you get there — and a separate list of
  things worth asking them to check, because nothing has ever been recorded for
  them. One button logs the visit and closes the lot. The old "Due at your next
  service" card is gone; it only ever listed what was already late.
- **An item can be set to every service or every other service.** A diesel fuel
  filter is every second one, which no kilometre figure can say (40,000 km
  against a 15,000 km service is 2.67 services). It decides what gets ticked
  when you log a service and what the service card calls due this time — the
  meters and the warnings still go by distance and time.
- **Engine oil and the oil filter are two items.** They are bought separately
  and can be done separately, and one row could record neither on its own. The
  history the old row carried counts for both.
- The card also shows **what the last service covered, and what it skipped** —
  so "last time was oil and filters, no fuel filter, therefore the fuel filter
  is this time's job" is on screen rather than something you work out.

## [0.19.0] — 2026-09-04
- **Obligations close themselves.** Logging an MTV instalment, an insurance
  renewal or a muayene fee now resets the matching item without asking — there
  was never anything to choose. A service visit is the only genuinely
  ambiguous case, so it stays the only one with a selector.
- **Tyres is no longer its own cost category** — it is maintenance, which it
  always was for the fixed/variable split. Existing tyre entries were moved.

## [0.18.1] — 2026-09-04
- A cost entry only offers the maintenance items it could plausibly have
  closed: choosing Tax (MTV) no longer lets you tick "Timing belt". Fuel,
  fines and parking close nothing, so that section disappears for them, and
  tax, insurance and inspection show exactly the one item they can mean.

## [0.18.0] — 2026-09-04
- Items now say whether the interval means **replace** or just **check**. Brake
  pads at 30,000 km are usually fine, so their interval is a prompt to have
  them looked at — they read "next check", not "next due", and recording a
  check resets the reminder without claiming a part was fitted.
- **The periodic service is a tracked item** — 1 year or 15,000 km, whichever
  first — so the visit itself is on the plan, and the check-only items share
  its cadence.
- An item nothing has ever recorded now reads **"Not recorded"** instead of a
  red "Overdue". It was asserting a missed service from a date that had never
  been entered, filling the due list and raising a dashboard alarm. It still
  shows its from-purchase estimate; it just no longer claims it as fact.
- "Log this visit" no longer files insurance and road tax as per-km
  maintenance, the cash total says how many entries have no price recorded,
  and the per-km figures are quoted per 100 km (at 2dp "$0.01 / km" was one
  significant digit for a headline number).

## [0.17.5] — 2026-09-04
- The maintenance plan's first group is **Periodic service**, not "Every
  service" — it is what the work is actually called (periyodik bakım).

## [0.17.4] — 2026-09-04
- No kilometre figure appears against anything that has no distance dimension:
  a time-only item like MTV or kasko no longer shows an odometer on its
  last-done line, and the cost form asks for a reading only where the car was
  actually there — not on a policy renewal or a tax instalment paid at a desk.

## [0.17.3] — 2026-09-04
- Insurance, tax and inspection no longer ask for a kilometre interval — they
  recur on a calendar and never on distance, so the field could only mislead.
- Layout fixes: "Capital tied up" now matches the heading beside it instead of
  reading as a figure label with a missing value, and the costs table's delete
  button is reachable on a 320px screen.

## [0.17.2] — 2026-09-04
- A maintenance row now reads as one item: the due point sat right-aligned
  across from the remaining figure, which in a narrow column put it closer to
  the next item's name than its own. Everything under the meter is one
  left-aligned sentence, and each row carries a divider.
- Brake pads and discs join the default plan — a maintenance plan without
  brakes in it was a real gap. Both are wear items, so both are seeded at the
  low end of their range with a note saying why.

## [0.17.1] — 2026-09-04
- The Vehicle page uses a desktop screen instead of ignoring it: the
  maintenance plan's three groups become three columns, and the due-list,
  odometer/value and fuel cards share one band rather than stacking. Far less
  scrolling on a wide screen; a phone is unchanged.
- Inside the cost-of-ownership card, the per-month/per-km figures and the
  capital-tied-up block now sit side by side on a wide screen.

## [0.17.0] — 2026-09-04
- The maintenance plan is now grouped: **every service** (oil and filters),
  **long-term** (belts, fluids, tyres) and **insurance, tax & inspection**. A
  fourteen-row plan was a flat list of three quite different kinds of thing.
- Group membership is about kind, not how often — the fuel filter sits with the
  every-service consumables even though it is changed every other service, and
  its own interval still decides when it is due. New items get a group picker,
  and an existing plan groups itself.
- Grouping never changes a due date, and "Due at your next service" still
  ignores groups, so nothing urgent gets buried by the tidying.

## [0.16.1] — 2026-09-04
- Vehicle page fixes from its UX review: the Save button in all three dialogs
  was below the fold on a phone, the cost card and the readings card disagreed
  about the car's current value, the category dropdown showed "fuel" instead of
  "Fuel", and a dormant maintenance item read "Every Not tracked".
- Spans now read in one unit everywhere ("Every 2 years", not "Every 24
  months"; years rather than "1,691 days left"), the fuel figures no longer
  wrap on a narrow screen, and the car's make/model/year/plate is finally shown
  — on a phone it was the only thing missing that said which car you were
  looking at.
- The two maintenance banners are now one, so the dashboard still leads with
  your portfolio; "Due at your next service" got a button that logs the whole
  bundle at once; and the spend-by-category card was dropped as duplication.

## [0.16.0] — 2026-09-04
- New **Vehicle** page: what your car has really cost since you bought it — cash
  out **plus** the value it lost — quoted as a fixed cost per month and a
  variable cost per km, with the capital tied up in it priced at your own
  portfolio return. Purchase price and current value are each converted at their
  own date's rate, so a car whose lira price merely kept up with inflation stops
  reading as a gain.
- A **periodic maintenance chart**: per-item intervals in km, months, or
  whichever comes first, anchored on the last time each was actually done — log
  the drive belt at 130,000 km and it tells you when it is next due, bundles
  what to do at your next service, and warns on the dashboard when something is
  overdue or within 10% of due. Starts from an editable Turkish default plan.
- Fuel economy measured properly (between two full tanks only), and nothing on
  the page touches your portfolio: no transaction, no balance, no net worth, no
  P&L.

## [0.15.0] — 2026-09-03
- One name per figure, everywhere: the money you are up or down is **Total P&L**
  on the dashboard, the Portfolio bar and an asset page (it used to be "Total",
  "P&L" and "Total return"), and the Portfolio column that shows an open
  position's gain now says **Unrealized** — it never was the portfolio total.
- The portfolio's worth is **Total Value** on both pages that show it, and each
  asset category has one label app-wide (an asset is "US Stock" on the dashboard
  as well as in Settings, not "US Stocks" on one and "US Stock" on the other).
- Terms now live in the glossary and are imported from one constants module, so
  a label cannot drift between two screens again.

## [0.14.2] — 2026-09-03
- The dashboard's Performance chart gets its dashed zero line back and stops
  holding open an empty gutter beside it. The left edge had been reserving room
  for money labels it never printed; the plot now uses that width instead —
  a quarter of the chart on a phone.
- Those money labels stay off in Performance mode deliberately: the lines there
  have deposits and withdrawals removed, so an amount read off the chart's edge
  disagreed with the money the headline prints above it, sometimes on the other
  side of zero. Value mode still shows its money scale as before.

## [0.14.1] — 2026-09-03
- Money figures obey the privacy toggle everywhere: the dashboard, retirement,
  asset and budget charts no longer print your amounts on an axis or in a
  tooltip while the headline above them is masked.
- Buy/Sell volumes now convert into the display currency instead of showing a
  dollar figure behind a lira sign, and the sale-proceeds preview asks the cash
  layer what it will actually book.
- Writes that fail now say so instead of reverting quietly (budget income,
  salary rows, retirement scenarios), and a refused import names its reason on
  the row it refused.

## [0.14.0] — 2026-09-03
- Phone pass: dialogs land their submit on one 40px row that survives the
  keyboard, the first holding and the first transaction sit in the first screen,
  and the Settings, By-platform and Budget tables get real phone layouts instead
  of a silent sideways scroll.
- Every glossary explainer now opens on a tap as well as a hover (retirement
  hints, MWR labels, the interest badge — which also links into the asset's
  Earning section); controls the owner touches daily are 40px, and the phone
  header shows how stale the prices are.
- The bulk editor opens import-first on a phone with its row number and ticker
  pinned; charts gained plot width from compact money ticks; no page repeats
  its own title on a phone, and the tab bar, content and footers clear the home
  indicator.

## [0.13.0] — 2026-09-02
- UI/UX pass over the whole app: P&L, cost and subtotals now follow the display
  currency (a row never mixes ₺ and $), zero is neutral instead of green, every
  pick-one switch uses one control, and numeric columns are right-aligned.
- Add Transaction gained a Transfer type, a pre-selected platform and funding
  source, submit-time validation, and a footer that stays on screen (a
  full-height sheet on a phone).
- Dashboard hero speaks English throughout ("Net invested", "Now", round
  gridlines, a readable benchmark line); retirement projections floor at zero and
  name the depletion age; the bulk editor wears the app's own chrome.
- Phone: dialogs are full-height sheets that follow the keyboard, the portfolio
  card list carries every column the table does, and the budget's multi-entry
  income editor is a dialog with a confirmed delete.

## [0.12.0] — 2026-09-01
- Fiat holdings now run the FIFO lot engine in a fiat mode: currency
  conversions, withdrawals, cash spends, and tax charges book realized FX P&L
  (market − consumed cost), so the FX gain on departed cash no longer inflates
  the remaining pile's unrealized % (the EUR +16.19% distortion becomes
  realized ~+$471 + unrealized ~+$421 ≈ +7%). Totals, net invested, and MWR
  are unchanged — a pure realized/unrealized decomposition.
- Outflows recorded before their funding inflows (estimated cash histories)
  stay P&L-neutral: the shortfall is borrowed at market and repaid by the next
  inflow instead of booking a phantom gain.

## [0.11.1] — 2026-09-01
- Revert 0.11.0: portfolio rows go back to the unrealized (value − cost basis)
  figure. Lifetime scope pulled closed round-trips into rows (a re-entered
  position showed its old trades' P&L) — against the current-position convention
  on portfolio screens. The fiat % distortion (e.g. EUR +16% after a conversion
  withdrawal) is real but will be fixed for fiat specifically, guided by
  prior-art research.

## [0.11.0] — 2026-09-01 *(reverted in 0.11.1)*
- Portfolio rows' Total mode showed the lifetime money-weighted total return
  (value − net invested, % = cumulative XIRR); group subtotals and P&L sort
  followed.

## [0.10.2] — 2026-09-01
- Asset detail no longer lists trades' auto-generated cash legs
  (`cash_credit`/`cash_debit`) — drilling into a cash holding (USD/TRY) shows
  only deposits, withdrawals, income, and fees. The full audit trail, cash legs
  included, stays on the Transactions page.

## [0.10.1] — 2026-09-01
- Buy funding is now same-platform-only: "External cash" or a holding on the
  trade's own platform (fiat/USDT). Cross-platform funding removed — all 139
  recorded funded buys were same-platform; the data model is unchanged.

## [0.10.0] — 2026-09-01
- Buy crypto with USDT: a USD-priced buy can be funded from a USDT holding and a
  USD-priced sell can credit one ("Proceeds credited as"), through the same
  linked cash-leg pairing fiat uses — net invested and MWR unchanged at trade time.
- Stablecoin legs book at the $1 peg; spending USDT books no realized P&L, and a
  real de-peg surfaces as unrealized P&L on the USDT holding (worked cases 24–26
  in docs/pnl-test-cases.md).

## [0.9.2] — 2026-08-30
- Transactions type filter now matches the **derived** type: a new **Transfer** chip
  shows internal linked pairs, and **Withdrawal** / **Deposit** match only lone
  transfers — an internal move no longer shows up under Withdrawal.
- Filter-layer fix only: no schema change, no change to balances or P&L.

## [0.9.1] — 2026-08-30
- Transaction type labels renamed: "Transfer In" → **Deposit**, "Transfer Out" → **Withdrawal**.
- The neutral **Transfer** label stays reserved for linked platform-to-platform pairs.
- Display-only: enum values, balance logic and P&L are untouched.

## [0.9.0] — 2026-08-28
- Linked transfer pairs render as one neutral "Transfer" row (source → destination).
- Editing the source keeps the destination in lockstep.

## [0.8.0] — 2026-08-28
- PostHog usage analytics (EU cloud), lazy-loaded.
- Initially shipped as 0.7.8, reclassified as a feature.

## [0.7.7] — 2026-08-28
- Nav fixes: shared active-route predicate; unclip Add Transaction on phones.

## [0.7.6] — 2026-08-28
- Mobile "More" hub UX fixes from review.

## [0.7.5] — 2026-08-28
- Mobile bottom bar: 3 primary tabs + More hub.

## [0.7.4] — 2026-08-28
- Campaigns: consolidated tier ladders + quality floor in both ingestion doors.

## [0.7.3] — 2026-08-27
- "Max" button fills quantity with the platform balance for sell / transfer-out.

## [0.7.2] — 2026-08-27
- Period money gain coloured by its own sign; privacy toggle applied to mobile holdings cards.
- Corrects an accidental 0.8.0 bump back to a patch.

## [0.7.1] — 2026-08-27
- Dashboard period money gain beside the Performance headline %.
- Snapshots reload silently on refocus (no full-page skeleton).

## [0.7.0] — 2026-08-19
- Component 16 — interest positions with expiry warnings.

## [0.6.0] — 2026-08-17
- Component 15 — weekly campaign research + Campaigns page.

## [0.5.0] — 2026-08-15
- Component 14 — monthly budgeting (residual model).

## [0.4.0] — 2026-08-15
- Retirement: question-first Plan tab with verdicts; Coast FIRE folded into Plan.
- Asset detail: realized %, money-weighted (XIRR) chip.

## [0.3.2] — 2026-08-15
- Retirement input polish (centered unit suffixes).

## [0.3.1] — 2026-08-15
- Retirement scenario panel UI fixes.

## [0.3.0] — 2026-08-15
- Retirement: contribution end age (coasting phase) + Plan milestones table.
- Projection perf: instant typing, capped precision.

## [0.2.1] — 2026-08-15
- Retirement: after-retirement phase drawn for both withdrawal strategies.

## [0.2.0] — 2026-08-15
- Component 13 — retirement planning.

## [0.1.1] — 2026-08-09
- Midas import: partially filled orders imported; trades gated on filled quantity.

## [0.1.0] — 2026-08-09
- Build version + commit sha shown at the foot of the sidebar.

## Pre-0.1.0 — 2026-04-02 → 2026-08-09
- Core app built unversioned: platforms / assets / transactions, prices, FIFO P&L
  engine (BigNumber), bulk sheet with Excel/CSV import, dashboards.
