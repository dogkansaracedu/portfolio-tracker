# Component 6: P&L Engine — Behavioral Spec

> Layer: behavioral (tech-agnostic). Implementation → [technical/06-pnl-engine.md](technical/06-pnl-engine.md)

> ⏳ The tax-payment behaviors below (rule 8, the external-taxes term, the
> narrowed accrual in rule 7) are **spec'd but not yet implemented**
> ([tax-payments design](../superpowers/specs/2026-06-12-tax-payments-design.md));
> remove this marker when they ship.

## Purpose

A pure computation layer that turns a holding's transaction history, current
prices, historical FX rates, and portfolio snapshots into profit/loss figures.
Produces both **per-asset** breakdowns and **portfolio totals** consumed by the
Dashboard, Portfolio, and Transactions views. No UI of its own, no stored
results — everything is derived on demand.

The headline number is **money-weighted**, not a sum of trade gains. See
[P&L Methodology](../pnl-methodology.md) for the full rationale.

## Depends on

- Component 4 (Transaction System) — the dated events that drive every figure.
- Component 5 (Price Engine) — current per-unit prices and historical
  [exchange rates](GLOSSARY.md#exchange-rate).
- Component 10 (Snapshots) — frozen daily portfolio values; the source of
  "current value" and "yesterday's close" (see
  [snapshot price / live quantity](GLOSSARY.md#snapshot-price-and-live-quantity)).

## Concepts used — links into GLOSSARY + methodology

This component *uses* most P&L vocabulary; it does not define it. See:

- [USD anchor](GLOSSARY.md#usd-anchor) · [Net invested capital](GLOSSARY.md#net-invested-capital) · [Money-weighted](GLOSSARY.md#money-weighted)
- [FIFO lots and cost basis](GLOSSARY.md#fifo-lots-and-cost-basis) · [Realized and unrealized](GLOSSARY.md#realized-and-unrealized) · [Fiat FX P&L](GLOSSARY.md#fiat-fx-pl)
- [Daily return](GLOSSARY.md#daily-return) · [Time-Weighted Return](GLOSSARY.md#time-weighted-return-twr) · [Snapshot](GLOSSARY.md#snapshot) · [Exchange rate](GLOSSARY.md#exchange-rate)
- Formulas: [Total P&L](GLOSSARY.md#total-pl) · [Daily return formula](GLOSSARY.md#daily-return-formula) · [Time-Weighted Return formula](GLOSSARY.md#time-weighted-return-formula)
- Deep rationale (incl. the return-% methodology — TWR vs money-weighted vs peak): [P&L Methodology](../pnl-methodology.md)
- Verifiable behaviour: [worked P&L cases](../pnl-test-cases.md) (run as Vitest)

## Behaviors / rules

All math is in the [USD anchor](GLOSSARY.md#usd-anchor). FIFO runs per
**(asset, platform)** pair (lots only match within a single holding); results
roll up to the asset and portfolio level.

### 1. FIFO lots / cost basis

See [FIFO lots and cost basis](GLOSSARY.md#fifo-lots-and-cost-basis). Replay a
holding's transactions oldest-first:

- **buy / transfer_in / dividend / interest** → push a new lot. Any fee on the
  acquisition is **capitalized into the lot's cost** (fee-inclusive cost basis).
- **sell** → consume the **oldest lots first**; book
  [realized](GLOSSARY.md#realized-and-unrealized) P&L per consumed lot. Sell fees
  reduce proceeds (symmetric with buys).
- **transfer_out** → consume lots FIFO but book **no P&L** — the cost basis
  travels to the destination, carried on the paired transfer_in's unit price.
- **transfer_in** → push a lot at the **original cost basis** of the linked
  transfer_out (weighted-average of the lots that moved), so a platform-to-
  platform move is P&L-neutral.
- **fee** (standalone) → consume lots FIFO **and** book a realized loss equal to
  the fee's current market value.
- **cash legs** (`cash_credit` / `cash_debit`) → **ignored by FIFO**. Cash is a
  medium of exchange, not a tradeable lot; including it would mint meaningless
  lots on USD/TRY/EUR. (It still matters for *net invested* — see rule 3.)
- **tax** → **ignored by FIFO** (it sits on cash holdings or outside the book;
  there is no in-kind tax). Its P&L effect is rule 8, not a lot event.

**Worked example.** Buy 2 @ $100, later buy 3 @ $110, then sell 4:

```
lots before sell:  [2 @ $100]  [3 @ $110]
sell 4 consumes:    2 @ $100  (cost $200)  +  2 @ $110  (cost $220)
cost basis of sale = $420
proceeds (sell px = $130) = 4 × $130 = $520
realized P&L = 520 − 420 = +$100
lots remaining: [1 @ $110]   ← cost basis $110
```

### 2. Currency normalization

See [exchange rate](GLOSSARY.md#exchange-rate). Convert every native amount to
USD using the rate **on or just before** the transaction's date (binary-search
the dated rate series; if the date predates all rates, fall back to the earliest
known rate rather than treating the foreign amount as USD).

- **TRY → USD:** amount ÷ usd_try.
- **EUR → USD:** amount × eur_usd (fall back to eur_try ÷ usd_try for legacy
  rows missing a direct EUR/USD rate).
- **USD → USD:** identity.

**Worked example.** A ₺3,000 buy on a day when usd_try = 30 → 3000 ÷ 30 = **$100**.

### 3. Money-weighted Total P&L (canonical)

See [Total P&L](GLOSSARY.md#total-pl) and [net invested capital](GLOSSARY.md#net-invested-capital).
The headline is **not** a FIFO sum — it is:

```
Total P&L (USD) = current value − net invested capital − external taxes paid
```

[Net invested capital](GLOSSARY.md#net-invested-capital) is the cumulative USD
actually deployed: buys + fees add; sells + dividends/interest subtract;
transfers cancel (out + in net to zero, a lone transfer_in adds its cost basis);
**cash legs net out the trade they pair with** — a sell's proceeds leave
"invested" via the sell, and its paired `cash_credit` adds them back, so a sale
that lands cash on-platform nets to **zero** invested change. **`tax` has no
effect on net invested** (or its peak) — a tax is a cost, not a withdrawal; see
rule 8 for how each funding kind reaches the total. Total-return % is
over [peak net invested capital](GLOSSARY.md#peak-net-invested-capital) (the running
max), **not** the current balance — so withdrawing your own money never changes the %,
and it can't explode as the current balance shrinks toward zero.

**Worked example.** Deploy a net $50,000 over time (never withdrawing, so peak =
current = $50,000); portfolio is worth $51,000 today → Total P&L = 51,000 − 50,000 =
**+$1,000** (+2.0%). After a withdrawal the current balance shrinks, but the % stays
over the $50,000 peak.

### 4. Realized / unrealized as sub-views

See [realized and unrealized](GLOSSARY.md#realized-and-unrealized).

- **Realized** = FIFO gains locked in by sells (and the fee losses), summed over
  the **full** history — including positions fully sold out.
- **Unrealized** = current value − cost basis of lots still held.
- They are sub-views of the canonical total: **unrealized = total − realized**.

### 5. Fiat FX P&L

See [Fiat FX P&L](GLOSSARY.md#fiat-fx-pl). Fiat/cash holdings are **not**
zero-P&L. They **skip the FIFO lot engine** (cash isn't a tradeable position)
but carry an FX gain/loss via the cash-flow path:

```
fiat cost basis = net USD deployed into that currency  (rule 3, scoped to the holding)
fiat FX P&L     = current USD value − fiat cost basis   → surfaced as unrealized
```

So EUR/TRY swings vs the USD anchor count, and the per-asset breakdown reconciles
with the money-weighted total. The native count doesn't move (€X in, €X held);
the gain is purely the USD anchor shifting.

**Worked example.** Buy €12,547 worth of euros; the same euros are worth $13,449
today → fiat FX P&L = 13,449 − 12,547 = **+$902** (a real gain, native EUR
unchanged).

### 6. Daily return

See [Daily return](GLOSSARY.md#daily-return) and
[Daily return formula](GLOSSARY.md#daily-return-formula). The day's gain is the
canonical total applied across one period — the change in (value − invested)
since the previous [snapshot](GLOSSARY.md#snapshot):

```
dailyReturnUsd = value_now − prev_snapshot_value − period_invested
denom          = prev_snapshot_value + period_invested
dailyReturnPct = denom ≤ 0 ? — : dailyReturnUsd / denom × 100
```

`period_invested` = net USD deployed into the position since the previous
snapshot. Subtracting it removes principal, leaving only price/FX movement
(including the intraday move on a position opened today, measured from its
purchase price). When the base is ≤ 0 (e.g. a netted-out position) return **no
value** (render "—"), never 0% / NaN. Group rollups sum numerators and
denominators, then take the percentage once.

**Worked example.** Buy 1 @ $210 today (not held at the previous snapshot); it's
worth $220 now → daily = 220 − 0 − 210 = **+$10**, over a base of
0 + 210 = 210 → **+4.76%**.

### 7. After-tax (at-source) overlay — estimates, unrealized-only

See [After-tax P&L](GLOSSARY.md#after-tax-pl) and [at-source tax](GLOSSARY.md#at-source-tax).
Some holdings carry a fixed tax taken **at source** on their gains (a Turkish PPF:
17.5%). For these, the engine reports a **tax accrual** = rate × the *positive
**unrealized** native gain*, so the displayed gain is net (₺1,000 open gain →
₺825). Realized gains are **excluded from the accrual**: their tax is whatever
[tax payment](GLOSSARY.md#tax-payment) was actually recorded at redemption
(rule 8) — *estimates on open positions, actuals on closed ones*, so the same
gain is never taxed twice. It is an **additive overlay**: gross
unrealized/realized are untouched and the money-weighted invariant still holds;
after-tax Total P&L = gross Total P&L − total tax accrual. The rate is per-asset
config (it changes yearly); assets without a rate are unaffected.

### 8. Taxes paid (actuals)

See [Tax payment](GLOSSARY.md#tax-payment). Recorded actual taxes reduce the
canonical total — each exactly once, via its funding kind:

- **Tracked** (debited a cash holding): the value drop *is* the cost — the
  formula in rule 3 picks it up through `current value`, with no explicit term.
  Because `tax` never touches net invested, it reads as a cost, not a
  withdrawal. At holding scope it reduces the fiat holding's deployed basis like
  an outflow, so the cost does **not** surface as [fiat FX P&L](GLOSSARY.md#fiat-fx-pl).
- **External** (no balance touched): subtracted explicitly as
  `external taxes paid`, converted to USD at the **transaction-date** rate.

The decomposition gains a **taxes-paid** line (per asset via its attribution,
plus a portfolio total, external subtotal distinguishable) and the invariant
becomes:

```
value − net invested − external taxes = unrealized + realized + income − taxes paid (all)
```

**Recognition is cash-basis** — the payment date. A declaration paid in March
2026 reduces the total from March 2026 on; the prior year's figures don't
restate. **Daily return asymmetry (deliberate):** a tracked tax shows as a real
cost on its payment day (the value moved, same as fees); an external tax never
moves daily return (no tracked value changed) — it appears only in cumulative
figures (rule 3, and the P&L-over-time series in Component 10).

### 9. Time-weighted return (vs an index)

See [Time-Weighted Return](GLOSSARY.md#time-weighted-return-twr). Alongside the
money-weighted total (rule 3), the engine produces a **time-weighted return**
series — the basis on which an index quotes its own return, so it is the fair
head-to-head against a benchmark. It measures **only how the holdings performed**:
the timing and size of the owner's own deposits and withdrawals are **removed**,
period by period, before the periods are chained together. Within each period the
return is **value-weighted automatically** — it is read off the whole-portfolio
total, so a larger holding moves it more. The series is **rebased to 0% at the
window's start**, so the portfolio and the index both begin from the same line and
the gap between them is read directly.

It is most accurate when each period is one day; over a longer span (e.g.
weekly-sampled history) that contains a deposit or withdrawal it is an
**approximation**, and a window so affected is flagged as such. A period that
starts from no value contributes nothing (it is skipped, not counted as a loss).

**Worked example.** Over three daily periods the holdings go +20%, then −10%,
then flat → time-weighted return = `(1.20 × 0.90) − 1 =` **+8%**, independent of
any cash added or removed along the way.

## Contract (I/O)

**Inputs**
- A holding's [transactions](GLOSSARY.md#transaction), date-ascending, scoped per
  (asset, platform).
- Current per-unit [prices](GLOSSARY.md#price) in USD.
- The dated [exchange rate](GLOSSARY.md#exchange-rate) series.
- Portfolio [snapshots](GLOSSARY.md#snapshot) (latest for current value; the most
  recent one dated before today — home-local day — for the daily baseline).

**Outputs**
- **Per asset:** cost basis (USD + native when single-currency), current value,
  unrealized P&L (USD + %), realized P&L, remaining lots.
- **Portfolio totals:** total cost basis, total current value, total unrealized,
  total realized (full history), income, **net invested capital**, **peak net
  invested**, and the canonical **Total P&L** (USD, TRY, %). The % is over peak and is
  **null → render "—"** when peak ≤ 0 (nothing ever deployed). Plus `totalTaxAccrualUsd`
  — the portfolio sum of the per-asset [after-tax](GLOSSARY.md#after-tax-pl) overlay —
  and the **taxes-paid totals** (all taxes paid in USD, with the external subtotal
  distinguishable).
- **Per asset (cont.):** `taxAccrualUsd` — the at-source tax accrual for that
  holding (0 when it carries no rate) — and its attributed cumulative taxes paid.
- **Per realizing transaction:** a realized-P&L entry (proceeds, cost basis,
  realized USD, native gain when single-currency) keyed by transaction id.
- **Daily return** per asset / holding, with the denominator for group rollups.
- **Time-weighted return series** for a window: a rebased-to-0% cumulative
  percent at each snapshot, the end value, and an "approximate" flag (set when a
  flow fell inside a multi-day period). Built from the snapshot history + the
  transaction flows; consumed by the Dashboard's vs-market view (Component 7).

## Acceptance

- [ ] A buy sequence produces cost lots in FIFO (oldest-first) order.
- [ ] A sell after multiple buys computes realized P&L by consuming oldest lots.
- [ ] Non-USD (e.g. TRY) transactions convert to USD using the historical rate
      on/before their date.
- [ ] Unrealized P&L = current value − cost basis of remaining lots.
- [ ] Transfers preserve cost basis (no realized P&L on a transfer).
- [ ] **Total P&L = current value − net invested capital** (money-weighted), and
      the live "now" figure equals the snapshot-derived value at every snapshot
      (period deltas are the true value change).
- [ ] **Fiat holdings report FX P&L** (current USD value − net USD deployed into
      that currency), reconciling with the money-weighted total.
- [ ] Realized + unrealized reconcile to the total (`unrealized = total − realized`).
- [ ] Daily return = Δ(value − invested) since the most recent snapshot before today
      (home-local day); a ≤ 0 base returns no value rather than 0% / NaN.
- [ ] **Total P&L % is over peak net invested** — a withdrawal does not change it; it
      renders "—" when peak ≤ 0 (nothing ever deployed).
- [ ] An at-source-taxed asset (e.g. PPF, 17.5%) reports its gain net of tax via an
      additive accrual; gross figures and the money-weighted invariant are unchanged.
- [ ] The accrual covers the **unrealized** gain only; a redemption with its recorded
      withholding never double-counts (estimate on the open remainder, actual on the
      sold portion).
- [ ] A tracked tax payment reduces Total P&L through the cash it debited; an
      external one through the explicit term — each exactly once; net invested and
      peak are identical with and without tax txns.
- [ ] Recognition is cash-basis: a tax txn affects figures from its payment date
      on; prior periods don't restate.
- [ ] **Time-weighted return** chains per-period returns with the period's
      external cash flow removed, rebased to 0% at the window start: chaining +20%
      then −10% reads **+8%**, a flow on flat prices reads **0%**, and a window
      with a flow inside a multi-day period is flagged **approximate**.

See [P&L Methodology](../pnl-methodology.md) for why money-weighted is canonical.
