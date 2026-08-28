# P&L Engine — Case-by-Case Test Cases & Handover

Companion to `docs/pnl-methodology.md` (definitions, return-% methodology, and known issues).

Purpose: a verifiable, case-by-case description of how the P&L engine **must** behave. Each case lists concrete inputs and the exact expected outputs. Use it to (a) hand the engine off to anyone (or future-you), (b) manually verify on prod, and (c) drive the automated tests. These cases are now wired as **Vitest** tests against the real engine (`computePortfolioPnL`): `src/lib/pnl/cases.test.ts`, `totals.test.ts`, and `src/lib/portfolio/daily.test.ts`. The time-weighted-return cases at the end run against `computeTWRSeries` in `src/lib/twr.test.ts`. Run `npm test`.

---

## The model (read first)

All money math is in USD, via `bignumber.js`. Engine lives in `src/lib/pnl/*` and `src/lib/performance.ts`; it's consumed by `src/hooks/usePnL.ts`.

**Canonical Total P&L (money-weighted):**
```
Total P&L $   = total value − net invested capital
```
- **The % companion is the lifetime cumulative MWR** (`computeLifetimeMwrCumulativePct`,
  `src/lib/mwr.ts` — tested in `mwr.test.ts`, see methodology §2), not a ratio of
  the dollars above. The former peak-net-invested % and all peak calculations
  were removed 2026-08-28; the historical per-case "% = x/peak" expectations
  were removed from this file with them. The **$** expectations below are
  unchanged and still run as tests.
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

**Income rule.** A dividend/interest is *income*: a gain equal to the amount received, **neutral to net invested**. It can arrive two ways, both giving the same P&L:
- **Units** (staking / reinvested dividend) → adds a lot at market cost; the gain shows up as `income`, the units' own unrealized starts at 0.
- **Cash** → credits a cash balance; the gain shows up as `income`.

**Period / daily return ("for the given time").** Not all-time, but change since the previous snapshot (`computeDailyReturn`):
```
period return $  = current value − previous-snapshot value − net invested during the period
period return %  = period return $ / (previous value + net invested during the period)
```
Income is neutral in "net invested during the period" too — so interest earned in the period shows up as period gain. The **baseline** is the most recent snapshot dated *before today* (home-local, `homeDayIso()`), chosen by date — not `snapshots[length-2]` — so it's correct before today's snapshot is written and across cron gaps (a >1-day-old baseline still shows the delta). Period transactions are bucketed by their **home-local** day so the cutoff matches the (home-local) `snapshot_date`. The period % keeps its own base (`prev value + period invested`).

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
- Reconcile: 21 + 0 + 5 = 26 = 126 − 100. ✓ (The QQQ-style real case: a reinvested dividend is counted once, as income — never also as unrealized.)

### Case 6 — Sell (realized) — and the % denominator
**Inputs:** Buy 2 units @ $100 ($200). Sell 1 unit @ $150 (no fee). Current price $150.
**Expected:**
- Net invested = 200 − 150 = **$50**. Remaining 1 unit, cost $100. Value = **$150**.
- unrealized **+$50** (150 − 100), realized **+$50** (150 − 100), income $0.
- **Total P&L = +$100** (150 − 50).
- Reconcile: 50 + 50 + 0 = 100 = 150 − 50. ✓
- **Note:** the $ reads the same regardless of whether the $150 was withdrawn or left on the platform as cash (the paired `cash_credit` cancels the sell's subtraction).

### Case 7 — Fiat FX is real P&L
**Inputs:** Hold €100 cash (`transfer_in` €100) when EUR/USD = 1.10. Later EUR/USD = 1.20. No income.
**Expected:**
- Net invested = €100 × 1.10 = **$110**. Value = €100 × 1.20 = **$120**.
- unrealized (FX) **+$10**, realized $0, income $0.
- **Total P&L = +$10 = +9.09%** (10 / 110).
- Reconcile: 10 + 0 + 0 = 10 = 120 − 110. ✓ (EUR appreciating vs USD is a genuine gain — the money-weighted anchor captures it.)

### Case 8 — Interest on a foreign-currency balance (the subtle one — no double-count)
This validates the net-invested vs fiat-cost-basis split. The interest must show as **income**, not as a phantom FX gain.

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
- **Total P&L = +$30** (0 − (−30)).
- Reconcile: 0 + 30 + 0 = 30 = 0 − (−30). ✓ (Realized from sold-out positions is included in the headline total.)

### Case 11 — Cash-plumbing invariance: withdraw vs hold proceeds (the headline demo)
**Inputs:** Buy 2 @ $100 ($200). Sell 1 @ $150 — once with proceeds **withdrawn**, once **kept as cash** (paired `cash_credit`).
**Expected:** Both → Total P&L **+$100**. Same trade ⇒ same P&L, regardless of cash plumbing.

### Case 12 — Withdraw the full principal, keep the gains
**Inputs:** Buy 1 @ $100; price → $200; sell 0.5 @ $200 (proceeds withdrawn). Remaining 0.5 unit @ $200.
**Expected:** Net invested **$0**, value **$100**, Total P&L **+$100**.
- Reconcile: unrealized 50 + realized 50 + 0 = 100. ✓

### Case 13 — Loss then withdrawal
**Inputs:** Buy 1 @ $100; price → $50; sell 1 @ $50 (withdrawn).
**Expected:** realized **−$50**, Total P&L **−$50** (not −$100). ✓

### Case 14 — FIFO ordering (oldest lot first)
**Inputs:** Buy 1 @ $100, buy 1 @ $200, sell 1 @ $250 (withdrawn). Current price $250.
**Expected:** realized **+$150** (250 − 100, not avg 150), remaining lot $200 → unrealized **+$50**, Total P&L **+$200**.
- Reconcile: 50 + 150 + 0 = 200. ✓

### Case 15 — Income reinvested then fully sold at cost (counted once)
**Inputs:** Buy 1 @ $100; reinvested dividend 0.05u @ $100 (income); sell 1.05u @ $100 (withdrawn).
**Expected:** realized **$0**, income **+$5**, Total P&L **+$5**. The $5 is counted once. ✓

### Case 16 — Income then withdrawn
**Inputs:** $100 USD cash; +$5 interest (cash); withdraw $5.
**Expected:** net invested **$95**, value **$100**, income **+$5**, Total P&L **+$5**. ✓

### Case 17 — Income on a losing position
**Inputs:** Buy 1 @ $100; +$5 cash dividend; price → $80.
**Expected:** unrealized **−$20**, income **+$5**, value **$85**, net invested **$100**, Total P&L **−$15 = −15%**. ✓

### Case 18 — Fee on a buy (capitalized, still held)
**Inputs:** Buy 1 @ $100 + **$2 fee**; price $120.
**Expected:** cost basis **$102** (fee capitalized), net invested **$102**, unrealized **+$18**, Total P&L **+$18**. ✓

### Case 19 — Fee on a sell (reduces proceeds → realized)
**Inputs:** Buy 1 @ $100; sell 1 @ $150 − **$3 fee** (withdrawn).
**Expected:** realized **+$47** (147 − 100), net invested **−$47**, Total P&L **+$47**. ✓

### Case 20 — Asset priced in TRY (native currency + FX)
**Inputs:** Buy 10 units @ ₺100 (₺1000) at USD/TRY = 25 → cost **$40**. Later price ₺150 at USD/TRY = 30 → value **$50**.
**Expected:** unrealized **+$10**, Total P&L **+$10**. (₺ gain +50%, USD gain +25% of the deployed $40 — TRY depreciation eats the rest.) ✓

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

### Case 23 — Tax charged to cash (stopaj)
The `tax` type: money the tax office took from a cash balance (e.g. Midas' monthly fund stopaj, one lump per month).
**Inputs:** transfer_in $1,000 to USD cash; `tax` of $50 on the same cash holding. Price USD = 1.
**Expected:**
- Balance 950 → value **$950**. Net invested **$1,000** (tax is a cost, never a flow — it must not shrink invested the way a `transfer_out` would, and it is not an external flow for XIRR/TWR either, so the return engines absorb it as performance).
- Total P&L **−$50**, surfaced as the cash holding's unrealized (the fiat cost basis keeps the pre-tax figure).
- Reconciles: 950 − 1,000 = −50 + 0 + 0. ✓

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
**money-weighted return is solved as an XIRR over that period alone** (opening
value in at the period start, each external flow at its own date, closing value as
the terminal amount, then de-annualized back over the period), and the periods are
**geometrically chained** and rebased to 0% at the window start — the chaining is
what removes the flows from the result. Value-weighting across holdings is
automatic — each period reads the snapshot **total**. See
[GLOSSARY → Time-Weighted Return](components/GLOSSARY.md#time-weighted-return-twr).

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
**Expected:** (a) `approximate === true` — with no valuation on the day the money
landed, the period absorbs some of the flow's own timing; (b) `approximate ===
false` — daily periods are exact. (`endPct` value isn't asserted here; the flag is
the point.) Note this is a **data** caveat: the period's XIRR is exact for the
flows it is given.

### TWR-6 — Mid-period flow: XIRR, not a linear Dietz weight = +69.72%
**Inputs:** one 10-day period — $1,000 on 2026-01-01 → $3,000 on 2026-01-11, with
a **$1,000 buy on 2026-01-06** (day 5 of 10).
**Expected:** **+69.722436%** (`endPct`), and the same figure as the period's
`returnPct` from `computeMonthlyReturns`; `returnUsd = 3,000 − 1,000 − 1,000 =
$1,000`.

This is the case that pins which engine ships. With `d` the daily discount factor
`(1+r)^(−1/365.25)` and `z = d⁵`, the period's XIRR equation is
`1,000 + 1,000·z − 3,000·z² = 0` ⇒ `3z² − z − 1 = 0` ⇒ `z = (1 + √13) / 6`, and the
period return is the terminal multiple `z⁻² − 1 = 36 / (14 + 2√13) − 1 =`
**+69.722436%**.

The **retired** Modified Dietz formula gave `1,000 ÷ (1,000 + 1,000 × 0.5) =`
**+66.667%** — it credits the late $1,000 with half the period's exposure,
inflating the capital base, where discounting it at day 5 of 10 charges it only
the growth it actually rode. Every other case in this section agrees between the
two (each is flow-free, or its gain is exactly zero); this one does not.

### TWR-7 — A losing day survives annualization
**Inputs:** daily snapshots 100 → 90, no transactions.
**Expected:** **−10%** exactly. Worth its own case because a −10% day annualizes to
`r = −1 + 1.9e-17`: reconstructing the period return via `1 + r` rounds that to a
total wipeout (−100%). The engine de-annualizes in log space (`expm1(s · years)`
from `solveXirrLog1p`) and lands on −10%.

## How to verify on prod (manual)

1. Open the browser console on the Portfolio/Dashboard — confirm **no** `[usePnL] P&L reconciliation mismatch` warning. That alone proves Case 10 for your live data.
2. For a specific case, add the transactions via **Add Transaction** (for income: pick the type, then **Received as Units/Cash**), then read the Portfolio summary bar:
   - **Total P&L** ($ and %) = the canonical figure.
   - **Unrealized · Realized · Dividend & interest income** sub-lines = the decomposition; they must sum to Total P&L.
3. For period return ("for the given time"), use the Portfolio **Daily** return toggle (compares against the previous snapshot).

## Known, intentional behaviors (not bugs)
- **The headline % is the lifetime cumulative MWR** (`lib/mwr.ts`) — no peak- or current-invested ratio. The **$** uses current net invested (Cases 6, 9).
- **Fiat FX counts as P&L** (Case 7) — by design (USD anchor).
- **Income is neutral to net invested** and recognized once, as the `income` term (Cases 2–5, 8).
- **At-source tax is an additive overlay** (Case 22): an asset with an `at_source_tax_rate` (e.g. PPF 17.5%) reports `taxAccrualUsd` = rate × positive native gain (held + realized); gross figures and the reconciliation invariant are untouched, and after-tax Total P&L = gross − `totalTaxAccrualUsd`. Realized accrual covers held positions only (a sold-out position is not accrued).
- **Foreign-declarable income** (non-TRY, non-withheld dividend + interest summed in TRY by year, the 22,000 TL threshold) is a reporting figure computed in `src/lib/pnl/foreign-income.ts`, separate from the money-weighted total.
- **Out of scope / not yet addressed** (see "Known issues / out of scope" in `docs/pnl-methodology.md`): standalone `fee` double-counts (captured as known-failing Case 21, zero occurrences); category attribution omits fully-sold positions.

## Engine reference
| Concern | Function | File |
|---|---|---|
| **Engine (one pure function)** | `computePortfolioPnL` | `src/lib/pnl/portfolio.ts` |
| Net invested | `computeCurrentInvestedUsd` / `applyTxToInvested` | `src/lib/performance.ts` |
| Income | `computeIncomeUsd` | `src/lib/pnl/income.ts` |
| FIFO cost basis & realized | `computeFIFOLots`, `buildRealizedByTx` | `src/lib/pnl/fifo.ts`, `realized.ts` |
| Unrealized | `computeUnrealizedPnL` | `src/lib/pnl/unrealized.ts` |
| Canonical total + % | `summarizePnLTotals` | `src/lib/pnl/totals.ts` |
| Period/daily return + baseline | `computeDailyReturn`, `buildDailyReturnLookups` | `src/lib/pnl/daily.ts`, `src/lib/portfolio/grouping.ts` |
| Wiring + reconciliation assert | `usePnL` (thin wrapper over `computePortfolioPnL`) | `src/hooks/usePnL.ts` |
