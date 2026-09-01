# Changelog

All notable changes to this project are documented here. Newest first.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versioning is [Semantic Versioning](https://semver.org/spec/v2.0.0.html) — fixes
and patches move only the third digit.

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
