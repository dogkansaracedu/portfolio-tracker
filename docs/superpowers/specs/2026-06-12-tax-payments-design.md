# Actual tax payments in P&L — Design

> Status: approved in brainstorming · Date: 2026-06-12
> Layer: design spec. On implementation, the behavioral/technical component docs
> (04 transactions, 06 P&L engine, 07 dashboard, 08 portfolio, GLOSSARY) and the
> Vitest cases get updated in the same change set — per `CLAUDE.md`.

## Motivation

Taxes are real money leaving the book, and today the headline P&L ignores them.
The June 8 spec built the *estimated* layer (the PPF at-source accrual, display-only
on taxed rows) and the 22k income tracker, but explicitly deferred everything else.
This spec adds the *factual* layer: record taxes actually paid, and let them reduce
Total P&L the way fees do.

Two real-world events drive the design:

1. **At-source withholding on fund redemption.** Redeeming the PPF / a TEFAS fund,
   the broker withholds a percentage of the TRY gain. The cash received is already
   net; the withheld lira never reaches the tracked cash balance.
2. **The annual declaration (beyanname).** Tax paid to the tax office on last
   year's declarable gains/income — a lump payment covering many assets, paid from
   a personal bank account the app does not (and should not) track.

**No automation.** Tax amounts are always user-entered from the broker statement or
tax receipt. The app knows what a tax payment *does* to P&L, never what it
*should be*. No rate tables, no Yİ-ÜFE indexing, no progressive brackets.

## Decision record (from brainstorming)

- Core goal: **track actual taxes paid** — not estimated accruals on open foreign
  positions, not a year-end report view.
- Events covered: redemption withholding + annual declaration payment.
- **Paid tax reduces the headline Total P&L.** This is distinct from (and does not
  reopen) the 2026-06-11 "gross-only headlines" decision, which was about the
  *estimated* accrual; that decision stands.
- Model: **`tax` as a transaction type** (over a separate tax ledger or a hybrid) —
  one convention, full reuse of the transaction UI/history/edit machinery.

## Component 1 — Data model

**1a. New transaction type `tax`.** Joins the existing type set (buy, sell,
transfer_in/out, dividend, interest, fee, cash_credit/debit). Reuses the standard
fields: `amount` (the tax paid, native units of its currency), `price_currency`
(defaults TRY), `date`, `notes`, `related_asset_id`, `linked_tx_id`.

**1b. Funding distinction.** A `tax` transaction is funded one of two ways:

- **From tracked money** — the txn sits on the cash/fiat holding the money left,
  and *subtracts* from that holding's balance. The redemption-withholding flow:
  record the fund sell at **gross** (realized P&L stays correct; the auto cash leg
  credits gross proceeds), then the tax txn debits the same platform's TRY cash by
  the withheld amount. Balances end truthful.
- **External** — flagged as externally funded; touches **no holding balance**.
  Used for the beyanname. Carries only date, amount, currency, note.

The exact schema shape of the flag (boolean column vs nullable holding scope) is a
planning-step decision; the behavioral contract is the two funding kinds above.

**1c. Attribution.** `related_asset_id` optionally points at the taxed asset
(the PPF for a withholding). The beyanname stays portfolio-level
(`related_asset_id` empty) — no forced allocation across the assets it covers.

**1d. No FIFO interaction.** `tax` transactions live on cash/fiat holdings or are
external; they never consume FIFO lots. There is no in-kind tax case.

## Component 2 — Engine (`computePortfolioPnL`)

**2a. Canonical formula gains one term.**

```
Total P&L (USD) = current value − net invested capital − external taxes paid
```

- **Tracked tax**: the cash debit already shrinks current value, so the formula
  picks it up with no explicit term. The rule that makes it a *cost* rather than a
  *withdrawal*: a `tax` txn has **zero effect on net invested** (and therefore on
  peak net invested — the Total P&L % denominator never moves because of a tax).
  At holding scope, it reduces the fiat holding's deployed basis like an outflow,
  so the loss does not surface as fiat FX P&L.
- **External tax**: subtracted explicitly, converted to USD at the
  **transaction-date FX rate** (same on-or-before lookup as every conversion).

**2b. Decomposition + invariant.** New outputs: per-asset `taxesPaidUsd`
(attributed via `related_asset_id`) and portfolio `totalTaxesPaidUsd`, with the
external subtotal distinguishable. Gross unrealized / realized / income are
untouched. The invariant becomes:

```
value − net invested − external taxes = unrealized + realized + income − taxes paid (all)
```

**2c. The at-source accrual narrows to unrealized-only.** Today's accrual
estimates tax on held **+ realized** native gains. It becomes
`rate × max(unrealized native gain, 0)`. On redemption, the realized side is
covered by the *recorded actual* withholding, not the estimate — so a redemption
with its tax txn never double-counts. Division of labor: **estimates on open
positions, actuals on closed ones.** (Between selling and recording the tax txn
the realized gain shows gross; the user records both together.)

**2d. Daily return.** A tracked tax payment reads as a real cost on the day it
happens (value dropped — same as fees). An external payment never moves daily
return (no tracked value changed). A deliberate, locally-truthful asymmetry.

**2e. P&L-over-time stays reconciled with the headline.** The snapshot-derived
series (Component 10) becomes
`value(date) − net invested(date) − external taxes paid on/before date`. Tracked
taxes are already inside frozen snapshot values; without the external term the
chart's "now" point would disagree with the hero after a beyanname payment. The
series steps down on the payment date. Monthly returns are untouched by external
taxes (neither a flow nor a value change); a tracked tax reads as that period's
cost, like a standalone fee.

**2f. Recognition timing (cash basis).** A tax txn affects figures from its
**payment date** on — prior periods never restate. Concretely: the beyanname for
2025 gains, paid March 2026, leaves every 2025-scoped figure untouched (snapshot
values, monthly returns, any year-bounded view) and reduces lifetime Total P&L —
and the P&L-over-time line — from March 2026. Each beyanname installment
(March / July) is its own txn. Backdating to Dec 31 is possible (dates are free)
but not recommended: the cash factually left in 2026, and converting at an
earlier date's FX rate (TRY depreciating) would overstate the USD cost. Seeing a
liability *before* it's paid is the estimated-accrual layer's job, which for
foreign gains is explicitly out of scope here.

## Component 3 — Display

- **Transactions page**: `tax` rows in the timeline with their own badge, native
  amount, note, and related asset when set.
- **Headlines**: no new figure — Dashboard hero and Portfolio summary Total P&L
  are net of paid taxes by construction. The estimated accrual stays confined to
  taxed rows (2026-06-11 decision unchanged).
- **Breakdown**: one new line — **Taxes paid: −$X** — alongside
  realized / unrealized / income wherever the decomposition is shown.
- **Taxed rows** (PPF): after-tax display unchanged, fed by the narrowed
  unrealized-only accrual; cumulative taxes actually paid on that asset appear in
  its breakdown.
- **Entry form**: type `tax` asks: funded from a tracked cash holding (pick
  which) or external; amount + currency (default TRY); optional related asset;
  date; note. Gain/loss rendering reuses the canonical palette + signed
  formatters from `lib/prices`; labels/type literals go through constants, not
  hardcoded strings.

## Component 4 — Tests (Vitest, `docs/pnl-test-cases.md`)

1. **Withholding round-trip**: PPF sell at gross books correct realized P&L; tax
   txn debits cash; headline Total P&L is net; invariant holds.
2. **External beyanname**: Total P&L drops by the USD-converted amount; no
   balance changes; invariant holds.
3. **Accrual narrowing**: partial redemption — estimate on the remaining
   position, actuals on the sold portion, no double-count.
4. **FX**: a TRY tax converts at its transaction-date rate.
5. **Denominator stability**: net invested and peak are identical with and
   without tax txns.

All money math in bignumber.js, per project convention.

## Docs to update in the implementation change (CLAUDE.md)

- **GLOSSARY**: "tax payment" (the two funding kinds), updated Total P&L formula,
  updated invariant, narrowed at-source accrual definition.
- **04 Transaction system** (behavioral + technical): the `tax` type, balance
  effect, funding flag, attribution.
- **06 P&L engine** (behavioral + technical): formula, invariant, accrual
  narrowing, daily-return note.
- **07 Dashboard / 08 Portfolio**: breakdown line, entry form, taxed-row note.
- **10 Snapshots & performance**: the external-taxes term in P&L-over-time;
  monthly-returns note.

> Behavioral docs + GLOSSARY were updated ahead of implementation (2026-06-12, at
> the user's request) with ⏳ spec'd-not-shipped markers; the implementation
> change removes the markers and writes the **technical** docs (which name real
> files/functions and so can only be written with the code).

## Non-goals (explicitly out of scope)

- Dividend / interest withholding modeling (US 15–30%, BIST stopaj) — door open,
  not built; income txns keep their current semantics.
- Estimated tax on foreign (US) capital gains — no progressive brackets, no
  Yİ-ÜFE indexing.
- Auto-computing any tax amount, auto-creating tax txns on redemption, or
  reconciling the accrual against actuals beyond the unrealized-only narrowing.
- The 22k foreign-income tracker is untouched (paying the beyanname is recorded
  as an external tax txn; no linkage to the tracker).

## Open questions for the planning step

1. Schema shape of the funding flag: boolean `is_external` on the txn vs making
   the holding scope nullable for `tax` rows. (Lean: boolean + the txn always
   carries a currency; nullable scoping ripples further.)
2. Whether the external-tax subtotal needs its own breakdown line or stays inside
   "Taxes paid" with a tooltip. (Lean: single line.)
