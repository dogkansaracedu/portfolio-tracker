# P&L Methodology — Money-Weighted, USD-Anchored

Status: canonical reference (living doc)

The conceptual reference for **how P&L is defined and why**. Worked numeric cases
that pin the behaviour live in [pnl-test-cases.md](pnl-test-cases.md) (run as Vitest,
`npm test`); the component contract is
[components/06-pnl-engine.md](components/06-pnl-engine.md).

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

**One engine, one definition.** All of the above is one pure function,
`computePortfolioPnL` (`src/lib/pnl/portfolio.ts`); `usePnL` is a thin wrapper over it,
so the Dashboard and Portfolio share a single definition and cannot diverge. The
headline, the per-asset breakdown, and the chart's "now" anchor all read the same
money-weighted figure — including fiat FX P&L, which a FIFO-only sum would throw away.
(The Performance page is the lone exception — see §5.)

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

Withdrawal example: buy $30k → buy $20k (peak $50k) → withdraw $25k (current net
invested $25k, peak still **$50k**). Value $26k → Total P&L $ = 26 − 25 = **+$1k**;
% = 1 ÷ 50 = **+2%**.

## 3. Return metrics — which number answers which question

There is no single "correct" return %. Three distinct questions get three distinct
metrics, and each is surfaced in its own view — **one graph never mixes two of them**:

| Question | Metric | Where it lives | On a withdrawal |
|---|---|---|---|
| "Did I beat the index?" | **TWR** (mine vs the index's) | Dashboard hero, vs-market view (the default) — `computeTWRSeries` | Invisible — by design |
| "How much did I grow from *investing*, not from adding cash?" | **Simple ROI** = Total P&L $ ÷ peak net invested (§1–§2) | The engine headline: Dashboard + Portfolio | $ preserved, % stable (peak can't shrink) |
| "What % did each of my dollars earn?" | **Modified Dietz** (money-weighted rate) | Performance page monthly returns — `computeMonthlyReturns` / `subPeriodReturn` | Negative weighted flow → lower average capital; the rate stays honest |

**XIRR** — the annualized version of the Modified-Dietz question — is **deferred**; it
is not built. A portfolio-level *windowed* Modified-Dietz rate ("my money's rate over
this range") is likewise not built; it would reuse `subPeriodReturn`.

### The metrics, precisely

Worked on one example — **$1,000/month for 12 months ($12,000 in), the asset compounds
to +25% over the year → ends ≈ $13,570, gain ≈ $1,570**:

| Metric | Formula | Value | Accounts for… |
|---|---|---|---|
| **Simple ROI** | gain ÷ money in | **13%** | dollars only (ignores time) |
| **Modified Dietz** | gain ÷ time-weighted average capital | **24%** | dollars + time (linear weight) |
| **XIRR** | rate `r` solving NPV = 0 | **25%/yr** | dollars + time + compounding/annualized |
| **TWR** | chain `(1 + r_subperiod)` | n/a here | nothing about cash flows — pure price path |

- The $12k averaged only **~half a year invested** (January's dollar worked 12 months,
  December's worked 1). A 13% total gain over ~½ year annualizes to ~25%/yr — **same
  performance, different lens.**
- **Simple ROI** is not a rate and not annualized: "how much I'm up on what I put in."
  A regular monthly contributor sees it **understate** them (it divides by money that
  barely had time to work).
- **Modified Dietz** is XIRR's simpler cousin: money-weighted, **not** annualized,
  linear time weight, and it needs only start/end value + dated flows (**no daily
  snapshots**). Second example: start $50k, add $10k spread through the year (weight
  ≈ 0.5); the $50k earns 10% and the $10k earns 20% → gain $7k;
  `R = 7,000 ÷ (50,000 + 10,000 × 0.5) = ` **12.7%** — correctly below the naive 15%
  average, and above the Simple ROI of 7,000 ÷ 60,000 = 11.7%.
- **XIRR** is money-weighted **and** annualized — the standard brokerage "personal rate
  of return." Annualization can look inflated over short or heavy-DCA windows.
- **TWR** removes cash-flow timing entirely and chains per-period returns. **It is the
  basis indices quote their returns on**, which is why it is the benchmark comparison.

### The apples-to-oranges trap (why index comparison uses TWR)

- "SPY +25% this year" is a **buy-and-hold-from-Jan-1 (TWR)** number. You never had all
  your money in on Jan 1.
- Fed your real monthly contributions, SPY would also hand you ~13% (the same
  dollar-cost-averaging drag).
- **Fair fight = same basis on both sides.** Either my-TWR vs index-TWR, or
  my-same-cash-flow vs index-same-cash-flow. **Never** my-DCA-13% vs
  index-headline-25%. The dashboard hero does the former: portfolio TWR and index
  return, both rebased to 0% at the window start, headline = portfolio TWR %, subtitle
  = the gap in percentage points.

### Why the headline is money-weighted

Against a second example — **Y1:** $20k → $25k (+25%, +$5k) then cash out; **Y2:**
fresh $2k → $3k (+50%, +$1k); total money added **+$6,000**:

| Method | This example | Answers | Who uses it |
|---|---|---|---|
| **Time-Weighted (TWR)** | **+87.5%** (1.25 × 1.50 − 1) | "How good were my *decisions*?" — blind to how much money was in | Funds, indices, managers (GIPS standard) |
| **Money-Weighted (MWR / XIRR)** | **≈ +26.8%/yr** | "What did *my actual dollars* earn?" — weighted by size & timing | Brokerages ("personal rate of return"), spreadsheet `XIRR()` |
| **Simple ROI** | **+30%** (6k ÷ 20k peak) | "How much did I add on top, total?" — non-annualized | Casual trackers (this app's headline) |

The app's own goal — **"how much money I added on top of my original money"** — is
**money-weighted by definition**: dollars matter, so a great-but-tiny year (the +50% on
only $2k = +$1k) *should* barely move the number. That's why ~30% and **+$6,000** fit
the goal, while +87.5% answers the benchmark question instead. **The dollars are the
truth; the % is a lens.**

### Caveats

- **TWR needs a clean, gap-free daily snapshot series** — far more data-hungry than
  Modified Dietz / Simple ROI, which only need dated cash flows. A window whose
  flow-bearing periods span more than a day is flagged `approximate`.
- The index side must be a **total return** (dividend-adjusted close) for fairness;
  Yahoo `adjclose` provides this.

## 4. Period vs all-time ("this year" vs lifetime)

The peak % is an **all-time** number — cumulative, it doesn't reset when you cash out.
In the Y1/Y2 example above the all-time % after re-entry is ~30% (the full $6k against
the $20k lifetime peak). That is **not** "this year": Y2 on its own is +50%.

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
separately (see §6 for the not-yet-built YTD return).

## 5. Known issues / out of scope

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

## 6. Future ideas (not yet built)

- **Period / YTD money-weighted return** ("this year", §4) — the highest-value
  addition; resets per period so a re-entry isn't diluted. Then **XIRR** (annualized
  personal rate of return, §3).
- **Windowed Modified-Dietz rate** — "what each of my dollars earned over this range",
  reusing `subPeriodReturn`.
- **USD-inflation-adjusted (real) returns** — deflate each invested dollar by US CPI
  before the `value − invested` subtraction, shown alongside nominal.

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
| Time-weighted return (vs index) | `computeTWRSeries`, `subPeriodReturn` | `src/lib/performance.ts` |
| Modified-Dietz monthly returns | `computeMonthlyReturns` | `src/lib/performance.ts` |
| Wiring + reconciliation assert | `usePnL` (thin wrapper) | `src/hooks/usePnL.ts` |

## References
- [pnl-test-cases.md](pnl-test-cases.md) — worked numeric cases, run as Vitest.
- [components/06-pnl-engine.md](components/06-pnl-engine.md) — the component contract.
- [components/GLOSSARY.md](components/GLOSSARY.md) — shared terms and canonical formulas.
- GIPS (Global Investment Performance Standards) — TWR. · XIRR — spreadsheet
  money-weighted IRR.
