# P&L Engine — Case-by-Case Test Cases & Handover

Date: 2026-06-06 · Companion to `docs/pnl-methodology.md` (definitions, return-% methodology, and known issues).

Purpose: a verifiable, case-by-case description of how the P&L engine **must** behave. Each case lists concrete inputs and the exact expected outputs. Use it to (a) hand the engine off to anyone (or future-you), (b) manually verify on prod, and (c) drive the automated tests. These cases are now wired as **Vitest** tests against the real engine (`computePortfolioPnL`): `src/lib/pnl/cases.test.ts`, `peak.test.ts`, `totals.test.ts`, and `src/lib/portfolio/daily.test.ts`. The time-weighted-return cases at the end run against `computeTWRSeries` in `src/lib/twr.test.ts`. Run `npm test`.

---

## The model (read first)

All money math is in USD, via `bignumber.js`. Engine lives in `src/lib/pnl/*` and `src/lib/performance.ts`; it's consumed by `src/hooks/usePnL.ts`.

**Canonical Total P&L (money-weighted):**
```
Total P&L $   = total value − net invested capital
Total P&L %   = Total P&L $ / peak net invested capital × 100   (— when peak ≤ 0)
```
- **Peak net invested** = the running maximum of the net-invested ledger
  (`computePeakInvestedUsd`) — "the most external capital ever at work at once."
  The % uses peak, not the *current* net invested, so withdrawing your own money
  never changes the return and a sell reads the same whether its proceeds are
  withdrawn or kept as cash. The **$** figure still uses current net invested.
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
Income is neutral in "net invested during the period" too — so interest earned in the period shows up as period gain. The **baseline** is the most recent snapshot dated *before today* (home-local, `homeDayIso()`), chosen by date — not `snapshots[length-2]` — so it's correct before today's snapshot is written and across cron gaps (a >1-day-old baseline still shows the delta). Period transactions are bucketed by their **home-local** day so the cutoff matches the (home-local) `snapshot_date`. The period % keeps its own base (`prev value + period invested`); peak is only for the all-time %.

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
- **Total P&L = +$100** (150 − 50). **% = 100 / 200 = +50%** (peak invested = $200, the high-water mark before the sell).
- Reconcile: 50 + 50 + 0 = 100 = 150 − 50. ✓
- **Note:** the % is over *peak* net invested ($200), so it reads the intuitive +50% regardless of whether the $150 was withdrawn or left on the platform as cash. (Under the old `|current net invested|` denominator this showed +200%.)

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
- **Total P&L = +$30** (0 − (−30)). **% = 30 / 100 = +30%** (peak invested = $100).
- Reconcile: 0 + 30 + 0 = 30 = 0 − (−30). ✓ (% uses peak net invested, so "turned $100 into $130" reads as +30% even though current net invested is −$30. Realized from sold-out positions is included in the headline total. Under the old denominator this showed +100%.)

### Case 11 — Peak invariance: withdraw vs hold proceeds (the headline demo)
**Inputs:** Buy 2 @ $100 ($200). Sell 1 @ $150 — once with proceeds **withdrawn**, once **kept as cash** (paired `cash_credit`).
**Expected:** Both → Total P&L **+$100**, peak invested **$200**, **% = +50%**. Same trade ⇒ same %, regardless of cash plumbing. (`computePeakInvestedUsd` in `peak.test.ts`.)

### Case 12 — Withdraw the full principal, keep the gains
**Inputs:** Buy 1 @ $100; price → $200; sell 0.5 @ $200 (proceeds withdrawn). Remaining 0.5 unit @ $200.
**Expected:** Net invested **$0**, value **$100**, peak **$100**, Total P&L **+$100 = +100%**. (Old `|current invested|` denominator → ÷0 → 0%, wrong.)
- Reconcile: unrealized 50 + realized 50 + 0 = 100. ✓

### Case 13 — Loss then withdrawal
**Inputs:** Buy 1 @ $100; price → $50; sell 1 @ $50 (withdrawn).
**Expected:** realized **−$50**, peak **$100**, Total P&L **−$50 = −50%** (not −100%). ✓

### Case 14 — FIFO ordering (oldest lot first)
**Inputs:** Buy 1 @ $100, buy 1 @ $200, sell 1 @ $250 (withdrawn). Current price $250.
**Expected:** realized **+$150** (250 − 100, not avg 150), remaining lot $200 → unrealized **+$50**, peak **$300**, Total P&L **+$200 = +66.67%**.
- Reconcile: 50 + 150 + 0 = 200. ✓

### Case 15 — Income reinvested then fully sold at cost (counted once)
**Inputs:** Buy 1 @ $100; reinvested dividend 0.05u @ $100 (income); sell 1.05u @ $100 (withdrawn).
**Expected:** realized **$0**, income **+$5**, peak **$100**, Total P&L **+$5 = +5%**. The $5 is counted once. ✓

### Case 16 — Income then withdrawn
**Inputs:** $100 USD cash; +$5 interest (cash); withdraw $5.
**Expected:** net invested **$95**, peak **$100**, value **$100**, income **+$5**, Total P&L **+$5 = +5%**. ✓

### Case 17 — Income on a losing position
**Inputs:** Buy 1 @ $100; +$5 cash dividend; price → $80.
**Expected:** unrealized **−$20**, income **+$5**, value **$85**, net invested **$100**, Total P&L **−$15 = −15%**. ✓

### Case 18 — Fee on a buy (capitalized, still held)
**Inputs:** Buy 1 @ $100 + **$2 fee**; price $120.
**Expected:** cost basis **$102** (fee capitalized), net invested **$102**, peak **$102**, unrealized **+$18**, Total P&L **+$18 = +17.65%**. ✓

### Case 19 — Fee on a sell (reduces proceeds → realized)
**Inputs:** Buy 1 @ $100; sell 1 @ $150 − **$3 fee** (withdrawn).
**Expected:** realized **+$47** (147 − 100), net invested **−$47**, peak **$100**, Total P&L **+$47 = +47%**. ✓

### Case 20 — Asset priced in TRY (native currency + FX)
**Inputs:** Buy 10 units @ ₺100 (₺1000) at USD/TRY = 25 → cost **$40**. Later price ₺150 at USD/TRY = 30 → value **$50**.
**Expected:** unrealized **+$10**, peak **$40**, Total P&L **+$10 = +25%**. (₺ gain +50%, USD gain +25% — TRY depreciation eats the rest.) ✓

### Case 21 — Standalone fee (KNOWN-FAILING, out of scope)
**Inputs:** $100 USD cash; standalone `fee` of $5.
**Correct expected:** Total P&L **−$5**, reconciles. **Current engine:** −$10 (double-count: value −$5 *and* net invested +$5) and reconciliation breaks. Captured as `it.fails` in `cases.test.ts` — a tripwire that flips to a real failure once fixed. Zero occurrences today. See §"Out of scope".

### Case 22 — PPF (at-source tax)
Validates the additive after-tax overlay: gross figures untouched, the accrual reported alongside.
**Inputs:** Buy 1,000 units @ ₺1 (usd_try 25 → **$40** cost). NAV rises to ₺2/unit → native gain **₺1,000**. Asset carries `at_source_tax_rate` 17.5%. Current `price_usd` 0.08, `price_try` 2.
**Expected:**
- Gross unrealized **+$40** (value $80 − cost $40), realized $0, income $0.
- At 17.5%: tax ₺175 → after-tax native gain **₺825**.
- `taxAccrualUsd` **$7.00** (= ₺175 × price_usd 0.08 / price_try 2). After-tax Total P&L = 40 − 7 = **+$33**.
- Gross figures unchanged; the overlay is additive, so the reconciliation invariant still holds (40 + 0 + 0 = 80 − 40). ✓
- (See `src/lib/pnl/after-tax.test.ts`.)

### Case 10 — Reconciliation invariant (master check)
For **any** mix of the above, the engine must hold:
```
total value − net invested  ==  unrealized + realized + income   (±$0.01)
```
If `usePnL` ever `console.warn`s `[usePnL] P&L reconciliation mismatch`, a case is broken — capture the two printed numbers and the transactions that triggered it.

---

## Time-Weighted Return (vs an index)

These mirror `src/lib/twr.test.ts` (`computeTWRSeries` in `src/lib/performance.ts`).
TWR measures **holdings performance only**: each snapshot-to-snapshot period's
money-weighted return is taken with that period's **external cash flow removed**,
then the periods are **geometrically chained** and rebased to 0% at the window
start. Value-weighting across holdings is automatic — each period reads the
snapshot **total**. See [GLOSSARY → Time-Weighted Return](components/GLOSSARY.md#time-weighted-return-twr).

### TWR-1 — Chaining flow-free periods: +20% then −10% = +8%
**Inputs:** snapshots 100 → 120 → 108, no transactions.
**Expected:** `(1.20 × 0.90) − 1 =` **+8%** (`endPct ≈ 8`); the first point's
`cumulativePct = 0` (rebased to the window start).

### TWR-2 — Mid-window deposit on flat prices = 0%
**Inputs:** snapshots 100 → 150 over one week; a **$50 deposit** lands inside the
period (no price movement).
**Expected:** the deposit is removed, so the holdings did nothing → **0%**
(`endPct ≈ 0`). A deposit must not masquerade as a +50% return.

### TWR-3 — Value-weighting within a period via the snapshot total = +18%
**Inputs:** one period, two holdings: GOLD $5,000 → $7,500 (**+50%**) and STOCK
$20,000 → $22,000 (**+10%**); no flows.
**Expected:** the period return is read off the totals: `(29,500 − 25,000) ÷
25,000 =` **+18%** — the larger STOCK position pulls the blended return toward its
+10%, not the naive (50+10)/2 = 30%. **+18%** (`endPct ≈ 18`).

### TWR-4 — Withdrawal contributes no gain/loss; weights reset after it = +35.7%
**Inputs:** four snapshots —
1. $25,000 (GOLD 5,000 + STOCK 20,000)
2. $29,500 (GOLD 7,500 + STOCK 22,000) — period return **+18%**
3. $10,000 (GOLD 5,000 + STOCK 5,000) with a **$19,500 withdrawal** in the period
   → the withdrawal is removed, so this period is **flat (~0%)**, not a −66% crash
4. $11,500 (GOLD 6,000 + STOCK 5,500) — period return **+15%**
**Expected:** `(1.18 × 1.00 × 1.15) − 1 =` **+35.7%** (`endPct ≈ 35.7`). The
withdrawal neither helps nor hurts the return, and the post-withdrawal period is
weighted off the new (smaller) base.

### TWR-5 — "approximate" flag (daily vs weekly with a flow)
**Inputs:** (a) weekly snapshots 100 → 160 with a deposit **inside** the 7-day
period; (b) daily snapshots 100 → 160 with a deposit on the closing day.
**Expected:** (a) `approximate === true` — a flow inside a >1-day period is a
Modified-Dietz approximation; (b) `approximate === false` — daily periods are
exact. (`endPct` value isn't asserted here; the flag is the point.)

## How to verify on prod (manual)

1. Open the browser console on the Portfolio/Dashboard — confirm **no** `[usePnL] P&L reconciliation mismatch` warning. That alone proves Case 10 for your live data.
2. For a specific case, add the transactions via **Add Transaction** (for income: pick the type, then **Received as Units/Cash**), then read the Portfolio summary bar:
   - **Total P&L** ($ and %) = the canonical figure.
   - **Unrealized · Realized · Dividend & interest income** sub-lines = the decomposition; they must sum to Total P&L.
3. For period return ("for the given time"), use the Portfolio **Daily** return toggle (compares against the previous snapshot).

## Known, intentional behaviors (not bugs)
- **% denominator is peak net invested** (money-weighted). Stable across withdrawals; "—" only when nothing was ever deployed. The **$** uses current net invested (Cases 6, 9).
- **Fiat FX counts as P&L** (Case 7) — by design (USD anchor).
- **Income is neutral to net invested** and recognized once, as the `income` term (Cases 2–5, 8).
- **At-source tax is an additive overlay** (Case 22): an asset with an `at_source_tax_rate` (e.g. PPF 17.5%) reports `taxAccrualUsd` = rate × positive native gain (held + realized); gross figures and the reconciliation invariant are untouched, and after-tax Total P&L = gross − `totalTaxAccrualUsd`. Realized accrual covers held positions only (a sold-out position is not accrued).
- **Foreign-declarable income** (non-TRY, non-withheld dividend + interest summed in TRY by year, the 22,000 TL threshold) is a reporting figure computed in `src/lib/pnl/foreign-income.ts`, separate from the money-weighted total.
- **Out of scope / not yet addressed** (see `docs/pnl-methodology.md` §6): standalone `fee` double-counts (#2 — captured as known-failing Case 21, zero occurrences); category attribution omits fully-sold positions (#3). **Now fixed:** daily baseline is date-based + home-local (was #4's cadence/timezone concern); the all-time % uses peak invested.

## Engine reference
| Concern | Function | File |
|---|---|---|
| **Engine (one pure function)** | `computePortfolioPnL` | `src/lib/pnl/portfolio.ts` |
| Net invested | `computeCurrentInvestedUsd` / `applyTxToInvested` | `src/lib/performance.ts` |
| Peak net invested (% denominator) | `computePeakInvestedUsd` | `src/lib/performance.ts` |
| Income | `computeIncomeUsd` | `src/lib/pnl/income.ts` |
| FIFO cost basis & realized | `computeFIFOLots`, `buildRealizedByTx` | `src/lib/pnl/fifo.ts`, `realized.ts` |
| Unrealized | `computeUnrealizedPnL` | `src/lib/pnl/unrealized.ts` |
| Canonical total + % | `summarizePnLTotals` | `src/lib/pnl/totals.ts` |
| Period/daily return + baseline | `computeDailyReturn`, `buildDailyReturnLookups` | `src/lib/pnl/daily.ts`, `src/lib/portfolio/grouping.ts` |
| Wiring + reconciliation assert | `usePnL` (thin wrapper over `computePortfolioPnL`) | `src/hooks/usePnL.ts` |
