# Component 4: Transaction System — Behavioral Spec

> Layer: behavioral (tech-agnostic). Implementation → [technical/04-transaction-system.md](technical/04-transaction-system.md)

## Purpose

The core data-entry workflow. Lets the user record every event that changes what
they hold — buys, sells, transfers between platforms, dividends, interest, and
fees — one entry at a time or in bulk (typed grid, pasted spreadsheet, CSV file,
or a broker PDF statement). Each recorded event recalculates the affected
[Holding](GLOSSARY.md#holding) balance, and trades automatically book their cash
movement so [net invested capital](GLOSSARY.md#net-invested-capital) stays
correct. Sell rows surface their realized profit/loss inline.

## Depends on

- **Platform & Asset management** (Component 3) — [Platforms](GLOSSARY.md#platform)
  and [Assets](GLOSSARY.md#asset) must exist (or be created on the fly) before a
  transaction can reference them.
- **Holdings** — a transaction's effect is the recomputed
  [Holding](GLOSSARY.md#holding) balance.
- **Exchange rates** ([by date](GLOSSARY.md#exchange-rate)) and the
  **P&L / FIFO engine** (Component 6) — needed for transfer cost basis and per-row
  realized P&L (both [USD-anchored](GLOSSARY.md#usd-anchor)).

## Concepts used — links into GLOSSARY

- [Transaction](GLOSSARY.md#transaction) — the event being recorded; its types and
  balance effects.
- [Holding](GLOSSARY.md#holding) — the balance recalculated after every change.
- [Asset](GLOSSARY.md#asset) — supplies each trade's **native price currency**;
  ticker is display, a separate fetch identifier prices it.
- [FIFO lots and cost basis](GLOSSARY.md#fifo-lots-and-cost-basis) — drives transfer
  cost-basis carry and per-row [realized](GLOSSARY.md#realized-and-unrealized) P&L.
- [Net invested capital](GLOSSARY.md#net-invested-capital) — kept correct by the
  auto-created cash legs of trades.
- [Fiat FX P&L](GLOSSARY.md#fiat-fx-pl) — why a non-USD sell's percentage binds to
  the USD figure, not the native one.

## Behaviors / rules

### Transaction types and balance effect

A transaction is one of seven user-recordable types, plus two cash legs the system
creates on its own. Each type either **adds** to or **subtracts** from the
[Holding](GLOSSARY.md#holding) it sits on:

| Type | User-recordable | Balance effect on its holding |
|------|:---:|---|
| `buy` | yes | add |
| `sell` | yes | subtract |
| `transfer_in` | yes | add |
| `transfer_out` | yes | subtract |
| `dividend` | yes | add |
| `interest` | yes | add |
| `fee` | yes | subtract |
| `cash_credit` | auto (paired to a sell) | add (to the fiat holding) |
| `cash_debit` | auto (paired to a funded buy) | subtract (from the fiat holding) |

> Worked example — balance effect. A `buy` of 0.5 units adds 0.5 to that
> (asset, platform) holding. Its paired `cash_debit` subtracts the cash outlay from
> the funding platform's fiat holding. Both are just rows whose `amount` adds to or
> subtracts from whichever holding they touch.

### Asset-native price currency

Every trade's `unit_price` is expressed in the **asset's native currency** — a BIST
stock prices in ₺, a US stock or crypto in $, gram gold in ₺. The price currency is
**defaulted from the chosen asset** (and pre-filled from the latest known price when
available) and is **editable**, but it is **never a free currency picker decoupled
from the asset**: picking or changing the asset resets the price currency to that
asset's native currency. P&L is still measured in [USD](GLOSSARY.md#usd-anchor); the
native price is converted using the [rate on (or just before) the transaction's
date](GLOSSARY.md#exchange-rate).

### Cash-leg pairing (keeping net invested correct)

A one-sided trade would corrupt cash tracking: a sell removes shares but conjures no
cash; a buy adds shares but draws from nowhere. So a trade's cash movement is
captured as a **separate, automatically-created cash leg** paired to the trade. The
pairing is recorded with `linked_tx_id` and the cash leg sits on the fiat
[Asset](GLOSSARY.md#asset) for the trade's price currency.

| Parent | Cash leg created? | Leg type | Leg sits on | Leg amount |
|--------|:---:|---|---|---|
| `buy` — external funding | no | — | — | — |
| `buy` — funded from a platform | yes | `cash_debit` | (price-currency fiat, funding platform) | `total_cost + fee` if fee is in the price currency, else `total_cost` |
| `sell` | yes (always) | `cash_credit` | (price-currency fiat, the trading platform) | `total_cost − fee` if fee is in the price currency, else `total_cost` |
| `transfer_in` / `transfer_out` | no | — | — | — |
| `dividend` / `interest` | no | — | — | — |
| `fee` (standalone) | no | — | — | — |

Only `buy` and `sell` ever carry a cash leg. A fee in a different currency than the
price currency stays informational (the cash leg carries `total_cost` unmodified). A
funded buy must not overdraw the funding platform's cash — insufficient cash is
rejected with an inline error (compared with strict `<`, so exactly-enough is
allowed). The cash legs net against deposits, so a sell and its `cash_credit` cancel
in [net invested capital](GLOSSARY.md#net-invested-capital).

### Transfers move cost basis, book no P&L

A transfer relocates a position from one [Platform](GLOSSARY.md#platform) to another.
Recording a `transfer_out` of an asset also produces a matching `transfer_in` on the
destination platform (on creation; afterward the two sides are independent rows,
edited individually). **A transfer books no [realized](GLOSSARY.md#realized-and-unrealized)
P&L** — it carries the position's [cost basis](GLOSSARY.md#fifo-lots-and-cost-basis)
across, so the moved units keep their original USD cost. The `transfer_in` carries
the **weighted-average USD cost of the lots consumed** by the move:

- For a fiat/currency asset, the cost basis is trivially the amount of its own
  currency (price = 1, currency = its own ticker).
- For a non-currency asset, the cost is the FIFO-consumed lots' weighted average,
  in USD.

> Worked example — transfer cost basis. Holding consists of two lots: 2 units bought
> at $100 and 3 units bought at $110. Transferring 5 units consumes both lots:
> `(2×$100 + 3×$110) = $530` over `5` units → **$106.00 per unit**. The destination
> `transfer_in` records a USD cost basis of $106/unit; no gain or loss is realized.

### Per-row realized P&L on sells

A `sell` row displays the [realized](GLOSSARY.md#realized-and-unrealized) gain/loss
that sale locked in, matched against the oldest open
[lots first (FIFO)](GLOSSARY.md#fifo-lots-and-cost-basis), **net of the sell's fee**.
P&L is evaluated **in [USD](GLOSSARY.md#usd-anchor) as the source of truth**; the
percentage always binds to the USD figure (a position up in lira but down in dollars
renders as a loss). FIFO is computed over the asset's **complete** prior history, not
a filtered view, so a sell shown under a date/type filter still reports the correct
cost basis.

- USD-priced sell → one line: `+$50.00 (+20.0%)`.
- Non-USD sell → native primary (no %) plus a USD secondary with the %:
  `+₺1,000.00` and `~$13.33 (+66.7%)`.
- Sell with no prior lots (cost basis 0) → show the dollar figure, omit the % (no
  divide-by-zero). Sign/colour follow the USD result.

> Worked example — realized P&L. Buy 1 unit @ $250, then buy 2 @ $262, then sell 1 @
> $300. FIFO consumes the oldest lot ($250 basis): gain `$300 − $250 = $50.00`, i.e.
> `50 / 250 = +20.0%` (minus any sell fee). The sell row shows **+$50.00 (+20.0%)**.

> Worked example — FX makes native ≠ USD. Day 1 (USD/TRY 50) buy ₺1,000 → $20 basis.
> Day 30 (USD/TRY 60) sell for ₺2,000 → $33.33 proceeds. Native return looks like
> +100%, but the real USD return is `$13.33 / $20 = +66.7%`. The row binds to +66.7%.

## Contract (I/O)

**Input (one transaction):** asset, platform, type, date, quantity (`amount`),
`unit_price` + `price_currency` (asset-native; for price-bearing types), optional
`fee` + `fee_currency`, optional notes. A `buy` may also carry a **funding source**
(external, or a platform to debit). A `transfer_out` also takes a **destination
platform**.

**Output / effects:**

- The transaction row is persisted.
- If the type warrants it, a paired **cash leg** (`cash_credit`/`cash_debit`) or a
  matching **`transfer_in`** is created automatically.
- Every touched **(asset, platform)** [Holding](GLOSSARY.md#holding) balance is
  recalculated as `SUM(adds) − SUM(subtracts)` over its transactions (the auto cash
  legs participate naturally because they sit on the fiat holding).
- On edit, the existing cash leg is reconciled to the post-edit parent (create /
  delete / update-in-place); on delete, the paired cash leg is removed with it.

**Invariants:**

- Cash legs are system-generated, never hand-entered, and exist only for `buy`/`sell`.
- A transfer books **no realized P&L**.
- Quantities and prices reflect full numeric precision; balances are derived, never
  typed directly.

## UI contract

### Single add / edit

A type-driven form: choosing the type reveals only the relevant fields.

- All types: asset, platform, date (defaults to today, past dates allowed), amount,
  notes.
- Price-bearing types (`buy`, `sell`, `dividend`, `interest`, and a lone non-currency
  `transfer_in`): `unit_price` + `price_currency` (defaulted from the asset, editable)
  and a live **Total** readout.
- `buy`/`sell`: optional fee + fee currency.
- `buy`: a **Funding source** selector — "External cash (no deduction)" or any
  platform holding the price-currency fiat; insufficient cash is flagged inline.
- `sell`: no funding selector (cash always lands on the trading platform); a
  confirmation line shows `Sale proceeds: <amount> → credited to {platform} {currency}`.
- `transfer_out`: a **destination platform**; the cost-basis line is shown read-only
  (auto-computed).
- Sell / transfer-out / fee are blocked when the amount exceeds the current balance on
  that platform.
- "Save & add another" records the entry and keeps the form open with type / asset /
  platform / date / currency / funding / notes intact, clearing only amount and price.

### Bulk import

A **spreadsheet-style editable grid** with one typed cell per field (asset picker,
type, date, quantity, price, currency, derived read-only total, fee, platform). Each
row carries a status (clean / new / dirty / invalid) and per-cell validation with
inline errors. Rows can be added blank, or **imported** three ways:

1. **Paste** tab-separated rows copied from a spreadsheet (header row auto-detected,
   else positional columns). Locale-tolerant date and number parsing.
2. **Upload a CSV** file exported from a spreadsheet.
3. **Import a broker PDF statement** — parses only executed buy/sell rows (cancelled
   and non-trade rows are skipped); each parsed row lands in the grid for review.

Imported tickers/platforms that don't match an existing [Asset](GLOSSARY.md#asset) or
[Platform](GLOSSARY.md#platform) are surfaced. Unknown tickers are marked as "new"
(a pending-creation placeholder), and **before anything is committed**, a
**resolve-unknowns step** walks each unknown: it first tries to auto-identify and
create the asset from a price feed, and only the leftovers prompt the user for
category / display name / price source. The save is **atomic** — it validates all
rows, resolves all unknowns, then commits the whole batch (with cash legs for sells
and funded buys) or rolls back entirely, after which holding balances are recomputed.

## Acceptance

- [ ] Recording a `buy` increases the holding **and** creates a paired `cash_debit`
      on the funding platform (or none, if external).
- [ ] Recording a `sell` always creates a paired `cash_credit` on the trading platform.
- [ ] A `sell` / `transfer_out` / `fee` exceeding the platform balance is rejected.
- [ ] A transfer moves the position across platforms, carries weighted-average cost
      basis, and books **no realized P&L**.
- [ ] A `sell` row shows its FIFO realized P&L (USD-anchored; native + USD for non-USD
      sells; % omitted when cost basis is zero).
- [ ] A trade's price currency is **defaulted from the asset and editable**, never a
      free picker decoupled from the asset.
- [ ] Importing a broker PDF yields editable, validated grid rows; cancelled/non-trade
      rows are skipped.
- [ ] Pasting or uploading rows populates the grid with locale-tolerant parsing.
- [ ] An unknown ticker is surfaced and resolved **before** anything is saved.
- [ ] Bulk save is atomic and recomputes every touched holding's balance.
