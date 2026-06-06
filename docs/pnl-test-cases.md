# P&L Engine — Case-by-Case Test Cases & Handover

Date: 2026-06-06 · Companion to `docs/superpowers/specs/2026-06-05-dividend-interest-income-design.md` and `docs/pnl-engine-critique.md`.

Purpose: a verifiable, case-by-case description of how the P&L engine **must** behave. Each case lists concrete inputs and the exact expected outputs. Use it to (a) hand the engine off to anyone (or future-you), (b) manually verify on prod, and (c) seed automated tests later. No test runner is wired up (project decision); these are worked numeric specs.

---

## The model (read first)

All money math is in USD, via `bignumber.js`. Engine lives in `src/lib/pnl/*` and `src/lib/performance.ts`; it's consumed by `src/hooks/usePnL.ts`.

**Canonical Total P&L (money-weighted):**
```
Total P&L $   = total value − net invested capital
Total P&L %   = Total P&L $ / |net invested capital| × 100
```
- **Total value** = every holding (incl. cash balances) × current price, in USD.
- **Net invested capital** = external money deployed. Per transaction type (`applyTxToInvested` in `performance.ts`):

  | Type | Effect on net invested |
  |---|---|
  | buy | `+ total + fee` |
  | sell | `− total + fee` |
  | transfer_in | `+ total` (carried cost basis / opening balance) |
  | transfer_out | `− total` |
  | **dividend** | **0 — income, not capital** |
  | **interest** | **0 — income, not capital** |
  | fee (standalone) | `+ fee` |
  | cash_credit | `+ total` (paired sell-side cash) |
  | cash_debit | `− total` (paired buy-side cash) |

**Decomposition + the reconciliation invariant.** Total P&L also breaks into three terms, and they MUST tie out:
```
Total value − net invested  ==  unrealized + realized + income      (within $0.01)
```
- **unrealized** = value − FIFO cost basis of open lots (`computeUnrealizedPnL`).
- **realized** = gains booked by sells/fees via FIFO (`buildRealizedByTx`).
- **income** = Σ dividend + interest, in USD (`computeIncomeUsd`).

`usePnL` has a dev assert that `console.warn`s `[usePnL] P&L reconciliation mismatch` if this identity ever breaks. **A silent console = the engine is internally consistent.**

**Income rule (the recent change).** A dividend/interest is *income*: a gain equal to the amount received, **neutral to net invested**. It can arrive two ways, both giving the same P&L:
- **Units** (staking / reinvested dividend) → adds a lot at market cost; the gain shows up as `income`, the units' own unrealized starts at 0.
- **Cash** → credits a cash balance; the gain shows up as `income`.

**Period / daily return ("for the given time").** Not all-time, but change since the previous snapshot (`computeDailyReturn`):
```
period return $  = current value − previous-snapshot value − net invested during the period
period return %  = period return $ / (previous value + net invested during the period)
```
Income is neutral in "net invested during the period" too — so interest earned in the period shows up as period gain.

---

## Cases

Format per case: **Inputs** → **Expected** (net invested, value, unrealized / realized / income, Total P&L $ / %). All satisfy the reconciliation invariant; the check is shown.

### Case 1 — Buy, price rises (pure unrealized)
**Inputs:** Buy 1 unit @ $100 (USD, no fee). Current price $120.
**Expected:**
- Net invested = **$100**. Value = **$120**.
- unrealized **+$20**, realized $0, income $0.
- **Total P&L = +$20 = +20%** (20 / 100).
- Reconcile: 20 + 0 + 0 = 20 = 120 − 100. ✓

### Case 2 — Interest as cash · the anchor case · all-time
**Inputs:** Hold $100 USD cash (opening balance / `transfer_in` $100). Receive **$5 interest** (cash). Price of USD = 1 (no FX).
**Expected:**
- Net invested = **$100** (interest is neutral). Value = **$105** (cash).
- unrealized $0, realized $0, **income +$5**.
- **Total P&L = +$5 = +5%** (5 / 100). ✓ matches "$5 interest on $100 ⇒ 5%".
- Reconcile: 0 + 0 + 5 = 5 = 105 − 100. ✓

### Case 3 — Same $100 + $5 interest, expressed "for the given time" (period return)
**Inputs:** Previous snapshot value = $100. During the period, receive $5 interest (cash); no other cash deployed. Current value = $105.
**Expected:**
- period return $ = 105 − 100 − 0 = **+$5**.
- denominator = 100 + 0 = 100 → period return % = 5 / 100 = **+5%**. ✓
- This is the "5% pnl for the given time" reading of the same event.

### Case 4 — Interest reinvested as units (cash vs units give the same answer)
**Inputs:** Buy 1 unit @ $100. Receive $5 interest **as 0.05 units @ $100** (units mode). Price stays $100.
**Expected:**
- Net invested = **$100**. Balance = 1.05 units. Value = **$105**. FIFO cost of open lots = $105.
- unrealized $0 (105 − 105), realized $0, **income +$5**.
- **Total P&L = +$5 = +5%.** ✓ Identical to Case 2 — units vs cash don't change P&L.
- Reconcile: 0 + 0 + 5 = 5 = 105 − 100. ✓

### Case 5 — Dividend reinvested, then price rises (income + unrealized together)
**Inputs:** Buy 1 unit @ $100. Reinvested dividend = 0.05 units @ $100 ($5). Later price → $120.
**Expected:**
- Net invested = **$100**. Balance 1.05. Value = 1.05 × 120 = **$126**. Open-lot cost = $105.
- unrealized **+$21** (126 − 105), realized $0, **income +$5**.
- **Total P&L = +$26 = +26%** (26 / 100).
- Reconcile: 21 + 0 + 5 = 26 = 126 − 100. ✓ (This is the QQQ-style real case. Before the fix it wrongly showed +$10.56 from one $5.28 dividend.)

### Case 6 — Sell (realized) — and the % denominator
**Inputs:** Buy 2 units @ $100 ($200). Sell 1 unit @ $150 (no fee). Current price $150.
**Expected:**
- Net invested = 200 − 150 = **$50**. Remaining 1 unit, cost $100. Value = **$150**.
- unrealized **+$50** (150 − 100), realized **+$50** (150 − 100), income $0.
- **Total P&L = +$100** (150 − 50). **% = 100 / 50 = +200%.**
- Reconcile: 50 + 50 + 0 = 100 = 150 − 50. ✓
- **Note:** the % is over *net invested*, which shrank to $50 after you pulled $150 out — so it can look large. This is the money-weighted definition (capital currently at work), not a bug. Read the **$** for the plain answer.

### Case 7 — Fiat FX is real P&L
**Inputs:** Hold €100 cash (`transfer_in` €100) when EUR/USD = 1.10. Later EUR/USD = 1.20. No income.
**Expected:**
- Net invested = €100 × 1.10 = **$110**. Value = €100 × 1.20 = **$120**.
- unrealized (FX) **+$10**, realized $0, income $0.
- **Total P&L = +$10 = +9.09%** (10 / 110).
- Reconcile: 10 + 0 + 0 = 10 = 120 − 110. ✓ (EUR appreciating vs USD is a genuine gain — the money-weighted anchor captures it.)

### Case 8 — Interest on a foreign-currency balance (the subtle one — no double-count)
This validates the net-invested vs fiat-cost-basis split (spec §4.4). The interest must show as **income**, not as a phantom FX gain.

**Inputs:** Hold €100 (`transfer_in` €100) at EUR/USD = 1.10. Receive **€5 interest** (cash) while EUR/USD = 1.10. Later EUR/USD = 1.20.
**Expected:**
- Global net invested = **$110** (interest neutral). Balance = €105. Value = €105 × 1.20 = **$126**.
- income = €5 @ 1.10 = **+$5.50**.
- The fiat holding's own cost basis absorbs the received €5 at $5.50 → €105 cost basis = $115.50, so the interest itself creates **no** FX gain. unrealized (FX) = 126 − 115.50 = **+$10.50**. realized $0.
- **Total P&L = +$16** (126 − 110).
- Reconcile: 10.50 + 0 + 5.50 = 16 = 126 − 110. ✓
- Sanity: principal €100 went $110→$120 (+$10); the €5 interest went $5.50→$6.00 (+$0.50); FX unrealized = $10.50; interest income = $5.50; total $16. **If the split were missing, the €5 would also inflate FX unrealized → +$21.50, double-counting by $5.50.**

### Case 9 — Fully sold / "house money" (negative net invested)
**Inputs:** Buy 1 unit @ $100. Sell all 1 @ $130. No holdings remain.
**Expected:**
- Net invested = 100 − 130 = **−$30** (you took out more than you put in). Value = **$0**.
- unrealized $0, realized **+$30** (130 − 100), income $0.
- **Total P&L = +$30** (0 − (−30)). **% = 30 / |−30| = +100%.**
- Reconcile: 0 + 30 + 0 = 30 = 0 − (−30). ✓ (% uses `|net invested|`; realized from sold-out positions is included in the headline total.)

### Case 10 — Reconciliation invariant (master check)
For **any** mix of the above, the engine must hold:
```
total value − net invested  ==  unrealized + realized + income   (±$0.01)
```
If `usePnL` ever `console.warn`s `[usePnL] P&L reconciliation mismatch`, a case is broken — capture the two printed numbers and the transactions that triggered it.

---

## How to verify on prod (manual)

1. Open the browser console on the Portfolio/Dashboard — confirm **no** `[usePnL] P&L reconciliation mismatch` warning. That alone proves Case 10 for your live data.
2. For a specific case, add the transactions via **Add Transaction** (for income: pick the type, then **Received as Units/Cash**), then read the Portfolio summary bar:
   - **Total P&L** ($ and %) = the canonical figure.
   - **Unrealized · Realized · Dividend & interest income** sub-lines = the decomposition; they must sum to Total P&L.
3. For period return ("for the given time"), use the Portfolio **Daily** return toggle (compares against the previous snapshot).

## Known, intentional behaviors (not bugs)
- **% denominator is `|net invested|`** (money-weighted). After withdrawals it can be small → large %. Read the $ for the intuitive answer (Cases 6, 9).
- **Fiat FX counts as P&L** (Case 7) — by design (USD anchor).
- **Income is neutral to net invested** and recognized once, as the `income` term (Cases 2–5, 8).
- **Out of scope / not yet addressed** (see `docs/pnl-engine-critique.md`): in-kind standalone `fee` slightly over-books loss (#2, currently zero occurrences); the "daily" label assumes a daily snapshot cadence (#4); category attribution omits fully-sold positions (#3).

## Engine reference
| Concern | Function | File |
|---|---|---|
| Net invested | `computeCurrentInvestedUsd` / `applyTxToInvested` | `src/lib/performance.ts` |
| Income | `computeIncomeUsd` | `src/lib/pnl/income.ts` |
| FIFO cost basis & realized | `computeFIFOLots`, `buildRealizedByTx` | `src/lib/pnl/fifo.ts`, `realized.ts` |
| Unrealized | `computeUnrealizedPnL` | `src/lib/pnl/unrealized.ts` |
| Canonical total | `summarizePnLTotals` | `src/lib/pnl/totals.ts` |
| Period/daily return | `computeDailyReturn` | `src/lib/pnl/daily.ts` |
| Wiring + reconciliation assert | `usePnL` | `src/hooks/usePnL.ts` |
