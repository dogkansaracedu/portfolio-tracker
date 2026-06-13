# TWR "vs Market" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make **time-weighted return (TWR) vs an index** the default dashboard return view — the P&L chart becomes a clean "your TWR vs the S&P" % race with a gap readout, dollars preserved as headline stats.

**Architecture:** Reuse the per-snapshot Modified-Dietz return logic already inside `computeMonthlyReturns` by extracting a shared `subPeriodReturn` helper, then geometrically link those per-period returns into a cumulative TWR series (`computeTWRSeries`). The dashboard hero renders the portfolio TWR line against the existing index line (both rebased to 0% at window start) on a single % axis. The money-weighted engine (`computePortfolioPnL`) and per-asset/Portfolio-page figures are untouched.

**Tech Stack:** TypeScript, bignumber.js (all money/return math), Vitest (engine tests, `npm test`), React 19 + Recharts (dashboard), Supabase (`benchmark_prices`, already populated with `adjclose`).

**Spec:** `docs/superpowers/specs/2026-06-14-twr-vs-market-design.md`

---

## File structure

| File | Responsibility | Change |
|---|---|---|
| `src/lib/performance.ts` | Pure return math | Extract `subPeriodReturn`; refactor `computeMonthlyReturns` onto it; add `computeTWRSeries` |
| `src/lib/twr.test.ts` | TWR engine tests | Create |
| `src/hooks/useDashboardHero.ts` | Dashboard chart data | Add `twrPct` to `HeroPoint`; compute the windowed TWR series; expose `twrEnd`/`benchmarkEnd`/`gapPts`/`approximate` |
| `src/components/dashboard/DashboardHero.tsx` | Dashboard hero UI | Default to P&L view; render the portfolio-TWR line + gap readout + "approximate" badge |
| `docs/components/06-pnl-engine.md` (+ `technical/`) | P&L behavioral/technical docs | Document TWR |
| `docs/components/07-dashboard.md` (+ `technical/`) | Dashboard docs | Document the new default view |
| `docs/components/GLOSSARY.md` | Domain terms | Define TWR |
| `docs/return-metrics.md` | Decision reference | Mark TWR shipped |
| `docs/pnl-test-cases.md` | Worked cases | Add the TWR cases |

---

## Task 1: Extract `subPeriodReturn`, refactor `computeMonthlyReturns`

**Files:**
- Modify: `src/lib/performance.ts` (the `computeMonthlyReturns` function, ~line 230–288)
- Test: `src/lib/twr.test.ts` (create)

- [ ] **Step 1: Write the regression test pinning `computeMonthlyReturns`**

Create `src/lib/twr.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { computeMonthlyReturns, computeTWRSeries } from "@/lib/performance"
import { snapshot, buy, sell } from "@/lib/pnl/test-fixtures"

describe("computeMonthlyReturns — unchanged after subPeriodReturn extraction", () => {
  it("returns +10% / +$100 for a flow-free 1000→1100 period", () => {
    const snaps = [
      snapshot("2026-01-01", [{ ticker: "BTC", value_usd: 1000 }]),
      snapshot("2026-02-01", [{ ticker: "BTC", value_usd: 1100 }]),
    ]
    const returns = computeMonthlyReturns(snaps, [], [])
    expect(returns).toHaveLength(1)
    expect(returns[0].returnPct).toBeCloseTo(10)
    expect(returns[0].returnUsd).toBeCloseTo(100)
    expect(returns[0].month).toBe("2026-02")
  })
})
```

- [ ] **Step 2: Run it to confirm it passes against the CURRENT code**

Run: `npm test -- twr`
Expected: PASS (baseline behaviour we must preserve). `computeTWRSeries` import will make the file fail to compile until Task 2 — so for THIS step, temporarily comment the `computeTWRSeries` import and its tests, run, confirm PASS, then restore.

- [ ] **Step 3: Add the `SubPeriodReturn` type + `subPeriodReturn` helper**

In `src/lib/performance.ts`, add above `computeMonthlyReturns`:

```ts
export interface SubPeriodReturn {
  /** Period Modified-Dietz return as a fraction (e.g. 0.1 = +10%); null when the
   *  capital base ≤ 0 (degenerate ~empty period). */
  returnFraction: ReturnType<typeof bn> | null
  /** Period gain in USD (numerator: vEnd − vStart − net external flow). */
  returnUsd: ReturnType<typeof bn>
  /** True if any external cash flow landed inside this period. */
  hadExternalFlow: boolean
  /** Calendar length of the period in days (≥ 1). */
  spanDays: number
}

const MS_PER_DAY = 24 * 60 * 60 * 1000

/**
 * Money-weighted (Modified Dietz) return for one snapshot-to-snapshot period,
 * with external cash flows removed and time-weighted within the period. Shared
 * by `computeMonthlyReturns` (labelled monthly returns) and `computeTWRSeries`
 * (geometric linking → TWR). Internal asset↔cash swaps are excluded via
 * `internalParentIds` (see `externalCashFlowUsd`).
 */
export function subPeriodReturn(
  prevSnap: Snapshot,
  currSnap: Snapshot,
  sortedTxs: Transaction[],
  rates: ExchangeRate[],
  internalParentIds: Set<string>,
): SubPeriodReturn {
  const vStart = bn(prevSnap.total_usd ?? 0)
  const vEnd = bn(currSnap.total_usd ?? 0)
  const periodStart = new Date(`${prevSnap.snapshot_date}T00:00:00Z`).getTime()
  const periodEnd = new Date(`${currSnap.snapshot_date}T00:00:00Z`).getTime()
  const spanDays = Math.max(1, (periodEnd - periodStart) / MS_PER_DAY)

  let netCashFlow = BN_ZERO
  let weightedCashFlow = BN_ZERO
  let hadExternalFlow = false
  for (const tx of sortedTxs) {
    const txDate = new Date(`${tx.date.slice(0, 10)}T00:00:00Z`).getTime()
    if (txDate <= periodStart || txDate > periodEnd) continue
    const c = externalCashFlowUsd(tx, rates, internalParentIds)
    if (c.isZero()) continue
    hadExternalFlow = true
    const t = (txDate - periodStart) / MS_PER_DAY
    const w = (spanDays - t) / spanDays
    netCashFlow = netCashFlow.plus(c)
    weightedCashFlow = weightedCashFlow.plus(c.times(w))
  }

  const denom = vStart.plus(weightedCashFlow)
  const numer = vEnd.minus(vStart).minus(netCashFlow)
  return {
    returnFraction: denom.isLessThanOrEqualTo(0) ? null : numer.div(denom),
    returnUsd: numer,
    hadExternalFlow,
    spanDays,
  }
}
```

Note: `Transaction` is already imported in this file; confirm it is (it is used by `externalCashFlowUsd`). If the local `MS_PER_DAY` const inside `computeMonthlyReturns` now duplicates the module-level one, delete the inner one.

- [ ] **Step 4: Refactor `computeMonthlyReturns` to call the helper**

Replace the body of the `for (let i = 1; i < snaps.length; i++)` loop in `computeMonthlyReturns` with:

```ts
  for (let i = 1; i < snaps.length; i++) {
    const prevSnap = snaps[i - 1]
    const currSnap = snaps[i]
    const sp = subPeriodReturn(
      prevSnap,
      currSnap,
      sortedTxs,
      rates,
      internalParentIds,
    )
    if (sp.returnFraction === null) continue
    returns.push({
      month: currSnap.snapshot_date.slice(0, 7),
      label: formatMonthLabel(currSnap.snapshot_date),
      returnPct: sp.returnFraction.times(BN_HUNDRED).toNumber(),
      returnUsd: sp.returnUsd.toNumber(),
    })
  }
```

Delete the now-dead local `vStart`/`vEnd`/`periodStart`/`periodEnd`/`totalDays`/`netCashFlow`/`weightedCashFlow`/`denom`/`numer` code and the inner `MS_PER_DAY`. Keep `const snaps = sortSnapshotsAsc(snapshots)`, `const sortedTxs = …`, and `const internalParentIds = collectPairedParentIds(transactions)` above the loop.

- [ ] **Step 5: Run the regression test to confirm unchanged behaviour**

Run: `npm test -- twr`
Expected: PASS (same +10% / +$100). Then run the full suite to catch any other consumer:
Run: `npm test`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/lib/performance.ts src/lib/twr.test.ts
git commit -m "refactor(pnl): extract subPeriodReturn from computeMonthlyReturns"
```

---

## Task 2: `computeTWRSeries` (geometric linking)

**Files:**
- Modify: `src/lib/performance.ts`
- Test: `src/lib/twr.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/twr.test.ts` (and restore the `computeTWRSeries` import from Task 1 Step 2):

```ts
describe("computeTWRSeries — geometric linking", () => {
  it("chains flow-free periods: +20% then −10% = +8%", () => {
    const snaps = [
      snapshot("2026-01-01", [{ ticker: "BTC", value_usd: 100 }]),
      snapshot("2026-01-02", [{ ticker: "BTC", value_usd: 120 }]),
      snapshot("2026-01-03", [{ ticker: "BTC", value_usd: 108 }]),
    ]
    const twr = computeTWRSeries(snaps, [], [])
    expect(twr.endPct).toBeCloseTo(8)
    expect(twr.points[0].cumulativePct).toBeCloseTo(0) // rebased at start
  })

  it("removes a mid-window deposit: flat prices → ~0%", () => {
    const snaps = [
      snapshot("2026-01-01", [{ ticker: "BTC", value_usd: 100 }]),
      snapshot("2026-01-08", [{ ticker: "BTC", value_usd: 150 }]),
    ]
    // $50 deposit (buy, no paired cash_debit → external inflow) mid-week
    const txs = [buy(1, 50, { asset_id: "btc", date: "2026-01-05" })]
    const twr = computeTWRSeries(snaps, txs, [])
    expect(twr.endPct).toBeCloseTo(0)
  })

  it("value-weights within a period via the snapshot total: +18%", () => {
    // gold +50% on $5k, stocks +10% on $20k → $25k → $29.5k
    const snaps = [
      snapshot("2026-01-01", [
        { ticker: "GOLD", value_usd: 5000 },
        { ticker: "STOCK", value_usd: 20000 },
      ]),
      snapshot("2026-01-02", [
        { ticker: "GOLD", value_usd: 7500 },
        { ticker: "STOCK", value_usd: 22000 },
      ]),
    ]
    const twr = computeTWRSeries(snaps, [], [])
    expect(twr.endPct).toBeCloseTo(18)
  })

  it("a withdrawal contributes no gain/loss; weights reset after it", () => {
    const snaps = [
      snapshot("2026-01-01", [
        { ticker: "GOLD", value_usd: 5000 },
        { ticker: "STOCK", value_usd: 20000 },
      ]), // 25000
      snapshot("2026-01-02", [
        { ticker: "GOLD", value_usd: 7500 },
        { ticker: "STOCK", value_usd: 22000 },
      ]), // 29500  (+18%)
      snapshot("2026-01-03", [
        { ticker: "GOLD", value_usd: 5000 },
        { ticker: "STOCK", value_usd: 5000 },
      ]), // 10000  (after withdrawing 19500; 0% market move)
      snapshot("2026-01-04", [
        { ticker: "GOLD", value_usd: 6000 },
        { ticker: "STOCK", value_usd: 5500 },
      ]), // 11500  (+15% on the new 10000 base)
    ]
    // withdraw $19,500 at the 01-03 boundary (sell, no cash_credit → external outflow)
    const txs = [sell(1, 19500, { date: "2026-01-03" })]
    const twr = computeTWRSeries(snaps, txs, [])
    // (1.18 × 1.00 × 1.15) − 1 = +35.7%
    expect(twr.endPct).toBeCloseTo(35.7, 1)
  })

  it("flags a window as approximate when a >1-day period contains a flow", () => {
    const weekly = [
      snapshot("2026-01-01", [{ ticker: "BTC", value_usd: 100 }]),
      snapshot("2026-01-08", [{ ticker: "BTC", value_usd: 160 }]),
    ]
    expect(
      computeTWRSeries(weekly, [buy(1, 50, { asset_id: "btc", date: "2026-01-05" })], [])
        .approximate,
    ).toBe(true)

    const daily = [
      snapshot("2026-01-01", [{ ticker: "BTC", value_usd: 100 }]),
      snapshot("2026-01-02", [{ ticker: "BTC", value_usd: 160 }]),
    ]
    expect(
      computeTWRSeries(daily, [buy(1, 50, { asset_id: "btc", date: "2026-01-02" })], [])
        .approximate,
    ).toBe(false)
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test -- twr`
Expected: FAIL with "computeTWRSeries is not a function" / not exported.

- [ ] **Step 3: Implement `computeTWRSeries`**

In `src/lib/performance.ts`, add (after `subPeriodReturn`):

```ts
export interface TWRPoint {
  date: string
  /** Cumulative TWR % since the window's first point (0 at that first point). */
  cumulativePct: number
}

export interface TWRSeries {
  points: TWRPoint[]
  /** Cumulative TWR % at the last point. */
  endPct: number
  /** True if any sub-period that contained an external flow spanned > 1 day
   *  (i.e. relied on non-daily snapshots — Modified-Dietz approximation). */
  approximate: boolean
}

/**
 * Portfolio time-weighted return (gold-standard, daily-valued where snapshots
 * are daily): geometrically link the per-snapshot money-weighted returns,
 * removing external cash flows at each boundary. Value-weighting across holdings
 * is automatic because each period reads the snapshot TOTAL. Rebased to 0% at
 * the window's first snapshot. See docs/return-metrics.md.
 */
export function computeTWRSeries(
  snapshots: Snapshot[],
  transactions: Transaction[],
  rates: ExchangeRate[],
): TWRSeries {
  const snaps = sortSnapshotsAsc(snapshots)
  if (snaps.length === 0) return { points: [], endPct: 0, approximate: false }

  const sortedTxs = [...transactions].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
  )
  const internalParentIds = collectPairedParentIds(transactions)

  let factor = bn(1)
  let approximate = false
  const points: TWRPoint[] = [
    { date: snaps[0].snapshot_date, cumulativePct: 0 },
  ]

  for (let i = 1; i < snaps.length; i++) {
    const sp = subPeriodReturn(
      snaps[i - 1],
      snaps[i],
      sortedTxs,
      rates,
      internalParentIds,
    )
    if (sp.returnFraction !== null) {
      factor = factor.times(bn(1).plus(sp.returnFraction))
    }
    if (sp.hadExternalFlow && sp.spanDays > 1) approximate = true
    points.push({
      date: snaps[i].snapshot_date,
      cumulativePct: factor.minus(1).times(BN_HUNDRED).toNumber(),
    })
  }

  return {
    points,
    endPct: factor.minus(1).times(BN_HUNDRED).toNumber(),
    approximate,
  }
}
```

- [ ] **Step 4: Run to verify all five pass**

Run: `npm test -- twr`
Expected: PASS (×6 incl. the Task 1 regression).

- [ ] **Step 5: Commit**

```bash
git add src/lib/performance.ts src/lib/twr.test.ts
git commit -m "feat(pnl): computeTWRSeries — geometric-linked time-weighted return"
```

---

## Task 3: Wire TWR into `useDashboardHero`

**Files:**
- Modify: `src/hooks/useDashboardHero.ts`

- [ ] **Step 1: Add `twrPct` to `HeroPoint` and TWR fields to `DashboardHeroData`**

In the `HeroPoint` interface, add after `benchmarkPct`:

```ts
  /** Cumulative portfolio TWR % since the window start (0 at the start anchor).
   *  Populated in P&L mode; 0 in value mode. */
  twrPct: number
```

In `DashboardHeroData`, add:

```ts
  /** P&L mode: cumulative portfolio TWR % at "now" (window end). */
  twrEnd: number
  /** P&L mode: cumulative index TWR % at "now" (= last point's benchmarkPct). */
  benchmarkEnd: number
  /** P&L mode: twrEnd − benchmarkEnd, in percentage points. */
  gapPts: number
  /** P&L mode: window relied on weekly snapshots with a flow → "approximate". */
  approximate: boolean
```

- [ ] **Step 2: Import `computeTWRSeries` and compute the windowed series**

Add `computeTWRSeries` to the existing `@/lib/performance` import. Inside the `useMemo`, after `chartData` is built and `benchmarkActive` overlay is filled (just before the `chartData[length-1].label = "Şimdi"` line), insert:

```ts
    // Portfolio TWR series, same window as the chart, extended to live "now".
    // computeTWRSeries only reads snapshot_date + total_usd, so a minimal "now"
    // snapshot suffices (mirrors the fakeSnapshots cast used above).
    let twrEnd = 0
    let approximate = false
    if (viewMode === "pnl") {
      const windowSnaps = filterByTimeRange(snapshots, timeRange)
      const nowSnaps = [
        ...windowSnaps,
        {
          snapshot_date: today,
          total_usd: currentValueUsd,
        } as unknown as Snapshot,
      ]
      const twr = computeTWRSeries(nowSnaps, transactions, rates)
      twrEnd = twr.endPct
      approximate = twr.approximate
      const twrByDate = new Map<string, number>()
      for (const p of twr.points) twrByDate.set(p.date, p.cumulativePct)
      // Carry-forward: synthetic pre-window anchor → 0; any chart date without a
      // TWR point inherits the last known cumulative %.
      let lastTwr = 0
      for (const point of chartData) {
        const v = twrByDate.get(point.date)
        if (v !== undefined) lastTwr = v
        point.twrPct = v ?? lastTwr
      }
    }
```

(`twrPct` defaults: when building each `chartData` point in the `.map`, add `twrPct: 0` next to `benchmarkPct: 0` so value mode and the initial fill are defined.)

- [ ] **Step 3: Expose the new fields in the return object**

In the `return { … }` at the end of the `useMemo`, add:

```ts
      twrEnd,
      benchmarkEnd: end?.benchmarkPct ?? 0,
      gapPts: twrEnd - (end?.benchmarkPct ?? 0),
      approximate,
```

Add the same four keys (zeros / `false`) to the early-return empty object at the top of the `useMemo`. Add `snapshots` to the `useMemo` dependency array if not already present (it is passed in; confirm it is listed — add it).

- [ ] **Step 4: Typecheck + build**

Run: `npm run build`
Expected: PASS (no TS errors; `noUnusedLocals` clean). Run `npm test` — still green (hook isn't unit-tested; this confirms no engine regressions).

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useDashboardHero.ts
git commit -m "feat(dashboard): expose portfolio TWR series + index gap from useDashboardHero"
```

---

## Task 4: Render TWR as the default P&L view in `DashboardHero.tsx`

**Files:**
- Modify: `src/components/dashboard/DashboardHero.tsx`

No local dev server in this project — visual verification happens on prod after push (commit → push → check live). Each step is still small and independently committable.

- [ ] **Step 1: Default the view to P&L (TWR) and bump the persisted key**

Change the persisted view-mode default so the new default applies even for users who previously persisted "value":

```ts
  const [viewMode, setViewMode] = usePersistedState<HeroViewMode>(
    "dashboardHero.viewMode.v2",
    "pnl",
  )
```

- [ ] **Step 2: Pull the new fields from the hook**

Add `twrEnd`, `benchmarkEnd`, `gapPts`, `approximate` to the destructure of `useDashboardHero({...})`.

- [ ] **Step 3: Make the P&L chart a single-axis % race (portfolio TWR vs index TWR)**

In the P&L branch, the secondary `<Area>` already plots `benchmarkPct` on the `compare` axis. Add a sibling `<Area>` for the portfolio TWR on the **same** axis, and switch the PRIMARY P&L `<Area>` so P&L mode plots `twrPct` (not the $ line) — both lines now share the right `%` axis, so the left `$` axis is no longer the comparison surface in P&L mode.

Replace the primary `<Area>` and the compare `<Area>` block with:

```tsx
                {viewMode === "pnl" ? (
                  <>
                    {/* Portfolio TWR (bold) */}
                    <Area
                      yAxisId="compare"
                      type="monotone"
                      dataKey="twrPct"
                      name="twr"
                      stroke={strokeColor}
                      fill="url(#hero-fill)"
                      strokeWidth={2}
                      isAnimationActive={false}
                    />
                    {/* Index TWR (de-emphasised reference) */}
                    <Area
                      yAxisId="compare"
                      type="monotone"
                      dataKey="benchmarkPct"
                      name="benchmark"
                      stroke="var(--muted-foreground)"
                      fill="transparent"
                      strokeWidth={1}
                      strokeOpacity={0.45}
                      isAnimationActive={false}
                    />
                  </>
                ) : (
                  <>
                    <Area
                      yAxisId="primary"
                      type="monotone"
                      dataKey={currency === "USD" ? "valueUsd" : "valueTry"}
                      name="primary"
                      stroke={strokeColor}
                      fill={fillColor}
                      strokeWidth={2}
                    />
                    <Area
                      yAxisId="primary"
                      type="monotone"
                      dataKey={currency === "USD" ? "compareUsd" : "compareTry"}
                      name="compare"
                      stroke="var(--muted-foreground)"
                      fill="transparent"
                      strokeWidth={1}
                      strokeOpacity={0.45}
                      strokeDasharray="4 4"
                      isAnimationActive={false}
                    />
                  </>
                )}
```

In P&L mode the right `%` axis is now the only one that matters; widen it and make the left axis percent too, OR simplest: keep the existing dual-axis calibration but feed both lines off `compare` (%). The `axisDomains` memo's `benchValuesInCurrency` math can stay (it bounds the % axis); also include `twrPct` in the bound:

```ts
    const twrValuesInCurrency = displayChartData.map(
      (p) => (p.twrPct / 100) * denom,
    )
    const pnlAllValues = [...pnlValues, ...benchValuesInCurrency, ...twrValuesInCurrency, 0]
```

- [ ] **Step 4: Headline = TWR % + gap, dollars preserved**

In the P&L headline block, change the big number to the TWR %, keep portfolio value and Total P&L $ as stats, and show the gap. Replace the P&L-mode headline `<p>` big number to use `formatSignedPercent(twrEnd, 2)` (colored by `gainLossClass(twrEnd > 0)`), and replace the subtitle row's benchmark dropdown trigger label with the gap:

```tsx
              <span>
                {activeBenchmark.label}{" "}
                <span className="font-medium text-foreground">
                  {formatSignedPercent(benchmarkEnd, 2)}
                </span>{" "}
                <span className={cn("font-medium", gainLossClass(gapPts > 0))}>
                  ({formatSignedPercent(gapPts, 1)} pts)
                </span>
              </span>
```

Keep the existing "Total {formatSignedCurrency(totalPnlUsdNow)}" stat (the dollars). Add the explainer subtitle under the big number:

```tsx
          <p className="text-xs text-muted-foreground">
            Growth vs market — time-weighted, deposits/withdrawals removed
            {approximate && (
              <span
                className="ml-1.5 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase"
                title="Older history is weekly-sampled; periods containing a deposit or withdrawal are estimated."
              >
                approximate
              </span>
            )}
          </p>
```

- [ ] **Step 5: Update the P&L tooltip to show TWR vs index (not $)**

In `renderPnlTooltip`, replace the Portfolio $/% rows so it reads the TWR and index values off the point:

```tsx
          <span className="text-muted-foreground">You (TWR)</span>
          <span className="text-right font-medium">
            {formatSignedPercent(point.twrPct, 2)}
          </span>
          <span className="text-muted-foreground">{activeBenchmark.label}</span>
          <span className="text-right font-medium">
            {formatSignedPercent(point.benchmarkPct, 2)}
          </span>
```

(Remove the now-unused `pnlVal` / `pnlPctVal` locals to satisfy `noUnusedLocals`.)

- [ ] **Step 6: Build, then push & verify on prod**

Run: `npm run build`
Expected: PASS. Then commit, push, and confirm on the live dashboard that the P&L tab is the default, shows the two-line % race + gap, and dollars still appear in the "Total" stat.

```bash
git add src/components/dashboard/DashboardHero.tsx
git commit -m "feat(dashboard): TWR vs index as default P&L view"
```

---

## Task 5: Docs

**Files:**
- Modify: `docs/components/06-pnl-engine.md`, `docs/components/technical/06-pnl-engine.md`
- Modify: `docs/components/07-dashboard.md`, `docs/components/technical/07-dashboard.md`
- Modify: `docs/components/GLOSSARY.md`, `docs/return-metrics.md`, `docs/pnl-test-cases.md`

- [ ] **Step 1: GLOSSARY — define TWR**

Add a `### Time-Weighted Return (TWR)` entry: "Geometric chain of per-period returns with external cash flows removed; the basis indices quote. `computeTWRSeries` (`src/lib/performance.ts`). Contrast money-weighted (Total P&L) and Simple ROI."

- [ ] **Step 2: 06-pnl-engine (behavioral + technical)**

Behavioral: add a "Time-weighted return" rule (stack-free) — what it is, that flows are removed, value-weighting is automatic, daily-where-available / weekly-approximate. Technical: name `subPeriodReturn`, `computeTWRSeries`, and the reuse from `computeMonthlyReturns`.

- [ ] **Step 3: 07-dashboard (behavioral + technical)**

Behavioral: the P&L view now defaults to **TWR vs an index** (the % race + gap), dollars preserved as stats; the "approximate" badge. Technical: the `useDashboardHero` `twrPct`/`twrEnd`/`gapPts`/`approximate` fields and the two-`<Area>` render in `DashboardHero.tsx`; note the `dashboardHero.viewMode.v2` key bump.

- [ ] **Step 4: return-metrics.md + pnl-test-cases.md**

In `return-metrics.md`, change the "Decisions → Index comparison → TWR (designing next)" wording to "shipped 2026-06-14". In `pnl-test-cases.md`, add the worked TWR cases mirroring `src/lib/twr.test.ts` (chaining +8%, flow-removal 0%, value-weighting +18%, withdrawal chain +35.7%).

- [ ] **Step 5: Commit**

```bash
git add docs/
git commit -m "docs: document TWR vs market (engine, dashboard, glossary, test cases)"
```

---

## Self-review

**Spec coverage:**
- TWR via linked per-period returns → Tasks 1–2. ✓
- Index = existing adjclose overlay, same window → reused in Task 3 (`benchmarkEnd`). ✓
- In-place replacement, default P&L view = TWR → Task 4 Steps 1, 3, 4. ✓
- Dollars preserved (value + Total P&L $) → Task 4 Step 4 (Total stat kept). ✓
- Single-axis % race → Task 4 Step 3. ✓
- "Approximate" flag for weekly-with-flow → Task 2 (logic) + Task 4 Step 4 (badge). ✓
- Engine & per-asset untouched → only `performance.ts`/hook/component touched; `computePortfolioPnL` not modified. ✓
- Tests (chaining, flow removal, value-weighting, weight change, approximate) → Task 2. ✓
- Docs incl. component docs + GLOSSARY → Task 5. ✓

**Placeholder scan:** No TBD/TODO; every code step shows code; commands have expected output. ✓

**Type consistency:** `SubPeriodReturn.returnFraction` (BigNumber|null) consumed by `computeTWRSeries` and `computeMonthlyReturns`; `TWRSeries.{points,endPct,approximate}` consumed by the hook; `HeroPoint.twrPct` + `DashboardHeroData.{twrEnd,benchmarkEnd,gapPts,approximate}` consumed by the component. Names match across tasks. ✓

**Known soft spot (flagged, not a blocker):** Task 4 Steps 3–5 are UI edits to an intricate chart with no component tests — verify visually on prod after push (no local dev server). The left/right axis calibration may need a small follow-up tweak once seen live; the engine (Tasks 1–2) is fully test-covered and is the part that must be exact.
