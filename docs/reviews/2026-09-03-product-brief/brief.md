# Product brief — 2026-09-03

Product-owner pass over the whole app at v0.12.0 (`5caa02b`), local build seeded with
`supabase/seed-review.sql`, walked with Playwright at 1440×900 and iPhone 14 (390×664).
Screenshots referenced below live in `./shots/`.

This brief deliberately does **not** repeat the two review passes from 2026-09-02
(`../2026-09-02-ui-ux-pass1/consensus.md`, `../2026-09-02-ui-ux-pass2-mobile/consensus.md`).
Status of those: the desktop list C-01…C-29 shipped on 2026-09-03 (commits `ab6ba4b`…`5caa02b`);
the mobile list M-01…M-16 is still open except M-01, whose phone sheet + single-column footer
is already live (`shots/st-phone-add-tx.png`). Treat M-02…M-16 as the first item of the
UI backlog below; nothing in this brief conflicts with them.

## Delivery rule (agreed with the owner)

- **Page-level change** → new page component and route tagged `-v2`
  (`DashboardV2`, `/dashboard-v2`), pushed to main; the original stays untouched until the
  owner switches. Nav keeps pointing at v1; v2 is reachable by URL and a small "Try v2" link.
- **Section-level change** → new component beside the old one (`TopMoversV2.tsx` next to
  `TopMovers.tsx`), mounted only on the v2 page. Each v2 lands with a short "what changed"
  note in its PR-less commit message and in this folder.
- **New page** → no v2 tag needed; it is new.
- Conventions that every item below already respects: MWR-only returns, no peak or
  net-invested denominators, USD anchor + display-currency re-denomination, asset-native price
  currency, privacy mode masks amounts not %, zero is neutral, one glossary term per figure.

---

## Part A — UI changes (beyond the 2026-09-02 lists)

Ranked by how often the owner will hit it. Each: what is wrong, evidence, the change, and how it
lands under the v2 rule.

### A-1 · Dashboard — "Top Movers" shows lifetime P&L, not movement
- **Evidence:** `shots/desk-home-tall.png` — TP2 −$3,487 (−56%) tops the card; spec
  `07-dashboard.md:93` defines the card as largest *absolute unrealized* gain/loss.
- **Why:** "Movers" is a daily word. The owner opens the dashboard to learn what changed today;
  the card answers a different question (biggest lifetime winners/losers) under a misleading name.
- **Change:** card gets the same Total | Daily semantic the Portfolio rows already have, defaulting
  to **Daily** (largest absolute day change from the last daily snapshot, same source as Portfolio
  "Today"); the total-mode list is one toggle away. Title follows the mode: "Today's movers" /
  "Biggest positions".
- **Lands as:** `TopMoversV2` on `DashboardV2`.

### A-2 · Dashboard hero — no "today" figure without changing the range
- **Evidence:** `shots/desk-home.png` — the hero opens on the persisted range (1M here) and the
  only day figure is behind the 1D pill.
- **Why:** the number the owner glances at most on the phone is "how did today go"; it is one tap
  away on every visit.
- **Change:** a compact **Today** chip in the hero subtitle row (day change $ and %, gain/loss
  palette, zero-neutral), always visible regardless of range and mode, same source as Portfolio
  "Today" (one definition — the two-"today" ambiguity from the 2026-09-02 also-noted list gets
  resolved by this). Privacy mode masks the amount, keeps the %.
- **Lands as:** part of `DashboardHeroV2` on `DashboardV2`.

### A-3 · Asset Detail for fiat assets — the equity layout does not fit a cash ledger
- **Evidence:** `shots/desk-assets_5b580-tall.png` (USD): price axis "$3 / $2 / $1 / $0 / $−1",
  "Avg cost / unit $1.00", "Price" series toggle, "Realized P&L −$11.50" (fees), 25 rows of
  deposits with no running balance.
- **Why:** for USD/TRY/EUR the page should answer "how much cash do I have where, and how did it
  move" — half the stat cards and the price series are noise.
- **Change:** a **cash variant** of the page for `is_currency` assets: stat tier = Balance ·
  By platform · FX P&L (TRY/EUR only, the fiat-FIFO figure from 0.12.0) · Income (interest) · Fees;
  chart = balance over time (value area only, no price axis); transaction list gains a
  **running balance** column. Non-fiat assets are unchanged.
- **Lands as:** `AssetDetailCashV2` rendered by `AssetDetailPage` when the asset is a currency
  (page-level v2 gate: `/assets/:id?v2=1` until switched).

### A-4 · Budget — negative "Spent" reads as nonsense
- **Evidence:** `shots/desk-budget-tall.png` — Jul 2026 Spent −$407.80, savings rate 113.56%;
  Jan 2026 −$949.01 / 134.36%.
- **Why:** the residual model (spec `14-budgeting.md:32-33`) is right, but a negative spend and a
  >100% savings rate are not readable; the meaning is "invested more than earned, from savings".
- **Change:** when residual < 0 render Spent as "—" with the muted caption "from savings $407.80"
  and cap the savings-rate cell at "100%+" with the same caption. Months with Invested $0 keep
  0.00%.
- **Lands as:** `MonthlyBudgetTableV2` on `BudgetV2` (`/budget-v2`).

### A-5 · Retirement — projection precision and label collision
- **Evidence:** `shots/desk-retirement-tall.png` — "Retirement target $1,884,400.14";
  "Depleted at age 79.6" printed over the target line; `shots/st-desk-retire-compare.png` —
  Compare table in cents on seven-figure sums.
- **Why:** cents on a 25-year projection signal false precision and widen every column.
- **Change:** projections and targets render as whole currency (`$1,884,400`) in tables and as
  compact (`$1.88M`) in chart labels; "Depleted at age 80" (whole years) stacked below the target
  label, never on the same baseline.
- **Lands as:** `PlanChartV2`, `PlanMilestonesV2`, `CompareTableV2` on `RetirementV2`.

### A-6 · Asset Detail — zero cards and year-less axis
- **Evidence:** `shots/desk-assets_e1a2b-tall.png` (AAPL): "Realized P&L $0.00" although nothing
  was sold; ALL-range x-axis "Jun 8 … Sep 3" spanning 15 months with no year.
- **Change:** Realized card follows the existing nonzero-only rule of the Income/Taxes/Fees cards;
  when the range spans more than one calendar year the axis uses "Jun '25" style ticks (shared
  with the hero, which already prints "Aug 2026").
- **Lands as:** inside `AssetPositionSummaryV2` / `AssetHistoryChartV2` (same v2 gate as A-3).

### A-7 · Campaigns — one disclaimer, not nine
- **Evidence:** `shots/desk-campaigns-tall.png` — "found on Aug 27, 2026 — verify at source before
  committing funds" repeated on every card.
- **Change:** one line under the page header ("Found on Aug 27, 2026 · verify at source before
  committing funds"); card footer becomes `Source · Track` only. Phone loses ~40px per card.
- **Lands as:** `CampaignCardV2` on `CampaignsV2`.

### A-8 · Settings › Assets — twenty primary-green "Active" pills
- **Evidence:** `shots/desk-settings-tall.png`.
- **Change:** status column shows nothing for active rows and a muted "Inactive" badge otherwise
  (the count line "20 active / 20 total" already carries the summary).
- **Lands as:** `AssetListV2` on `SettingsV2`.

### A-9 · Portfolio — group header counts nested children wrong
- **Evidence:** `shots/desk-portfolio-tall.png` — "Fiat (3 assets)" over five rows (TRY→TP2,
  USD→USDT nested).
- **Change:** "Fiat · 5" counting children, or drop the count (M-14 already asks the same on
  phone; do both in one change).
- **Lands as:** `PortfolioGroupHeaderV2` — small enough to ship with the M-14 work.

### A-10 · Transactions — show the note
- **Evidence:** `notes` is written by the PDF importer and by the owner's reconciliation runs
  ("reconciliation 2026-06-12" markers) but no list renders it (`grep notes
  src/components/transactions/TransactionRow*.tsx` → nothing).
- **Change:** note as a muted second line under the type badge (truncated, full text on tap
  popover per M-04), and the search box on the Transactions page matches notes.
- **Lands as:** `TransactionRowV2` / `TransactionRowCardV2` on `TransactionsV2`.

Also noted, owner's call, no v2 needed: Add-form date "September 3rd, 2026" vs table "Sep 3,
2026"; Transactions page summary cards (count / buy volume / sell volume) could be one strip on
desktop as M-03 does on phone; hero Performance mode still defaults to a period TWR headline
while the owner's memory says MWR is the app's "%" — the spec chose TWR for the vs-market race,
and that is right, but the −5.84% headline for a month in which lifetime P&L is +$116 will keep
surprising; consider opening in Value mode when the range has no benchmark data.

---

## Part B — Feature additions

Ordered by value to *this* owner (Turkey-resident, multi-broker, reconciles by hand, declares
foreign income yearly, plans retirement in the app). Each: the problem, the proposal, what data
already exists, constraints, and shape.

### B-1 · Tax-year view: income, realized gains and withheld tax by year — **new page**
- **Problem:** the only tax surface is the Foreign-income card (YTD, one threshold). Realized
  P&L exists per sell row and as a lifetime total; dividends/interest exist as transactions;
  `tax` transactions exist. Nothing sums any of them **by calendar year**, which is exactly the
  unit the March declaration needs.
- **Proposal:** `/taxes` ("Tax year") with a year picker. Sections: (1) Foreign income — the
  existing card's logic per year, per payer, per platform, gross vs withheld;
  (2) Realized gains by asset and platform for the year (from the engine's per-sell realized
  entries, TRY-converted at transaction-date rates because that is how the gain is assessed);
  (3) Withheld/paid tax rows; (4) FX realized on fiat (0.12.0 fiat FIFO) as its own line since
  its tax treatment differs. Everything gross; **no tax computation** in v1 — the rules are
  volatile and live in `docs/retirement-tax-rules.md`, and the Compare tab already owns the
  "estimate" role.
- **Data:** all present (`computeIncomeUsd`, realized entries, `tax` type, `at_source_tax_rate`).
- **Constraint:** the Foreign-income card stays on the dashboard and deep-links here.
- **Shape:** new page + nav entry (phone: More hub). Medium effort, high value once a year and
  reassuring every month.

### B-2 · Reconciliation: computed balance vs broker statement — **new page**
- **Problem:** the owner has reconciled twice by hand (2026-06-12 fiat, 2026-08-09 Midas), each
  time with SQL and notes markers. The app knows the computed quantity per (asset, platform)
  and has nothing to compare it against.
- **Proposal:** `/reconcile`: pick a platform, the app lists computed balances; the owner types
  the broker's actual balance per row (or pastes a statement line); drift shows in native units
  and display currency; a "Record adjustment" action opens the Add Transaction sheet prefilled
  (deposit/withdrawal or buy/sell at current price, note "reconciliation YYYY-MM-DD"). Last
  reconciled date per platform shows on Settings › Platforms.
- **Data:** holdings (`holdings.balance` per lens), prices; needs one new table for reconciliation
  runs (platform, date, rows with expected/actual).
- **Constraint:** never writes holdings directly; adjustments are ordinary transactions so P&L
  stays honest. Medium effort, high value for the owner's actual workflow.

### B-3 · Data export — closes the "Partial" on Component 11
- **Problem:** spec 11 is marked partial for export; backups live in a folder on the owner's
  laptop, made by hand.
- **Proposal:** Settings › Data: "Export transactions (CSV)" in the bulk-editor column order so
  the file re-imports through the existing paste/CSV door; "Export everything (JSON)" =
  transactions + platforms + interest positions + budget entries + retirement scenarios.
  Filtered export from the Transactions page reuses the same writer with the current filters.
- **Data:** all present. Low effort, medium-high value (portability was a stated goal in the
  README).

### B-4 · Interest positions: record the reward when a position ends
- **Problem:** spec 16 deliberately does not auto-book rewards. The result today is a banner
  ("ends in 3 days") and then the owner types an interest transaction by hand with the rate,
  quantity and dates the app already stores.
- **Proposal:** on an expired or ends-soon position, the banner and the Asset Detail card gain
  **"Record interest"** which opens Add Transaction prefilled (type interest, asset, platform,
  quantity = estimated reward at simple rate, date = end date, note = program). Recording closes
  the position. Still nothing automatic; one tap instead of eight fields.
- **Data:** all on the position. Low effort, medium value, honours the 16:156-169 boundary.

### B-5 · Benchmarks the owner actually competes with
- **Problem:** the hero's only benchmark is S&P 500. For a TRY-earning investor the live
  questions are "did I beat gold", "did I beat USD/TRY", "did I beat a TRY deposit".
- **Proposal:** the benchmark chip (already a dropdown affordance, `▾` in the hero) offers
  S&P 500 · Gold (XAU/USD) · USD/TRY · TRY deposit. Same-flows what-if in MWR mode applies to
  each. Persisted with the other hero prefs.
- **Data:** gold and USD/TRY histories already exist (XAU is a priced asset; `usd_try` is on
  every snapshot). TRY deposit needs a policy-rate series (research task, sourced; or a
  user-entered flat rate as v1).
- **Constraint:** one metric per graph stays; benchmark is still a return line. Medium effort,
  high value for the dashboard's core question.

### B-6 · Budget ↔ Retirement: plan vs actual
- **Problem:** Retirement asks for "Monthly contribution $1,000"; Budget knows what was actually
  invested each month. Spec 13 explicitly leaves the coupling to a future budgeting component and
  the plan-vs-actual storage already exists unused (`14-budgeting.md:89`).
- **Proposal (Phase C, read-only coupling):** Budget shows a target column (from the default
  retirement scenario's contribution) and adherence per month; Retirement's contribution field
  shows "your 12-month average is $X" with one click to adopt it. Neither page writes the other's
  data.
- **Data:** present. Medium effort, medium-high value; it turns two calculators into one plan.

### B-7 · Period money-weighted return (YTD / 1Y XIRR)
- **Problem:** the methodology doc names period MWR "the highest-value addition"; today the MWR
  figure is lifetime only. The owner's return convention is MWR everywhere.
- **Proposal:** the Portfolio summary bar and the hero MWR chip show the XIRR **for the selected
  range** (opening value as the first flow, closing value as the last, flows in between) next to
  lifetime. Same solver, no new denominator rules.
- **Data:** snapshots + transactions. Medium effort (engine + test cases in
  `docs/pnl-test-cases.md`), medium value.

### B-8 · Allocation targets and drift
- **Problem:** the donut shows 33.5% fiat, but nothing says whether that is intended.
- **Proposal:** Settings › Targets: target % per category (optional); Allocation card and
  Portfolio group headers show drift (+4.2 pts) in the neutral palette; no auto rebalancing
  orders, no "buy X" advice.
- **Data:** one small table. Low-medium effort, medium value. Ship after B-1…B-6.

### B-9 · Command palette
- `cmdk` is already a dependency (`src/components/ui/command.tsx`). ⌘K / a phone search icon:
  jump to an asset page, a nav page, or "Add transaction for AAPL". Low effort, quality-of-life;
  ship when convenient.

### B-10 · Monthly recap
- One card per closed month (or an email later): value change, deposits, dividends/interest,
  best/worst position, savings rate from Budget. Built from snapshots + B-1's aggregates; do it
  after B-1 so both share the per-period helpers.

### Not proposing (and why)
- **Expense ledger with categories** (Budget Phase C option): the residual model already answers
  the owner's question; a ledger is daily data entry for a solo user. Revisit only if A-4 does not
  make the residual readable.
- **Monte Carlo** in Retirement: explicit non-goal in spec 13; bands already carry uncertainty.
- **Push notifications / service worker**: no SW exists; the interest banners and B-4 cover the
  one time-sensitive case in-app.
- **Automatic broker sync**: the owner's brokers have no consumer APIs the app could use without
  credentials risk; PDF/CSV import plus B-2 is the honest path.
- **Un-freezing the Performance page**: B-7 and the hero already surface what mattered there.

---

## Suggested order

| Release | Scope | Notes |
|---|---|---|
| 0.12.x | Mobile consensus M-02…M-16 | already agreed; several are one-line CSS |
| 0.13.0 | A-1, A-2 (`DashboardV2`), A-3 + A-6 (Asset Detail v2 gate), A-4, A-5, A-7, A-8, A-9, A-10 | UI only, each behind its v2 page; owner switches page by page |
| 0.14.0 | B-1 Tax-year page, B-3 Export | both read-only over existing data |
| 0.15.0 | B-2 Reconciliation, B-4 Record interest | the two workflow features |
| 0.16.0 | B-5 Benchmarks, B-6 Plan vs actual, B-7 Period MWR | engine + research work |
| later | B-8, B-9, B-10 | |

Every item touches its behavioral + technical doc in the same change (CLAUDE.md rule); B-1, B-2
and B-3 get new component numbers (17, 18) and B-3 flips Component 11 to Done.
