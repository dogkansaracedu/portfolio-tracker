# Design Spec — "vs Market": Time-Weighted Return vs an Index

Date: 2026-06-14 · Status: design (pre-implementation) · Scope: single feature

Conceptual background: [docs/return-metrics.md](../../return-metrics.md) and
[docs/pnl-methodology.md](../../pnl-methodology.md). This spec covers **metric #1**
from that discussion — comparing the user's investing performance against an index
fund on a like-for-like basis.

## Goal

Answer one question on the dashboard: **"Are my picks beating the S&P 500?"**

Compare the portfolio's **time-weighted return (TWR)** against the chosen index's
return over the **same window**, and surface the gap (e.g. `You +8% · S&P 500 +25%
· −17 pts`). TWR is the correct basis because the index's quoted return is itself a
TWR, and TWR strips out *when* the user added money (not a stock-picking decision),
isolating selection + allocation skill.

### Default return metric (revised 2026-06-14)

**TWR becomes the default portfolio return metric on the dashboard.** The dashboard's
P&L view — its headline return figure and its chart — switches from the money-weighted
peak-ROI %/$ line to **TWR vs the index**, and that view is the default.

Scope of this change (deliberate boundaries):
- Applies to the **portfolio-level dashboard headline + chart** only. **Per-asset rows
  (Portfolio page) stay money-weighted / FIFO** — TWR is a portfolio-level metric (it
  needs the whole-portfolio value path); there is no meaningful per-asset TWR here.
- The money-weighted **engine** (`computePortfolioPnL`) is **unchanged**. It still
  produces the dollar **Total P&L** (value − net invested), still powers the Portfolio
  page, the after-tax overlay, and the reconciliation invariant. We change what the
  dashboard *defaults to showing*, not the engine.
- **Dollars are preserved.** Portfolio **value $** and **Total P&L $** stay as headline
  stats (the dollars are the truth; TWR is a %, not a dollar amount). The money-weighted
  **%** (peak ROI) stays accessible as a secondary figure / on the Portfolio page — it is
  simply no longer the dashboard default.

## Non-goals (explicitly out of scope)

- **XIRR** (annualized money-weighted rate) — optional future addition.
- **Metric #3** (windowed Modified-Dietz per-dollar rate) — separate spec.
- **Same-cash-flow simulation** ("if my exact contributions went into SPY") — a
  different, money-weighted comparison; not this one.
- **A new dedicated page/view** — this **replaces** the existing dashboard P&L view
  in place (no new page).
- **Touching the money-weighted engine or per-asset P&L** — the engine and Portfolio
  page stay as-is; only the dashboard's default return view changes.
- **Backfilling snapshots to daily** — we use the snapshots that exist (see Exactness).

## Definitions (recap)

- **Portfolio TWR (window)** = geometric chain of per-sub-period returns,
  `∏(1 + r_period) − 1`, with external cash flows removed from each period. Each
  period's return is value-weighted across holdings automatically, because it is
  computed from the **snapshot total** (`total_usd`), which already sums every asset
  at market value. See [GLOSSARY: TWR] (to be added).
- **Index TWR (window)** = `close_end / close_start − 1` over the same date range,
  using the **dividend-adjusted** close (total return). An index has no external
  flows, so its TWR = its simple growth = the number people quote ("S&P +25%").
- **Gap** = `portfolioTWR − indexTWR`, in percentage points.

## Approach

### Portfolio TWR — reuse, don't reinvent

`computeMonthlyReturns` (`src/lib/performance.ts`) already computes a per-consecutive-
snapshot **Modified Dietz** return, classifying internal vs external flows
(`externalCashFlowUsd` + `collectPairedParentIds`) and time-weighting flows within the
period. TWR is just **geometrically linking those per-period returns.**

To avoid duplicating that per-period math, **extract a shared helper**:

```
subPeriodReturn(prevSnap, currSnap, sortedTxs, rates, internalParentIds)
  → { returnFraction: BigNumber | null,   // numer/denom (Modified Dietz); null when base ≤ 0
      hadExternalFlow: boolean,            // any external flow landed in this period
      spanDays: number }
```

- `computeMonthlyReturns` is refactored to call it (behaviour unchanged — same numbers).
- New `computeTWRSeries(snapshots, transactions, rates)` walks consecutive snapshots,
  calls `subPeriodReturn`, and maintains a running factor:
  `factor *= (1 + returnFraction)` for each period with a valid `returnFraction`
  (periods with `null` base — degenerate ~empty portfolio, only at the very start —
  carry the factor unchanged). It returns, per snapshot date, the **cumulative TWR %**
  = `(factor − 1) × 100`, naturally **0% at the window's first point** and growing.

The window is applied with the existing `filterByTimeRange`, so the TWR series and the
index series cover the identical date range (and rebase to 0% at the same left edge).

### Index TWR — already on the chart

The existing benchmark overlay in `useDashboardHero` already computes the index's
cumulative `close/base − 1` over the chart's window (via `closesAtOrBefore` against
`benchmark_prices`, keyed off `useBenchmark(ticker)`). That **is** the index TWR. We
keep it; we only need its endpoint for the gap. **Already fair:** `fetch-benchmark-history`
stores Yahoo's `adjclose` (dividend + split adjusted) into `benchmark_prices.close_usd`
— a total-return benchmark — so no fetcher change is needed.

### "Approximate" flag (the weekly-snapshot honesty marker)

Snapshots are **daily within the last 30 days, ~weekly before that.** TWR accuracy is
unaffected by spacing *except* for a sub-period that both spans more than a day **and**
contains an external cash flow (there, Modified Dietz approximates instead of
revaluing at the flow). So:

```
windowIsApproximate = any sub-period in the window has hadExternalFlow && spanDays > 1
```

When true, the UI shows an unobtrusive **"approximate"** marker with a tooltip ("older
history is weekly-sampled; links containing a deposit/withdrawal are estimated").
Routine monthly contributions → sub-percent error; large one-off flows (e.g. a big
withdrawal) in the weekly era are where it matters most.

## Components / files

| File | Change |
|---|---|
| `src/lib/performance.ts` | Extract `subPeriodReturn`; refactor `computeMonthlyReturns` onto it (no behaviour change); add `computeTWRSeries`. |
| `src/hooks/useDashboardHero.ts` | In P&L mode, compute the portfolio TWR series; add `twrPct` to each `HeroPoint`; expose `twrEnd`, `benchmarkEnd`, `gapPts`, `approximate`. |
| `src/components/dashboard/DashboardHero.tsx` | Render the portfolio-TWR line on the right axis next to the existing index line; add the gap readout + explainer subtitle + "approximate" badge. |
| Reused as-is | `benchmark_prices`, `useBenchmark`, `closesAtOrBefore`, `filterByTimeRange`, `externalCashFlowUsd`, `collectPairedParentIds`, `BENCHMARKS`/`findBenchmark`. |

## UI / display

The dashboard **P&L view is now the default** and is TWR-based:

- **Chart:** a clean two-line **% race** — **your TWR** vs the **index TWR**, both
  rebased to **0% at the window start**, on a **single % axis**. (Replacing rather than
  overlaying removes the earlier mixed-basis problem: no money-weighted $ line shares
  the plot, so both lines are the same TWR basis — directly comparable. This is *cleaner*
  than the add-a-line version.)
- **Headline:** portfolio **value $** and **Total P&L $** as the dollar stats (the
  truth), plus **TWR %** as the default return figure and the gap readout
  `You {twrEnd}% · {benchmark.label} {benchmarkEnd}% · {gapPts} pts` (canonical palette
  via `gainLossClass` / `formatSignedPercent` — see lib/prices).
- **Explainer subtitle:** "Growth vs market — time-weighted, deposits/withdrawals removed."
- **"Approximate" badge** when `windowIsApproximate`.
- **Secondary access:** the money-weighted return % (peak ROI) stays reachable
  (Portfolio page / a secondary stat), just not the dashboard default.

**Value view** is unchanged (portfolio value $ + cost-basis line).

## Edge cases / error handling

- **Base ≤ 0 period** (`denom ≤ 0`): `returnFraction = null`, factor carried unchanged;
  never breaks the chain or emits NaN. (Mirrors the existing `denom ≤ 0` guard.)
- **No benchmark series / benchmark still loading:** portfolio TWR line + "You +X%"
  still render; index side shows "—" until loaded (no 0% blip in the gap).
- **Window with < 2 snapshots:** TWR = 0% (single point); gap shows portfolio "—".
- **Synthetic zero-anchor** (the pre-first-tx point useDashboardHero prepends): excluded
  from the TWR chain (it is not a real valuation); TWR starts at the first real snapshot.
- **Standalone `fee` tx:** inherits the known reconciliation caveat from
  pnl-methodology §6 (zero occurrences today); not special-cased here.

## Testing (Vitest, alongside `pnl-test-cases.md`)

- **Chaining:** two flow-free periods of +20% then −10% → TWR = +8% exactly.
- **Flow removal:** a deposit mid-window must not register as a gain — TWR over a
  flat-price window with a mid-window deposit ≈ 0%.
- **Value-weighting:** $5k @ +50% and $20k @ +10% in one period → period return +18%.
- **Weight change after withdrawal:** two periods with a withdrawal between them that
  changes weights → chained TWR matches the hand-computed value; withdrawal itself
  contributes no gain/loss.
- **Approximate flag:** a >1-day period containing a flow sets `windowIsApproximate`;
  a daily window with flows does not.
- **`computeMonthlyReturns` regression:** identical outputs before/after the
  `subPeriodReturn` extraction.
- **Index ratio:** `close_end/close_start − 1` over a window matches the overlay.

## Data-quality limitations (carried into the UI, not hidden)

- Older history is **weekly-sampled** → flow-containing weeks are Modified-Dietz
  approximations (a fraction of a percent for routine contributions; up to ~1%+ on a
  large one-off flow in a volatile week). Surfaced via the "approximate" badge.
- The **ALL** window inherits any snapshot gaps (the June backfill incident); shorter
  recent windows are clean. The badge covers this too.

## Docs to update on implementation (per CLAUDE.md)

- `docs/return-metrics.md` — mark TWR-vs-index as shipped (was "designing next").
- `docs/components/07-dashboard.md` (+ technical) — the new overlay line + gap readout.
- `docs/components/06-pnl-engine.md` (+ technical) — `subPeriodReturn` / `computeTWRSeries`.
- `docs/components/GLOSSARY.md` — define **Time-Weighted Return (TWR)**.
- `docs/pnl-test-cases.md` — the new TWR cases.
