# Dividends & Interest as Income — Design Spec

Date: 2026-06-05 · Status: approved design, pre-implementation
Related: `docs/pnl-engine-critique.md` (finding #1), `project_pnl_money_weighted` memory

## 1. Problem

Dividends and interest are currently mis-modeled. They are treated as an
**acquisition** by the FIFO engine and as a **withdrawal** by the invested-capital
ledger — so the same income is counted twice, in opposite directions, and never
labeled as income.

Concretely, for the one existing dividend (QQQ, $5.28, recorded DRIP-style as
`amount = 0.009367` units × `$563.67`):

| View | Reports | Why |
|---|---|---|
| Money-weighted total (`value − net invested`) | **+$10.56** | value +$5.28 **and** invested −$5.28 |
| FIFO sum (`unrealized + realized`) | **+$0** | a plain share buy at market → no gain |
| Truth | **+$5.28** | it is income |

`dividend` and `interest` are handled **identically** in all three touch points
(`fifo.ts` buy branch, `performance.ts` `applyTxToInvested`, `balance.ts`), so
every statement here applies to both. The user will be adding many more
dividend/interest transactions, so this must be correct and ergonomic.

## 2. Principle

> A dividend or interest transaction is **income**: a realized gain equal to the
> amount received, and it leaves **net invested capital untouched**.

Consequences:
- Canonical money-weighted total (`value − net invested`) rises by exactly the
  income (value up; invested flat). This is the headline, per the standing
  money-weighted decision — no FIFO-sum headline is introduced.
- A distinct **income** figure becomes available to display.
- The two engines reconcile for income (closes the dividend slice of finding ★).

## 3. Recording model — one "Received as" selector

The reinvest question collapses into a single choice on the dividend/interest
form, because a reinvested dividend and a staking reward are the same shape
(income arriving as units).

### Mode A — Received as **Units** (staking rewards, reinvested dividends)
- `type` ∈ {dividend, interest}; `asset_id` = the security/crypto asset (non-fiat).
- `amount` = units received; `unit_price` = market price at receipt; `price_currency`
  = that currency; `total_cost` = `amount × unit_price` (income value in that currency).
- One transaction. **This is exactly the existing QQQ row** — no data change.

### Mode B — Received as **Cash** (cash dividends, bond/bank interest)
- `type` ∈ {dividend, interest}; `asset_id` = the **cash/fiat asset** that receives it
  (USD/EUR/TRY); `amount` = cash amount; `price_currency` = that currency;
  `unit_price` = 1; `total_cost` = `amount`.
- `platform_id` = where the cash lands (e.g. Midas). Cash credits that platform's
  existing balance in that currency (Midas USD $5,559; IBKR EUR €11,499; etc.).
- `related_asset_id` = the payer (e.g. QQQ) for attribution, or `null` (e.g. bank
  interest with no underlying).
- To reinvest later: add a normal `buy` (existing flow, with its paired cash_debit).

### Form / UX (`AddTransactionModal` + sheet import/validation)
- For dividend/interest, add a **Received as: Units | Cash** selector.
- **Units**: asset = non-fiat; fields `amount` + `unit_price` (prefilled from market).
  Current behavior.
- **Cash**: asset = a fiat/cash account; fields `amount` + currency + platform;
  optional "Paid by" → `related_asset_id`. `unit_price` is not shown (implicitly 1).
- Validation (`sheet/validation.ts`) and import (`sheet/parseImport.ts`) currently
  **require** `unit_price` for dividend/interest — relax so Cash mode does not
  require it.

## 4. Engine changes

### 4.1 Net invested becomes income-neutral (the core fix)
`performance.ts` `applyTxToInvested`: `dividend` and `interest` return `cum`
unchanged (today they do `cum.minus(totalUsd)`). This alone corrects the
money-weighted headline ($10.56 → $5.28) and the daily-return period base.

### 4.2 Income recognition (new)
- New pure helper `computeIncomeUsd(transactions, rates)` = Σ over dividend/interest
  of `normalizeToUsd(total_cost, price_currency, date, rates)`.
- Income is its **own term** in the decomposition: `total = unrealized + realized +
  income`, which must equal `value − net invested` (§4.5). FIFO realized stays
  sells/fees-only (§4.3), so income is counted exactly once.
- Display: a portfolio-level income figure (its own line, or merged under a
  "Realized / Income" label — §8). Per-transaction income on the Transactions page
  is read straight from the row's `total_cost` (in USD); the realized-by-tx lookup
  is not touched.

### 4.3 FIFO stays as-is for dividend/interest (no double count)
`fifo.ts` continues to push a lot at market cost for dividend/interest and to emit
**no** realized entry for them (current behavior). In Mode A this makes the units'
unrealized 0 at receipt; in Mode B the asset is fiat, so the pushed lot is ignored
(fiat value comes from balance × price, not FIFO lots). Income comes only from §4.2.

### 4.4 The net-invested vs fiat-cost-basis split (the nuance)
`computeCurrentInvestedUsd` is used for two different things:
1. **Global net invested** (money-weighted anchor) — dividend/interest **neutral**.
2. **Fiat holding cost basis** (the "deployed USD" behind a cash pile, used by the
   fiat branch in `usePnL` for FX P&L) — cash dividend/interest must **add at the
   received USD value**, so earned EUR/TRY income doesn't masquerade as an FX gain
   and isn't double-counted against the income line.

Resolution: give `applyTxToInvested` / `computeCurrentInvestedUsd` an explicit
context (e.g. an options flag `treatIncomeAsCapital: boolean`, default `false`).
The fiat-branch call in `usePnL` passes `true`; the global net-invested call uses
the default. Units mode is unaffected (non-fiat → FIFO owns its cost basis).

### 4.5 Reconciliation (must hold after the change)
For any dividend/interest of USD value `X`:
- Mode A (units): value `+X` (units at price), FIFO unrealized `+0`, income `+X`,
  net invested `+0` → money-weighted `+X`, decomposition `+X`. ✓
- Mode B (cash): value `+X` (cash balance), fiat-unrealized `+0` (cost basis
  includes it per §4.4), income `+X`, net invested `+0` → money-weighted `+X`,
  decomposition `+X`. ✓

A dev-time assert (`|(value − invested) − (unrealized + realized + income)| > $0.01`
→ warn) is recommended to lock this in (the deferred reconciliation guard, now
extended to include income).

## 5. Migration & ripple effects
- **No data migration**: the single existing QQQ dividend is already Mode A; only
  the engine reinterprets it.
- **Historical correction**: `computePnLTimeSeries` derives invested via
  `applyTxToInvested`, so chart points after 2026-03-27 shift by the $5.28
  correction once deployed. This is a correction, not a regression.
- Snapshots are unaffected (they store value/total_usd, which already include the
  units/cash); daily return stays consistent (income neutral in period-invested).

## 6. Out of scope
- In-kind standalone `fee` double-count (finding #2 — still zero occurrences).
- Snapshot "daily" labeling / staleness (finding #4).
- Per-category income attribution beyond per-asset (nice-to-have; not v1).
- Net-of-fee income (fees on dividend/interest are rare; income booked gross in v1).

## 7. Verification (no unit-test suite in this project)
- `tsc --noEmit`, `eslint`, `npm run build` clean.
- Reconciliation assert (§4.5) passes for the existing QQQ row and a manual test
  dividend in each mode.
- Manual prod check: record a Mode B cash dividend → income figure rises by the
  amount, cash balance rises, money-weighted total rises by the amount (not 2×),
  net invested unchanged.

## 8. Open decisions (confirm during planning)
- Exact name/shape of the income display (own line vs merged into "Realized").
- Whether `related_asset_id` attribution drives any per-asset income breakdown in v1.
