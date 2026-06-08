# Glossary & Domain Model

The shared vocabulary for the component specs. Entities, terms, and formulas are
defined **here, once**; component behavioral specs link to these anchors and never
redefine them. Conceptual only — field names appear, but storage types and stack
choices live in the per-component technical docs. For the P&L rationale in depth,
this glossary links to [P&L Methodology](../pnl-methodology.md) rather than
restating it.

## Entities

The nouns of the system. Fields are named conceptually; relationships are listed
at the end.

### Platform
Where assets are held — a broker, exchange, bank, or "physical" bucket (e.g. cash,
vehicle). Fields: `name`, `color` (a display color used across charts and dots).
Platforms are per-user.

### Asset
A tradable or held thing, **global: one row per ticker per user** (no platform on
the asset itself — balances live on [Holdings](#holding)). Fields: `ticker`
(display symbol), `name`, `category` (free-form text — `fiat`, `crypto`, `gold`,
`stock_us`, `stock_bist`, `vehicle`, …), `tags[]` (cross-cutting allocation labels,
e.g. `["crypto","usd"]`), `price_source` (which feed prices it — live values are `yahoo`, `tcmb`, and
`manual`; `coingecko` is a legacy value, now dormant — crypto is priced through
the equities feed), `price_id` (the identifier that feed uses, e.g. `BTC-USD`,
`THYAO.IS`; falls back to `ticker` when absent), `icon_url` (optional
logo override), `is_currency` (true for fiat/cash — these carry
[Fiat FX P&L](#fiat-fx-pl), not FIFO P&L), `is_active`.

### Holding
The balance of one [Asset](#asset) on one [Platform](#platform), in the asset's
**native units** (₺, shares, coins, grams). Fields: `asset_id`, `platform_id`,
`balance`. A balance is the running result of that holding's
[Transactions](#transaction), never entered directly.

### Transaction
A dated event affecting a holding. `type` is one of: **buy, sell, transfer_in,
transfer_out, dividend, interest, fee, cash_credit, cash_debit**. Fields: `amount`
(quantity in native units), `unit_price`, `price_currency` (**derived from the
asset — asset-native; defaulted and editable, never a free picker**), `total_cost`,
`fee`/`fee_currency`, `date`, `related_asset_id`, `linked_tx_id`, `notes`.
- **Balance effect:** buy / transfer_in / dividend / interest / cash_credit *add*
  to the holding; sell / transfer_out / fee / cash_debit *subtract*.
- **Linked legs:** `linked_tx_id` pairs a trade with its cash movement (only `buy`
  and `sell` carry a linked cash child) and pairs the two sides of a transfer. The
  cash legs (`cash_credit`/`cash_debit`) are created automatically, not user-picked.

### Snapshot
A frozen point-in-time aggregation of the whole portfolio — **the authoritative
source for every dashboard/portfolio number; the UI reads snapshots rather than
re-deriving from holdings × prices.** Fields: `snapshot_date`, `total_usd`,
`total_try`, and `breakdown`:
- `rates` — the FX used (`usd_try`, `eur_try`, `gold_gram_try`).
- `by_category`, `by_platform`, `by_tag` — `{ usd, try, pct }` per group
  (`by_platform` also carries `color`).
- `by_asset[]` — per ticker **and** per ticker×platform: `{ ticker, name, platform,
  amount, price_usd, value_usd, value_try }`. The frozen `value_usd` is "that day's
  close value"; `price_usd` is the per-unit price used by the
  [snapshot-price / live-quantity rule](#snapshot-price-and-live-quantity).

### Price
The current/cached unit price of an asset, in USD and TRY, with its `source` and
`updated_at`. Distinct from the asset's *native* price currency. See
[Staleness](#staleness).

### Exchange rate
Historical FX **by date**: `usd_try`, `eur_try`, `eur_usd`, `gold_gram_try`. USD is
the [anchor](#usd-anchor); a transaction's native price is converted to USD using
the rate on (or just before) its date.

### Relationships
- An **Asset** has many **Holdings** (one per platform it sits on) and many
  **Transactions**.
- A **Holding**'s `balance` is the sum of its Transactions' balance effects.
- A **Transaction** may link to another (cash leg of a trade; the two legs of a
  transfer) via `linked_tx_id`.
- A **Snapshot** embeds the full breakdown for a date; **Exchange rates** anchor
  every USD conversion.

## Terms

### USD anchor
All P&L is measured in **USD**, regardless of an asset's native currency. A holding
is tracked in its native units, but its gain/loss is always the change in USD value.

### Net invested capital
The **net USD actually deployed** into a position or the portfolio. Deposits and the
cash legs of trades net out — a sell and its paired `cash_credit` cancel — so this
reflects capital at work, not cash sloshing in and out. Total P&L $ is `value − net
invested`; the **%** is taken over [peak net invested](#peak-net-invested-capital),
not this current balance.

### Peak net invested capital
The **running maximum** of net invested capital over the portfolio's life — "the most
external capital ever at work at once." The denominator for [Total P&L](#total-pl) %,
so withdrawing your own money never changes the return % (and the % can't explode as
the current balance shrinks toward zero). Equals current net invested for a book that
only ever added capital; "—" when it is ≤ 0 (nothing was ever deployed).

### Money-weighted
Comparing value today against **dollars actually deployed** (not a time-weighted
index return). The app's canonical total is money-weighted. See
[P&L Methodology](../pnl-methodology.md).

### FIFO lots and cost basis
Buys stack as **lots**; a sell consumes the **oldest lots first** (FIFO) and books
realized P&L per consumed lot. **Cost basis** = the USD cost of the remaining lots.
Transfers move cost basis across platforms without booking P&L.

### Realized and unrealized
**Realized** = P&L locked in by sells (FIFO). **Unrealized** = current value −
cost basis of holdings still held. Both are **sub-views** of the money-weighted
total (`unrealized = total − realized`).

### Fiat FX P&L
Fiat / cash holdings (`is_currency = true`) are **not zero-P&L**: their cost basis
is the net USD deployed into that currency, so `value − cost basis` is the real
FX gain/loss vs. the [USD anchor](#usd-anchor). Surfaced as unrealized P&L.

### At-source tax
A withholding taken automatically on an asset's gains (e.g. a Turkish PPF, 17.5%);
modeled per-asset as `at_source_tax_rate`. Drives the [tax accrual](#after-tax-pl)
that produces [after-tax P&L](#after-tax-pl).

### After-tax P&L
Gross P&L minus the at-source **tax accrual** (rate × the positive native gain,
held + realized). An **additive overlay**: it leaves the gross decomposition and
its invariant (`unrealized + realized + income`) intact — after-tax Total P&L =
gross − total tax accrual.

### Foreign-declarable income
Dividend / interest from a non-TRY asset with no [at-source tax](#at-source-tax);
the income that counts toward the Turkish 22,000 TL declaration threshold. A
reporting figure, not part of the money-weighted total.

### Daily return
The money-weighted change **since the most recent [snapshot](#snapshot) before today**
(the portfolio's home-local day): `value_now − prev_snapshot_value − period_invested`.
Subtracting capital deployed during the period removes principal, leaving only
price/FX movement. See the [formula](#daily-return-formula).

### Allocation
An asset's (or group's) **current value ÷ total portfolio value**, as a percent.

### Snapshot price and live quantity
Displayed value = **live [Holding](#holding) balance × the latest snapshot's
per-unit `price_usd`**. Quantities reflect fresh transactions immediately; prices
stay consistent with the dashboard's snapshot-sourced totals. The most recent
snapshot **before today** (home-local day) supplies the frozen `value_usd` (not
price × live balance) used as the baseline for [daily return](#daily-return).

### Staleness
How old a [Price](#price) is (`updated_at`). Surfaced as an indicator so the user
knows when a value is not fresh.

## Canonical formulas

State-only here; the rationale lives in [P&L Methodology](../pnl-methodology.md).

### Total P&L
```
Total P&L (USD) = current value − net invested capital
```
Money-weighted, USD-anchored. `realized` and `unrealized` are sub-views; fiat
carries its FX gain as unrealized. → [P&L Methodology](../pnl-methodology.md).

### Total P&L %
```
Total P&L % = Total P&L ÷ peak net invested × 100   (— when peak ≤ 0)
```
Over [peak net invested](#peak-net-invested-capital), not the current balance, so the
% is stable across withdrawals. The same base everywhere a money-weighted % is shown.

### Daily return formula
```
dailyReturnUsd = value_now − prev_snapshot_value − period_invested
denom          = prev_snapshot_value + period_invested
dailyReturnPct = denom <= 0 ? null : dailyReturnUsd / denom × 100
```
`period_invested` = net USD deployed into the position since the baseline snapshot
(the most recent before today, home-local day), bucketed by home-local calendar day.
Equals Δ(value − invested) over the period — the [Total P&L](#total-pl) applied across
it, so fiat FX is included automatically.
