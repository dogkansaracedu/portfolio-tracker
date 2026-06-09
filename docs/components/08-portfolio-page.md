# Component 8: Portfolio Page — Behavioral Spec

> Layer: behavioral (tech-agnostic). Implementation → [technical/08-portfolio-page.md](technical/08-portfolio-page.md)

## Purpose

The detailed asset view that complements the dashboard's summary. It lists every
held position in a grouped table with current value, cost basis, return, and
[allocation](GLOSSARY.md#allocation), and lets the user switch the return figure
between **lifetime total** and **today's** change.

## Depends on

- Price engine — current/cached unit prices (Component 5)
- P&L engine — cost basis, realized/unrealized, net invested (Component 6)
- Platform & asset management — the asset/platform/holding records (Component 3)
- Snapshots — the latest snapshot for prices and the previous one as the daily
  baseline (Component 10)

## Concepts used — links into GLOSSARY

- [Holding](GLOSSARY.md#holding) — the live per-platform balance shown as Quantity
- [Platform](GLOSSARY.md#platform) — one grouping axis; also the per-platform price/value scope
- [Snapshot](GLOSSARY.md#snapshot) — source of prices and the daily baseline
- [Snapshot price / live quantity](GLOSSARY.md#snapshot-price-and-live-quantity) — how Value is computed
- [Realized and unrealized](GLOSSARY.md#realized-and-unrealized) — the Total return shown is unrealized
- [Money-weighted](GLOSSARY.md#money-weighted) — the basis for the daily figure
- [Daily return](GLOSSARY.md#daily-return) — the "Today" figure ([formula](GLOSSARY.md#daily-return-formula))
- [Allocation](GLOSSARY.md#allocation) — share of total portfolio value

## Behaviors / rules

**Enrichment.** For each active, currently-held asset, combine its holdings,
prices, and P&L into: total balance, current unit price, current value, cost
basis, unrealized return (amount + %), [allocation](GLOSSARY.md#allocation), and a
daily return (amount + %). Only assets with a positive total balance appear as
rows.

**Value = [snapshot price × live quantity](GLOSSARY.md#snapshot-price-and-live-quantity).**
Unit price comes from the latest [snapshot](GLOSSARY.md#snapshot)'s per-asset
entry (or the per-(asset, platform) entry in the platform grouping); quantity is
the live [holding](GLOSSARY.md#holding) balance. A fresh transaction changes the
quantity immediately, while prices stay consistent with the dashboard's
snapshot-sourced totals — so the page total equals the dashboard's net worth by
construction. Assets the latest snapshot does not yet cover fall back to the live
price.

**Grouping & sorting.** Group by [Platform](GLOSSARY.md#platform), category, or
tag; each group renders a header with a subtotal followed by its rows. Sort rows
by value, return, or name. All grouping/filtering happens over the already-fetched
asset set.

**Search / filter.** A search box filters rows by asset name or ticker in real
time. Inactive assets are hidden by default.

**Funds nested under their fiat currency.** Inside the holdings table, each
**fiat currency row** (e.g. TRY/USD/EUR cash) is an **expandable parent**: the
**funds/bonds denominated in that currency** (e.g. a TRY money-market fund or
PPF) render as **indented child rows beneath it**, each showing its own value
and **after-tax** return (net of any at-source tax accrual). Rows are
**expanded by default** and can be collapsed. **Group subtotals count the nested
children**, so a group header still equals the sum of everything under it and
totals stay whole. **Stocks, crypto, and gold are not nested** — they are not
"denominated in" a fiat the way cash and funds are, and they stay as ordinary
top-level rows. A fund whose currency has no matching fiat row stays a top-level
row so it never disappears. This nesting applies to the **category and tag**
groupings; it is **not** applied in the platform group-by, where a fund isn't
"in" a platform's cash row and the relationship doesn't compose.

**Total | Daily return toggle.** A single toggle switches the return figure on
**both group headers and asset rows** between two modes. It does **not** touch any
other column, and it does **not** affect the summary bar.

- **Total** (default — unchanged prior behavior): lifetime
  [unrealized](GLOSSARY.md#realized-and-unrealized) return = current value − cost
  basis, shown as amount + %.
- **Daily** ("Today"): the [money-weighted](GLOSSARY.md#money-weighted) change
  since the previous [snapshot](GLOSSARY.md#snapshot), shown as amount + %. Per the
  [daily-return formula](GLOSSARY.md#daily-return-formula):

  ```
  dailyReturn = value_now − prev_snapshot_value − period_invested
  denom       = prev_snapshot_value + period_invested
  dailyPct    = denom <= 0 ? "—" : dailyReturn / denom × 100
  ```

  `period_invested` = net capital deployed into the position **since the baseline
  snapshot's day** (bucketed by home-local calendar day, matching the snapshot's date
  boundary). Subtracting it removes principal, so a position opened today contributes
  only its price movement (not its cost). Because the figure is money-weighted,
  [fiat FX](GLOSSARY.md#fiat-fx-pl) swings show up automatically.

**After-tax (net) headline — Total mode only.** For positions in an asset that
carries an at-source tax rate, the **Total** return is shown **after tax** as the
headline figure: `net = gross − tax`, where tax is the at-source accrual on the
position's gain. The **gross** figure and the tax deducted are shown beside it as a
muted annotation, so nothing is hidden. The percent is recomputed on the net amount
over the same cost basis. This applies to **asset rows, group headers, and the
summary bar's headline**, keeping the invariant that **a group header equals the sum
of its visible rows** (rows show net too). Untaxed positions (no at-source rate)
render exactly as before. **Daily** return stays gross — tax is on the *cumulative*
gain, not a single day's move. In the summary bar, only the headline goes net; the
unrealized/realized split below stays gross.

**Daily "—" rules.**
- **No prior snapshot** (zero or one snapshot total): daily is unavailable.
  Headers and rows render "—" in Daily mode; the toggle still flips cleanly
  between modes.
- **Percent base ≤ 0** (degenerate, e.g. a partial sale of a position that ran up
  intraday): the amount is still correct, but the **percent** renders "—" (never a
  misleading 0%).

**Daily baseline.** The most recent snapshot dated **before today** (the portfolio's
home-local day) supplies the **frozen** close value as the baseline (not price × live
quantity). A position absent from that baseline snapshot has a baseline of 0. Picking
by date — rather than "the second-to-last snapshot" — stays correct before today's
snapshot has been written and across multi-day gaps (the delta is still shown).

**Group rollup.** A group's daily amount is the **sum of its visible rows'** daily
amounts; the group percent is taken on the summed bases (same "—" guard). This
preserves the invariant that **a group header equals the sum of its visible
rows** — true for both Total and Daily.

**Platform scoping.** When grouped by platform, each row is one (asset, platform)
slice: value, cost basis, return, allocation, and the daily baseline + period
capital are all scoped to that platform.

**Summary bar is lifetime, always.** The summary bar shows the lifetime portfolio
total and is **unaffected by the toggle** (see UI contract).

**Zero-balance / closed positions.** Positions whose live balance is 0 are not
rendered as active rows (the page shows current holdings). A position fully sold
*during the period* therefore has no row, so the visible daily-return rows can
sum to slightly less than the portfolio-wide day change — a known, accepted gap,
handled identically to how lifetime return omits sold-out positions.

### Worked daily example

Asset bought **today** at 210/unit, now priced 220:

- `value_now = 220`, `prev_snapshot_value = 0` (not held yesterday),
  `period_invested = 210` (deployed today).
- `dailyReturn = 220 − 0 − 210 = +10` → **+$10**, measured from the *purchase
  price*, not the full principal.
- `denom = 0 + 210 = 210` → `dailyPct = 10 / 210 × 100 ≈ +4.76%`.

A no-trade day on a position held since yesterday (closed 200, now 210, qty 10):
`2100 − 2000 − 0 = +$100`. The asset's **group header daily** = the sum of its
visible rows' daily amounts.

## Contract (I/O)

**Inputs:** active assets; per-asset/per-platform holdings (live balances);
current prices + FX rate; per-asset P&L (cost basis, unrealized); the latest two
snapshots; the transaction history (to net period-deployed capital); the display
currency and the amount-obfuscation flag.

**Outputs (rendered):** grouped rows + group subtotals; each row's quantity, unit
price, value, cost basis, return (mode-dependent), allocation; a lifetime summary
bar. UI state held during the session: search text, group-by axis, sort key, and
the return mode (none persisted across reloads). The toggle's choice and the
"daily available" flag drive which return figure renders.

## UI contract

**Grouped table (desktop).** Sticky header. Each group = a full-width header row
(group name, optional color dot, asset count, value subtotal, return subtotal)
followed by its asset rows.

**Columns:** Asset (icon + ticker, links to that asset's transactions) ·
Platform (per-platform dots/names; hidden meaning when grouped by platform) ·
Quantity (decimals per category) · Bought (cost per unit, asset-native with USD in
parens where applicable) · Price (current unit price) · Value (bold) · **Return**
(header reads **"P&L"** in Total mode, **"Today"** in Daily mode; amount over %,
gain/loss colored) · Allocation (% + a tiny bar) · a row action to record a
transaction.

**Toggle:** a **Total | Daily** control in the filter row (single-select),
alongside group-by and sort. Switching it re-renders every group header and every
row's return cell; default is **Total**.

**Summary bar:** above the table — total portfolio value, lifetime P&L (amount +
%, with an unrealized/realized split when any realized exists), and the held-asset
count. **Not** affected by the toggle.

**Funds nested under fiat rows (in-table):** in the category and tag groupings, a
fiat currency row that has funds/bonds in it carries a chevron toggle; expanding
it reveals the funds as **indented child rows** directly beneath the fiat row,
each with its own value and **after-tax** return. Child rows are expanded by
default. The parent's group subtotal already includes the children, so the
header stays equal to the sum of everything shown beneath it. Returns use the
gain/loss palette; values follow the display-currency and obfuscation rules. The
platform grouping shows no nesting.

**Mobile (cards).** Below the table breakpoint, each group renders a simplified
header and its assets as cards (icon + ticker, price, platforms, value, and the
mode-dependent return amount + % inline). Same toggle, same "—" rules.

**Inactive / zero-balance.** Inactive assets hidden by default; zero-balance
positions are not shown as active rows.

**Amount obfuscation.** When the user hides amounts, currency figures (value,
return amount, subtotals) are obfuscated; **percentages remain visible** in both
modes.

**Return colors:** gain/loss palette — positive vs. negative drives the color,
zero is neutral; consistent across rows, headers, and the summary bar.

## Acceptance

- [ ] The Total | Daily toggle flips the return figure on **both** group headers
      and asset rows; default is **Total** (prior behavior unchanged).
- [ ] In Total mode, the return is lifetime unrealized (value − cost basis), amount + %.
- [ ] In Total mode, a taxed position shows the **after-tax (net)** return as the
      headline, with **gross** and the deducted tax annotated beside it; untaxed
      positions render unchanged. Net flows through rows, group headers, and the
      summary-bar headline (Daily mode stays gross).
- [ ] In Daily mode, the return is the money-weighted change since the previous
      snapshot, amount + %.
- [ ] An asset **bought today** shows a daily return measured from its purchase
      price (buy at 210, price 220 → +$10), not its full principal.
- [ ] With ≤ 1 snapshot, Daily mode renders "—" everywhere, and the toggle still
      switches modes cleanly.
- [ ] When the daily percent base ≤ 0, the amount shows but the percent is "—".
- [ ] Each group header's return equals the sum of its **visible** rows (both modes).
- [ ] Value = live balance × latest snapshot price; the page total equals the
      dashboard's net worth.
- [ ] The summary bar shows the lifetime total and does **not** change with the toggle.
- [ ] Group by platform/category/tag shows headers with correct subtotals; search
      filters by name or ticker; values render in the selected currency.
- [ ] Mobile renders cards; inactive hidden by default; obfuscation hides amounts
      while percentages stay visible.
- [ ] In the category/tag groupings, funds/bonds appear as **indented child rows**
      under their fiat currency row (expandable, expanded by default), each showing
      its value and **after-tax** return; group subtotals include the nested
      children so headers stay whole. Stocks/crypto/gold are not nested, and the
      platform grouping shows no nesting. A fund with no matching fiat row stays a
      top-level row.
