# Component 10: Snapshots & Performance

## Status: Done

## Recent updates (post-deploy)

- **Snapshot density:** the default `monthly` granularity is *weekly + last 30 days daily* — one snapshot every 7 days walking back from earliest tx, plus daily for the last month. Long ranges (1Y / ALL) stay lightweight; recent ranges keep daily detail. The `tx_dates` mode (one per transaction day) is still available.
- **Empty-portfolio snapshots:** when the user has sold everything, backfill writes a `total_usd = 0` snapshot for those dates so charts show a flat $0 line through the closed-position period instead of an interpolated gap.
- **Cron auth:** `take-snapshots` accepts an `X-Cron-Token` header; the cron command reads it (and the Edge Functions URL) from Postgres Vault. See `supabase/migrations/20260507100300_cron_via_vault.sql`.
- **Charts:** Dashboard hero uses time-scale x-axis (`type="number"`, `scale="time"`) with `monotone` smoothing so points are placed by elapsed time rather than uniform array index. Earlier 30-day cluster no longer dominates 1Y / ALL ranges.
- **Synthetic zero-anchor:** chart prepends a $0 anchor one day before the earliest transaction across *all* time ranges (was ALL-only). 1Y / YTD on portfolios that started inside the window now begin at the actual entry point with $0, like brokers do for newly-listed instruments.

### 2026-05-10: snapshot becomes the single source of truth

- **Architecture:** `snapshot.breakdown` is now the only thing the dashboard / portfolio / performance pages read for "current portfolio value". One writer (the snapshot path: cron + backfill + in-browser `createSnapshot`), one reader. Eliminates the recurring class of bugs where three independent compute paths silently disagreed (most recent: +$1,176 dashboard-vs-portfolio P&L gap from `cash_credit` rows). Architectural guardrails are listed at the bottom of this file.
- **`SnapshotsProvider` (`src/contexts/SnapshotsContext.tsx`):** shared snapshot store + auto-refresh effect. Watches two event sources to keep today's snapshot fresh:
  - `lastUpdated` from `PricesProvider` — any price refresh.
  - `txVersion` from `TransactionContext` — any transaction add/edit/delete.
  - Debounced 5s so a typical page load (cache-load → stale-refresh) collapses to a single canonical write instead of two. Dedupes per-source so the effect can't loop on its own writes.
- **`PricesProvider` (`src/contexts/PricesContext.tsx`):** lifts `usePrices` into a single shared instance so the header's manual "Refresh prices" button propagates to `SnapshotsProvider` (which previously had its own `usePrices` instance and stayed stale). Auto-stale-refresh runs once per app session instead of once per consumer.
- **Defensive guard in all three writers (`take-snapshots`, `backfill-snapshots`, in-browser `createSnapshot`):** if any held asset has `price_usd <= 0`, skip the write rather than locking in a wrong total. This is the structural defense against the failure mode that produced the original 2026-04-09 orphan. The cron logs the skip reason; the in-browser path throws so the manual "Take Snapshot" button can toast.
- **Schema additions (optional on legacy rows):** `by_platform[name].try`, `by_platform[name].color`, `by_tag[name].try`, `by_asset[i].value_try`. Frontend falls back to `usd × snapshot's recorded usd_try` for legacy rows (never live, which would retro-convert at today's rate).
- **`overwrite=ON` semantics fix (commit `f99499e`):** earlier behavior deleted only the exact target dates the run was about to write — stale rows on dates outside the run's `targetSet` survived. Now `overwrite=true` deletes every snapshot in `[earliestTxDate, today]` for the affected user before the upsert, then writes fresh.
- **`formatSigned` (`DashboardHero.tsx`):** shows the leading `−` on negatives (was rendering losses as if they were gains).

### 2026-05-10 (later): staleness regression and follow-up fix

The first pass of §5.1 read `snapshot.by_asset[i].value_usd` directly. That field is `amount × price` frozen at snapshot write time, so after a tx changed the balance the Value column briefly showed the pre-edit value (Quantity updated immediately from `holdings`, Value lagged for ~5s until the auto-refresh wrote a fresh snapshot). Fix: source only the **price-per-unit** from the snapshot and multiply by the **live balance**. Quantity is reflected immediately; the snapshot stays the source of truth for *prices*; the bounded ≤5s lag now only affects price refreshes (which barely move the value in 5 seconds).

A complementary debounce tweak: tx-driven snapshot writes use a 200ms window (`TX_REFRESH_DEBOUNCE_MS`) so the dashboard total catches up to a fresh edit nearly instantly, while price-driven writes keep the 5s window (`PRICE_REFRESH_DEBOUNCE_MS`) so cache-load → stale-refresh bursts coalesce. When both triggers fire together the shorter window wins.

### Architectural guardrails (do not undo)

These are the structural defenses against the bug classes this architecture was created to eliminate. Future work touching the snapshot path should preserve them:

- **No `holdings × prices` aggregation on the dashboard or portfolio page.** The whole point of the SoT refactor is one source of truth for derived totals. New dashboard features that need derived data go in `snapshot.breakdown` (extending the schema) and are read from there — not recomputed in `useDashboard` / `useHoldings × usePrices`. Quantity comes from live `holdings` so transactions feel responsive; price comes from the snapshot so totals are consistent across the dashboard, portfolio page, and `total_usd`.
- **Do not remove the unpriced-holdings guards** in `take-snapshots`, `backfill-snapshots`, or `createSnapshot`. They're the structural defense against the failure mode that produced the original 2026-04-09 orphan (a holding silently dropped from totals because its price wasn't cached yet). If they get noisy, fix `fetch-prices` so the cache *is* complete; don't silence the guard.
- **Do not weaken `formatSigned`** back to "no minus on negatives". A `−$940` rendered as `$940` is the worst possible silent failure for a P&L tracker — losses look like gains.
- **`overwrite=ON` deletes the date range** `[earliestTxDate, today]` for the affected user, not just the dates the run is about to write. Reverting to "delete only target dates" reintroduces the orphan-survival bug fixed in commit `f99499e`.

## Overview
Build the snapshot system (manual trigger, snapshot viewing) and full performance page with charts: portfolio value over time, monthly returns, category attribution, drawdown, and summary statistics.

## Dependencies
- Component 5 (Price Engine)
- Component 6 (P&L Engine)
- Component 7 (Dashboard) — shares charting patterns

## File Structure
```
src/
├── pages/
│   └── PerformancePage.tsx
├── components/
│   └── performance/
│       ├── TimeRangeSelector.tsx
│       ├── PortfolioValueChart.tsx
│       ├── MonthlyReturnsChart.tsx
│       ├── CategoryAttribution.tsx
│       ├── DrawdownChart.tsx
│       ├── PerformanceSummary.tsx
│       └── SnapshotManager.tsx
├── hooks/
│   ├── useSnapshots.ts
│   └── usePerformance.ts
├── lib/
│   ├── queries/
│   │   └── snapshots.ts
│   └── performance.ts
```

## Tasks
1. **Snapshot queries** (`lib/queries/snapshots.ts`):
   - fetchSnapshots(userId): all, date ASC
   - createSnapshot(userId): fetch active assets + prices + rates → aggregate by category/platform → build breakdown JSONB (per PRD 8.2) → INSERT
   - deleteSnapshot(id): rare admin action

2. **useSnapshots hook**: Fetch all on mount. Expose snapshots[], loading, takeSnapshot(), deleteSnapshot(), refetch()

3. **Performance utilities** (`lib/performance.ts`):
   - computeMonthlyReturns(snapshots): (S[n]-S[n-1])/S[n-1] per pair
   - computeYTDReturn(snapshots): Jan 1 vs latest
   - computeAllTimeReturn(snapshots): earliest vs latest
   - computeCAGR(snapshots): (latest/earliest)^(1/years)-1
   - computeDrawdown(snapshots): (value-peak)/peak per snapshot. Max drawdown = min
   - computeCategoryAttribution(snapshots, timeRange): per-category Δ / total_start
   - filterByTimeRange(snapshots, range): filter to 1M, 3M, 6M, YTD, 1Y, ALL

4. **usePerformance hook**: Depends on useSnapshots. Accepts timeRange. Returns { monthlyReturns, ytdReturn, allTimeReturn, cagr, maxDrawdown, bestMonth, worstMonth, drawdownSeries, filteredSnapshots, loading }

5. **TimeRangeSelector**: Row of buttons (1M, 3M, 6M, YTD, 1Y, ALL). Active highlighted. shadcn ToggleGroup

6. **PortfolioValueChart**: Recharts AreaChart/LineChart. X: dates, Y: total value. Single line in selected currency. Tooltip: date, value, monthly change. ResponsiveContainer

7. **MonthlyReturnsChart**: Recharts BarChart. Green bars positive, red negative. X: month labels, Y: return %. Tooltip: "March 2026: +3.2% ($1,240)"

8. **CategoryAttribution**: Table (not chart). Columns: Category, Start value, End value, Change USD, Contribution %. Sorted by absolute contribution. shadcn Table

9. **DrawdownChart**: Recharts AreaChart. Always ≤0. Red filled area below 0% line. Highlights max drawdown point. X: dates, Y: drawdown %

10. **PerformanceSummary**: Grid of stat cards (2x3 or 3x2): Total Return (amount+%), CAGR, Best Month, Worst Month, Max Drawdown (% + date range), Current value. shadcn Card

11. **SnapshotManager**: "Take Snapshot Now" button. Last snapshot date. Collapsible snapshot history list with date, total value, delete option. Success/error toast

12. **PerformancePage layout**:
    - TimeRangeSelector (top)
    - PerformanceSummary (stat cards)
    - PortfolioValueChart (full width)
    - MonthlyReturnsChart (1/2) + CategoryAttribution (1/2)
    - DrawdownChart (full width)
    - SnapshotManager (bottom, collapsible)
    - Mobile: single column stacked

13. **Empty state**: If <2 snapshots: "Take at least 2 snapshots to see performance. Your first snapshot captures today's state." + "Take First Snapshot" button

14. **Time range edge cases**: <2 data points in range → "Not enough data" message + suggest wider range

## UI Components
- **shadcn/ui**: Card, Table, ToggleGroup, Button, Collapsible, Skeleton, Sonner/Toast
- **Recharts**: AreaChart, Area, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell
- **Custom**: TimeRangeSelector, PortfolioValueChart, MonthlyReturnsChart, CategoryAttribution, DrawdownChart, PerformanceSummary, SnapshotManager

## Key Decisions
- **Monthly granularity**: Performance measured monthly, not daily. Aligns with long-term tracking goal
- **All computation client-side**: <120 snapshots (10 years). Trivial computation
- **CAGR only after 1+ year**: Show "N/A" if <12 months of data
- **Drawdown in USD only**: TRY drawdown would be misleading due to depreciation
- **Manual snapshot is idempotent per date**: UPSERT with (user_id, snapshot_date) unique constraint
- **SnapshotManager in Performance page**: Data belongs with its visualization, not in Settings

## Acceptance Criteria
- [ ] Manual snapshot from Performance page saves to DB
- [ ] Portfolio value line chart renders from snapshot data
- [ ] Monthly returns bar chart with green/red bars
- [ ] Category attribution table shows per-category contributions
- [ ] Drawdown chart shows peak-to-trough drawdowns
- [ ] Summary stats computed and displayed (total return, CAGR, best/worst, max drawdown)
- [ ] Time range selector filters all charts and metrics
- [ ] Empty state shown when <2 snapshots
- [ ] All charts responsive
