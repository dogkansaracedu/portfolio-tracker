# Component 12: Asset Detail — Behavioral Spec

> Layer: behavioral (tech-agnostic). Implementation → [technical/12-asset-detail.md](technical/12-asset-detail.md)

## Purpose

The single-asset drill-down. Where the Portfolio page shows every position as one
row, this screen expands one asset into: its identity and current price, the full
position (value, cost, returns, allocation), a per-platform breakdown, the
position's value/price history as a chart, lifetime income and costs, and the
asset's complete transaction history — one place that answers "what is my whole
story with this asset?".

## Depends on

- Platform & asset management — the asset/platform/holding records (Component 3)
- Transaction system — the asset's full event history (Component 4)
- Price engine — current/cached unit prices + FX (Component 5)
- P&L engine — cost basis, realized/unrealized, tax accrual, per-platform slices
  (Component 6)
- Snapshots — the per-asset history the chart plots, and the daily baseline
  (Component 10)

## Concepts used — links into [GLOSSARY](GLOSSARY.md)

- [Asset](GLOSSARY.md#asset) / [Holding](GLOSSARY.md#holding) /
  [Transaction](GLOSSARY.md#transaction) — the records shown
- [Snapshot](GLOSSARY.md#snapshot) — its per-asset breakdown is the chart's source
- [Snapshot price / live quantity](GLOSSARY.md#snapshot-price-and-live-quantity) —
  how the current value is computed
- [Realized and unrealized](GLOSSARY.md#realized-and-unrealized) — the two return
  figures shown side by side
- [After-tax P&L](GLOSSARY.md#after-tax-pl) — taxed assets headline net, gross
  annotated
- [Daily return](GLOSSARY.md#daily-return) — the "today" figure
  ([formula](GLOSSARY.md#daily-return-formula))
- [Allocation](GLOSSARY.md#allocation) — this asset's share of the portfolio
- [FIFO cost basis](GLOSSARY.md#fifo-lots-and-cost-basis) — basis for avg cost and
  realized P&L

## Behaviors / rules

**Reachability.** Wherever the app names an asset as an identity (the Portfolio
table rows and mobile cards), that identity links here. The screen itself links
out to the transaction editor for bulk edits and offers a "record transaction"
action pre-filled with this asset.

**Any transacted asset resolves.** The screen works for every asset the user has
ever transacted — including sold-out positions and inactive assets. An asset
identifier that doesn't exist, or an asset the user never touched (no
transactions and no holding), shows a friendly not-found state with a way back
to the Portfolio. It never renders a broken page.

**Identity header.** Icon, ticker, full name, category, tags, and the current
unit price in the asset's native currency with the USD equivalent (same
convention as the Portfolio row). Prices come from the same
[snapshot-price / live-quantity](GLOSSARY.md#snapshot-price-and-live-quantity)
source as everywhere else, so the figures here never disagree with the Portfolio
page.

**Position summary (held assets).** Total quantity (decimals per category),
current value, average unit cost (native currency with USD in parens where
applicable), the **total return** (below), unrealized return (amount + %),
realized return to date (amount + %), the
[daily return](GLOSSARY.md#daily-return) (amount + %, same formula and "—"
guards as the Portfolio page), and [allocation](GLOSSARY.md#allocation).
Value = snapshot price × live quantity, identical to the Portfolio row.

**Total return — the asset-scoped headline.** Amount = current value − net
invested into the asset (the canonical [Total P&L](GLOSSARY.md#total-pl)
scoped down): unrealized + realized + income + FX in one figure. Its **%** is
the asset's [money-weighted (XIRR)](GLOSSARY.md#money-weighted-return-mwr--xirr)
return, shown **cumulative at any age** — "what each dollar earned for the
time it was in", exact regardless of history length — with the **annualized
%/yr shown beneath only once the asset has ≥ 1 year of history** (the same
gate as the portfolio's lifetime chip; annualizing a short book is noise).
A peak-net-invested % is **not** used here — nor anywhere since 2026-08-28,
when peak calculations were removed app-wide; the user reads every % as "what
did my dollars earn", which is the money-weighted question. The
flows use the canonical per-transaction net-invested rule over the **asset
boundary** — deliberately different from the portfolio MWR's external-flow
rule: there a buy's paired cash leg cancels it (money never left the
portfolio); here the buy *is* money entering the asset. Dividends/interest
stay neutral (income, not capital). No solution / degenerate flows render
"—", never a fabricated number.

**Realized return %.** The realized amount is annotated with realized P&L ÷
the [FIFO](GLOSSARY.md#fifo-lots-and-cost-basis) cost basis of the lots
actually sold — "on what I exited, I made X%". Omitted when nothing was
realized.

**After-tax headline — taxed assets only.** For an asset carrying an at-source
tax rate, the unrealized return headlines **net of the tax accrual**, with the
gross figure and the deducted tax annotated beside it — the same row-level rule
as the Portfolio page (Component 8). Untaxed assets render plain gross. The
daily return stays gross (tax is on the cumulative gain, not one day's move).

**Sold-out positions.** When the live balance is zero, the position summary
states there is no current position and shows the lifetime **total return**
(terminal value 0 against the historical flows) and **realized P&L** (amount +
%) instead; quantity/value/allocation are omitted rather than shown as zeros.
The chart, income/costs, and transaction history still render in full.

**Per-platform breakdown.** When the position spans platforms (or as a single
row otherwise), a table lists each platform's quantity, value, cost basis, and
unrealized return — each slice from that platform's own
[FIFO](GLOSSARY.md#fifo-lots-and-cost-basis) lots, not the asset-wide average
smeared across platforms. Slices with zero balance are omitted. The slices sum
to the position summary's figures.

**History chart.** One chart with three series over a selectable time range:

- **Position value** (primary): the asset's frozen value from each
  [snapshot](GLOSSARY.md#snapshot)'s per-asset breakdown, summed across
  platforms, in the display currency. For a held position the right edge is the
  live current value ("now" point), so the chart ends at the figure the header
  shows; a sold-out position's history simply ends at its exit (no "now" point
  is fabricated).
- **Cost basis** (same axis as value): the
  [FIFO](GLOSSARY.md#fifo-lots-and-cost-basis) cost of the lots still held on
  each date, replayed from the asset's transactions — per platform, exactly as
  the P&L engine books it. Drawn as a step line, since basis changes only on
  transactions. The vertical gap between the value series and this line *is*
  the unrealized return at that date. USD-anchored; when the display currency
  is the home fiat it is converted at **each date's own frozen rate**, never
  today's. This series can be toggled off.
- **Unit price** (secondary axis, USD): the frozen per-unit price recorded in
  each snapshot's per-asset entry; the "now" point (held positions) is the live
  price. This series can be toggled off.

Dates the snapshot history doesn't cover (before the first purchase, or gaps
where the asset wasn't in a snapshot) simply have no point — the chart never
fabricates values. Buys/sells appear naturally as value jumps that the price
line doesn't mirror. The time range control offers the same ranges as the
performance view (1M / 3M / 6M / YTD / 1Y / ALL); for month-or-longer ranges the
last point just before the range start anchors the left edge, matching the
performance chart convention. Fewer than 2 points in range → a "not enough
history" hint instead of a chart.

**Income & costs.** Lifetime totals over this asset's transactions, each
USD-normalized at its transaction date:

- **Income** — dividends + interest received.
- **Taxes** — withholding actually booked as tax events (e.g. stopaj). Distinct
  from the *accrued* at-source tax shown in the return annotation: this is tax
  already taken, that is tax pending.
- **Fees** — fees paid on this asset's activity, whether standalone fee events
  or fees carried on a buy/sell.

Cards render only when nonzero — an asset with no income and no costs shows
nothing rather than a row of zeros.

**Transaction history inline.** The asset's complete transaction list, newest
first, with the same columns, type badges, linked cash-leg presentation, and
realized-P&L annotations as the Transactions page. Read-only here; editing goes
through the transaction editor link or the record-transaction action.

**Consistency rules.** Display-currency toggle and amount obfuscation apply
exactly as on the Portfolio page (percentages stay visible when amounts are
obfuscated). All signed figures use the canonical gain/loss palette. All
figures are computed by the same engines as the Portfolio/Dashboard — this
screen introduces **no new P&L math**, only a new composition of existing
figures.

### Interest positions

The page is the management home for this asset's
[interest positions](GLOSSARY.md#interest-position) — list, add, edit, close,
delete, plus a cross-link when a live campaign matches the ticker. Defined in
[Component 16](16-interest.md); it never affects any figure above it.

## Contract (I/O)

**Inputs:** an asset identifier (from the route); the asset record; its holdings
(live balances per platform); current prices + FX; per-asset and per-(asset,
platform) P&L; the snapshot history (per-asset breakdown entries); the asset's
transactions; the display currency and obfuscation flag.

**Outputs (rendered):** identity header; position summary (or sold-out state);
per-platform table; history chart (value + optional price series over the
selected range); income/costs cards; transaction list. UI state held during the
session: selected time range, price-series visibility (neither persisted).

## UI contract

- **Header row:** back navigation, icon + ticker + name, category/tag badges,
  current price (native + USD), and actions: "record transaction" (pre-filled
  with this asset) and a link to the transaction editor.
- **Position summary:** a compact stat strip/cards — quantity, value, avg cost,
  allocation, total return (amount + money-weighted %, the muted ≈%/yr line
  beneath when available), unrealized return (net headline + gross/tax
  annotation when taxed), realized (amount + %), daily return. Sold-out: a
  muted "no current position" line with the lifetime total return and realized
  P&L.
- **Per-platform table:** platform (color dot + name), quantity, cost basis,
  value, return — rendered only when there is at least one nonzero slice.
- **Chart:** area for value, step line for cost basis on the same axis, line
  for unit price on a secondary axis; tooltip showing date, value, cost basis,
  and price; range selector above; toggles for the cost-basis and price series.
  Responsive; on small screens the chart stacks above the tables.
- **Income & costs:** small labeled cards (income / taxes / fees), only the
  nonzero ones.
- **Transactions:** the shared transaction table/cards, newest first.
- **States:** loading skeletons; not-found state with a back link; "not enough
  history" hint under 2 chart points.

## Acceptance

- [ ] Asset identity links on the Portfolio page (desktop row and mobile card)
      open this screen; the old direct-to-editor link lives on this screen
      instead.
- [ ] The header price and the position value match the Portfolio row for the
      same asset (same snapshot-price × live-quantity source).
- [ ] A taxed asset headlines its net unrealized return with gross and tax
      annotated; untaxed assets show plain gross; daily return is gross either
      way.
- [ ] Per-platform rows use each platform's own FIFO slice and sum to the
      position totals.
- [ ] The chart plots the snapshot-frozen per-asset value (display currency),
      the replayed FIFO cost basis (step line, converted at each date's own
      frozen rate in home-fiat display), and unit price (USD), ends at the live
      "now" point for held positions (at the exit for sold-out ones), and
      offers 1M/3M/6M/YTD/1Y/ALL ranges with the pre-range anchor for ≥1M.
- [ ] Dates without snapshot coverage draw no point (no fabricated values);
      fewer than 2 in-range points shows the "not enough history" hint.
- [ ] The total return card shows value − net invested with the cumulative
      money-weighted (XIRR) % at **any** age; the ≈%/yr line appears only past
      1 year of history; degenerate flows render "—" (no peak-based % on this
      page).
- [ ] The realized amount carries a % over the sold lots' FIFO cost basis,
      omitted when nothing was realized.
- [ ] Income (dividends+interest), taxes, and fees show lifetime USD totals;
      zero-valued cards are omitted.
- [ ] The inline transaction list matches the Transactions page presentation
      (type badges, linked legs, realized annotations), newest first.
- [ ] A sold-out asset renders fully (realized headline, chart, income/costs,
      transactions); an unknown asset id shows the not-found state.
- [ ] Display currency, obfuscation (percentages stay visible), and gain/loss
      colors behave exactly as on the Portfolio page.
