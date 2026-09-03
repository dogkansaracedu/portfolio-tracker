# Changelog

All notable changes to this project are documented here. Newest first.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versioning is [Semantic Versioning](https://semver.org/spec/v2.0.0.html) — fixes
and patches move only the third digit.

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
