# P&L Methodology — Money-Weighted, USD-Anchored

Date: 2026-06-07 · Status: canonical reference (living doc)

The conceptual reference for **how P&L is defined and why**. Worked numeric cases
that pin the behaviour live in [pnl-test-cases.md](pnl-test-cases.md) (run as Vitest,
`npm test`); the component contract is
[components/06-pnl-engine.md](components/06-pnl-engine.md). Scaling is out of scope
here — see [pnl-engine-scaling-upgrade-path.md](pnl-engine-scaling-upgrade-path.md).

## 1. The canonical total (the $)

**Total P&L = current value − net invested capital, in USD.**

- **Money-weighted.** Every dollar of value today vs. every dollar actually deployed.
  Deposits/withdrawals and the cash legs of trades net out (a sell and its paired
  `cash_credit` cancel), so the number reflects *gains*, not *cash moving in and out*.
- **Nominal in the asset's own currency, real in USD.** A holding is tracked at its
  native quantity (₺182,284 stays ₺182,284), but P&L is always measured against the
  **USD anchor**. So FX moves on fiat cash are real P&L: euros worth more USD than the
  USD you spent on them is a gain, even though the euro count didn't change.

Computed in `summarizePnLTotals` (`src/lib/pnl/totals.ts`) as
`totalCurrentValueUsd − totalInvestedUsd`, where `totalInvestedUsd` comes from
`computeCurrentInvestedUsd` (`src/lib/performance.ts`). `realized` (FIFO) and
`unrealized` are **sub-views** of this total (`unrealized = total − realized`); fiat
holdings carry their FX gain as unrealized (cost basis = net USD deployed into that
currency, so `value − cost basis` is the FX swing).

**One engine.** All of the above is one pure function, `computePortfolioPnL`
(`src/lib/pnl/portfolio.ts`); `usePnL` is a thin wrapper over it, so the Dashboard and
Portfolio share a single definition and cannot diverge. (The Performance page is the
lone exception — see §6.)

## 2. The return % — over peak net invested

```
Total P&L % = Total P&L ÷ peak net invested × 100      (— when peak ≤ 0)
```

The **%** is taken over **peak net invested** — the running maximum of the net-invested
ledger (`computePeakInvestedUsd`), "the most external capital ever at work at once" —
**not** the current balance. (The **$** still uses current net invested; only the **%**
uses peak.) Renders "—" when peak ≤ 0 (nothing ever deployed).

**Why peak:** *withdrawing your own money must not change your return %.* The current
balance shrinks on withdrawal, which would inflate the % (and blow it up toward
infinity as the balance nears zero, or flip it negative). Peak doesn't shrink, so the
% stays stable — and a sale reads the same whether its proceeds are withdrawn or kept
as cash on-platform. For a book that only ever adds capital, peak = current, so the %
is the ordinary "gain ÷ what I put in."

## 3. Best practice: time-weighted vs money-weighted

There is no single "correct" return %; the sector uses two standards plus a simple
total. Worked against the same example — **Y1:** $20k → $25k (+25%, +$5k) then cash
out; **Y2:** fresh $2k → $3k (+50%, +$1k); **total money added = +$6,000**:

| Method | This example | Answers | Who uses it |
|---|---|---|---|
| **Time-Weighted (TWR)** | **+87.5%** (1.25 × 1.50 − 1) | "How good were my *decisions*?" — blind to how much money was in | Funds, indices, managers (GIPS standard) |
| **Money-Weighted (MWR / XIRR)** | **≈ +26.8%/yr** | "What did *my actual dollars* earn?" — weighted by size & timing | Brokerages ("personal rate of return"), spreadsheet `XIRR()` |
| **Simple ROI** | **+30%** (6k ÷ 20k peak) | "How much did I add on top, total?" — non-annualized | Casual trackers (this app's headline) |

The app's goal — **"how much money I added on top of my original money"** — is
**money-weighted by definition**: dollars matter, so a great-but-tiny year (the +50%
on only $2k = +$1k) *should* barely move the number. That's why ~30% (money-weighted)
and **+$6,000** fit the goal, while +87.5% (TWR) answers a different question. **The
dollars are the truth; the % is a lens.** So the app leads with **$** and a simple
**money-weighted % (peak)**; TWR/XIRR are candidate *secondary* metrics (§7).

## 4. Period vs all-time ("this year" vs lifetime)

The peak % is an **all-time** number — cumulative, it doesn't reset when you cash out.
In the example above the all-time % after re-entry is ~30% (the full $6k against the
$20k lifetime peak). That is **not** "this year": Y2 on its own is +50%.

"This year / this period" is a **windowed money-weighted return**, measured against the
capital at work *during the window*:

```
period return % = (end − start − deployed_this_period) / (start + deployed_this_period)
                = (3k − 0 − 2k) / (0 + 2k) = +50%
```

After a full cash-out the window starts at ~0, so only the fresh $2k counts — exactly
the "relative to the money in the system now" view. This is the same money-weighted
formula the **daily return** uses (`computeDailyReturn`), generalized to a period.
**Don't overload one number** to be both all-time and per-period — surface them
separately (see §7 for the not-yet-built YTD return).

## 5. The bug this resolved (2026-06-03) — one definition everywhere

The dashboard's P&L chart once mixed **two P&L formulas**: historical points used
money-weighted `snapshot_value − net_invested`, while the live "now" point and the
headline used the FIFO sum `unrealized + realized`. These disagree whenever fiat FX is
non-trivial, because FIFO treated all fiat as zero-P&L — throwing away FX gains on
EUR/TRY cash. The gap was ~$915 (a real +$902 EUR gain minus −$95 TRY drift), which
leaked into the period delta and mislabeled a −$335 day as −$1,250.

**Fix:** one definition everywhere — money-weighted, fiat carries FX P&L — so the
headline, the per-asset breakdown, and the chart's "now" anchor all agree. Later
consolidated into the single `computePortfolioPnL` engine (§1).

## 6. Known issues / out of scope

- **Standalone `fee` double-count.** A standalone `fee`-type tx both drops value and
  adds to net invested, so a $5 fee cuts total P&L by $10 and breaks reconciliation.
  **Zero occurrences** today (every real fee rides on a buy/sell, which is correct);
  captured as a known-failing `it.fails` tripwire in `pnl-test-cases.md` (Case 21).
- **Category attribution drops sold-out positions.** `computeCategoryAttribution`
  sums only currently-held assets, so a fully-sold position's realized P&L is absent
  from the per-category breakdown (Performance page). Understates; not wired to the
  money-weighted headline.
- **Performance page** computes its own all-time return as the FIFO sum
  (`unrealized + realized`), diverging from the money-weighted headline whenever fiat
  FX or the above bite. **Parked by decision** — the single-engine consolidation
  covers the Dashboard + Portfolio, not the Performance page.

## 7. Future ideas (not yet built)

- **Period / YTD money-weighted return** ("this year", §4) — the highest-value
  addition; resets per period so a re-entry isn't diluted. Then **XIRR** (annualized
  personal rate of return), and optionally **TWR** for benchmark comparison. TWR/XIRR
  need a clean, gap-free snapshot series first.
- **USD-inflation-adjusted (real) returns** — deflate each invested dollar by US CPI
  before the `value − invested` subtraction, shown alongside nominal.

*(Done since first draft: **dividend/interest income** is now recognized as income —
neutral to net invested, a gain equal to the amount received. See `computeIncomeUsd`
and `pnl-test-cases.md`.)*

## Engine reference

| Concern | Function | File |
|---|---|---|
| **Engine (one pure function)** | `computePortfolioPnL` | `src/lib/pnl/portfolio.ts` |
| Canonical total + % | `summarizePnLTotals` | `src/lib/pnl/totals.ts` |
| Net invested / peak | `computeCurrentInvestedUsd` / `computePeakInvestedUsd` | `src/lib/performance.ts` |
| FIFO cost basis & realized | `computeFIFOLots`, `buildRealizedByTx` | `src/lib/pnl/fifo.ts`, `realized.ts` |
| Unrealized | `computeUnrealizedPnL` | `src/lib/pnl/unrealized.ts` |
| Income (dividend/interest) | `computeIncomeUsd` | `src/lib/pnl/income.ts` |
| Period / daily return + baseline | `computeDailyReturn`, `buildDailyReturnLookups` | `src/lib/pnl/daily.ts`, `src/lib/portfolio/grouping.ts` |
| Wiring + reconciliation assert | `usePnL` (thin wrapper) | `src/hooks/usePnL.ts` |

## References
- [pnl-test-cases.md](pnl-test-cases.md) — worked numeric cases, run as Vitest.
- [components/06-pnl-engine.md](components/06-pnl-engine.md) — the component contract.
- GIPS (Global Investment Performance Standards) — TWR. · XIRR — spreadsheet
  money-weighted IRR.
