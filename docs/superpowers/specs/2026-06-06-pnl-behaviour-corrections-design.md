# P&L Behaviour Corrections + Test Cases — Design Spec

Date: 2026-06-06 · Status: approved design, pre-implementation
Related: `docs/pnl-test-cases.md` (the case doc this revises), `docs/pnl-engine-critique.md`,
`docs/superpowers/specs/2026-06-05-dividend-interest-income-design.md`,
memories `project_pnl_money_weighted`, `project_pnl_engine`, `project_asset_native_currency`.

## 1. Purpose

Three things, in order: (1) correct two P&L **behaviours** that are wrong or
misleading, (2) revise/extend the worked **test cases** in `docs/pnl-test-cases.md`
to match, (3) **wire the cases as Vitest tests** — the first automated tests in the
project, scoped to the pure P&L engine.

The canonical model is unchanged: money-weighted Total P&L `$ = value − net invested`,
USD anchor, decomposition `value − net invested == unrealized + realized + income`
(±$0.01). See `docs/pnl-test-cases.md` §"The model". This spec changes only the
**% denominator** and the **daily-return baseline/day-boundary**.

## 2. Decided behaviours

| # | Behaviour | Decision |
|---|---|---|
| 1 | **Total P&L %** | Denominator → **peak net invested** (was `\|current net invested\|`). Numerator/$ unchanged. |
| 2 | Anchor currency | **USD** (unchanged). |
| 3 | Dividend/interest income | **Neutral to net invested** (unchanged; already correct). |
| 4 | Trade fees (on buy/sell) | **Capitalized** (unchanged; already correct). |
| 5 | **Daily P&L** | Keep the name. Fix baseline to *most-recent snapshot dated before today*; show the delta even across gaps; compute the day boundary in **Turkey-local time** for baseline selection, period-tx bucketing, **and** snapshot dating (client + cron). |
| — | Standalone `fee`-type tx | **Out of scope** (double-counts; zero occurrences). Captured as a known-failing test. |

## 3. Behaviour change 1 — Total P&L % uses peak net invested

### 3.1 The defect
`Total P&L % = pnl$ / |current net invested|`. The numerator is fine; the
denominator is a **running balance** that shrinks on withdrawal, which violates a
basic principle:

> **Withdrawing your own money must not change your return %.**

It also makes the % depend on cash plumbing. Buy 2 @ $100, sell 1 @ $150 — same
trade, same $100 gain — reads **+200%** if the proceeds are withdrawn (net invested
$50) but **+50%** if they stay as a cash balance (net invested $200). And after a
full exit (house money) the base goes negative; near zero it explodes.

### 3.2 The fix
Denominator = **peak net invested** = the running maximum of the (pairing-aware)
net-invested ledger over the transaction timeline — "the most external capital ever
at work at once."

- **Numerator unchanged:** `totalPnlUsd = value − current net invested`.
- **`Total P&L % = totalPnlUsd / peakInvested × 100`**, or **"—" when `peakInvested ≤ 0`**
  (only when nothing was ever deposited).
- **Pairing-aware for free:** peak is the max of the *same* fold `applyTxToInvested`
  already drives, so paired buy/sell (which net to zero) don't inflate it.
- **Per scope, one engine:** portfolio uses the portfolio ledger's peak; per-asset
  uses that asset's ledger peak; a group's denominator = `Σ(member peaks)`. No
  per-section logic — this lives in the single engine and every consumer reads it.

### 3.3 Why peak is correct (worked)
- Withdraw-vs-hold invariant: both readings of the sell above → peak $200 → **+50%**.
- House money (buy $100, exit $130): peak $100, pnl +$30 → **+30%** (was +100%).
- Withdraw principal, keep gains (buy 1@100 → $200, sell 0.5@200 out): pnl +$100,
  peak $100 → **stays +100%** (current base hits ÷0 → shows 0%, wrong).
- Loss then withdraw (buy 1@100 → $50, sell 1@50 out): pnl −$50, peak $100 →
  **−50%** (current base: −100%, wrong).
- Hold-only portfolios: no withdrawals ⇒ peak = current ⇒ **identical to today**.

### 3.4 Blast radius
Only the displayed **%**'s denominator. The $ headline, the reconciliation
invariant, daily return, FIFO, and income are untouched.

## 4. Behaviour change 2 — Daily P&L baseline & day boundary

The money-weighted formula (`computeDailyReturn`: `current − prev − periodInvested`,
denom `prev + periodInvested`, income-neutral, FX-aware) is **correct and unchanged**.
The bugs are in *which baseline* it picks and *how the day is bounded*.

### 4.1 Baseline by date, not by array position (the real bug)
`buildDailyReturnLookups` uses `snapshots[length - 2]`, assuming the last snapshot is
always "today." But snapshots are written on price/tx change and by the daily cron,
so before today's snapshot exists, `length-2` is the **day before yesterday** and the
daily baseline silently jumps back a day.

**Fix:** select the baseline as **the most recent snapshot whose date is strictly
before today** (today in the reporting timezone, §4.3). Robust to whether today's
snapshot has been written yet.

### 4.2 Gaps — show the delta anyway
If the cron misses a day (or the project idled), the most-recent-before-today
snapshot is >1 day back. **Decision: show the delta anyway** (it's "since the last
close"); keep the "daily" label. The cron makes this rare; always showing a number
beats blanking it.

### 4.3 Day boundary in Turkey-local time (fix now)
"Today" and `snapshot_date` are UTC-derived; the user is in Turkey (UTC+3), so a
late-evening Turkish transaction can fall on the wrong side of the boundary.

**Fix:** introduce a configurable reporting timezone constant
(`REPORTING_TIMEZONE = "Europe/Istanbul"`, no hardcoded literals) and use the
local calendar date consistently for:
1. **Baseline selection** and **period-tx bucketing** (engine/hook) — via an
   `Intl.DateTimeFormat`-based "local date" helper, replacing bare `tx.date.slice(0,10)`
   comparisons so a tx and a snapshot are bucketed by the same local day.
2. **Snapshot dating on write** — the client snapshot-write path stamps
   `snapshot_date` with the local date.
3. **The daily cron** — reschedule from `55 23 * * *` UTC (02:55 Turkey) to
   end-of-Turkey-day (`55 20 * * *` UTC = 23:55 Turkey) and stamp `snapshot_date`
   with the local date, so the daily close snapshot belongs to the day it closes.

Exact migration/edge-function wording is settled during planning; the contract is:
**one consistent local calendar day across read, write, and cron.**

## 5. Test cases

`docs/pnl-test-cases.md` is the source of truth for behaviour; it is revised and the
new cases appended. Existing Cases 1–5, 7, 8, 10 are unchanged. All cases satisfy the
reconciliation invariant; the check is shown per case in the doc.

### 5.1 Changed (peak denominator — $ unchanged, % corrected)
| Case | Was | Now |
|---|---|---|
| **C6** Sell, % denominator | +200% | **+50%** (peak $200) |
| **C9** House money | +100% | **+30%** (peak $100) |

### 5.2 New — peak behaviour
- **Peak invariance:** buy 2@100, sell 1@150 — proceeds withdrawn vs kept as cash →
  both pnl **+$100, +50%** (identical; the headline demo).
- **Withdraw principal, keep gains:** buy 1@100 → $200, sell 0.5@200 (out) → pnl
  +$100, peak $100 → **+100%**.
- **Loss then withdraw:** buy 1@100 → $50, sell 1@50 (out) → pnl −$50, peak $100 →
  **−50%**.
- **Peak = 0:** never deposited → **"—"**.

### 5.3 New — income (no behaviour change; coverage)
- **Reinvested then fully sold at cost:** buy 1@100, reinvested dividend 0.05u@100
  (income +$5), sell 1.05u@100 (out) → realized **$0**, income **+$5**, total **+$5**
  (no double-count).
- **Income then withdrawn:** $100 cash, +$5 interest (cash), withdraw $5 → income
  +$5, peak $100, total **+$5 / +5%**.
- **Income on a loser:** buy 1@100, +$5 cash dividend, price → $80 → income +$5,
  unrealized −$20, total **−$15**.

### 5.4 New — fees
- **Fee on a buy (held):** buy 1@100 + $2 fee, price $120 → cost basis $102,
  unrealized **+$18**, peak $102 → **+17.65%**.
- **Fee on a sell:** buy 1@100, sell 1@150 − $3 fee (out) → realized **+$47**, peak
  $100 → **+47%**.

### 5.5 New — FIFO ordering
- Buy 1@100, buy 1@200, sell 1@250 (out) → FIFO consumes the $100 lot → realized
  **+$150**, remaining lot $200 → unrealized **+$50**, peak $300 → **+66.67%**.
  (Average-cost would split 100/100; this pins FIFO order.)

### 5.6 New — asset-native currency + FX (BIST in TRY)
- Buy 10 units @ ₺100 (₺1000) at USD/TRY = 25 → cost **$40**. Later price ₺150,
  USD/TRY = 30 → value **$50**. unrealized **+$10**, peak $40 → **+25%**. (₺ gain
  +50%; USD gain +25% — TRY depreciation eats the rest. Exercises
  `assetNativeCurrency` + `normalizeToUsd` at tx date vs now.)

### 5.7 New — daily P&L
- **Baseline by date:** snapshots for D−1 ($100) exist, none yet for today; current
  $105 → baseline picks D−1 → daily **+$5** (old `length-2` would mis-pick).
- **Gap:** last snapshot D−3 ($100), current $108 → daily **+$8** shown anyway.
- **Income-neutral within period:** prev $100, +$5 interest in period, current $105 →
  daily **+$5 / +5%** (retains old Case 3).
- **Turkey-local boundary:** tx at 2026-06-05 23:30 Turkey (20:30 UTC) buckets to
  the 06-05 local day for both baseline and period, not a UTC-shifted day.

### 5.8 Out of scope — standalone fee (known-failing)
A standalone `fee`-type tx double-counts: `balance.ts` drops value by the fee **and**
`performance.ts` adds it to net invested, so a $5 fee cuts total P&L by **$10**, and
the FIFO `fee` branch (off `amount`) breaks reconciliation. Zero occurrences today.
Write a case with the **correct** numbers (a $5 fee → total **−$5**, reconciling) and
mark it **`it.fails(...)`** in Vitest so it is captured and guards a future fix
without blocking. Fixing requires a recording-model decision (does the fee touch a
cash balance, or is it a pure ledger hit?).

## 6. Test wiring (Vitest)

- **Runner:** Vitest (Vite-native, Jest-compatible, near-zero config). Scope: the
  pure P&L engine (`src/lib/pnl/*`, `src/lib/performance.ts`, and the new peak helper)
  plus the daily-return baseline selection. No component/DOM tests in this pass.
- **Shape:** each case is one `it(...)` asserting net invested, value, the three
  decomposition terms, Total P&L $ / %, **and** the reconciliation invariant
  (`±$0.01`). A small fixture builder constructs `Transaction[]` / `ExchangeRate[]` /
  `Snapshot[]` so cases read like the doc.
- **Reconciliation as a shared assertion** reused across every case, mirroring the
  `usePnL` dev assert.
- **Scripts:** add `test` / `test:watch`; `tsc --noEmit`, `eslint`, `npm run build`
  stay green.
- Updates `project_decisions` memory (the "no testing" note) — testing is now adopted
  for the P&L engine specifically.

## 7. Verification
- `tsc --noEmit`, `eslint`, `npm run build`, `npm test` all green (the standalone-fee
  case is the only `it.fails`, which counts as pass).
- Every non-`fails` case satisfies the reconciliation invariant.
- Manual prod spot-check after deploy: Total P&L % on a hold-only view is unchanged;
  the daily figure picks yesterday as baseline before today's snapshot is written.

## 8. Out of scope (unchanged from prior specs)
- Standalone/in-kind `fee` double-count (§5.8 — captured, not fixed).
- Performance **page** (the FIFO-sum all-time return there) — user-scoped-out.
- Per-category income attribution beyond per-asset.
- Component/UI tests.
