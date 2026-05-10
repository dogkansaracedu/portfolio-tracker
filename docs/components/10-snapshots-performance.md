# Component 10: Snapshots & Performance

## Status: Done

## Overview
The snapshot system captures aggregated portfolio state per day (`snapshots` table, one row per user per date) and the performance page renders charts and metrics derived from that history: portfolio value over time, monthly returns, category attribution, drawdown, and summary statistics.

The latest snapshot is also the single source of truth for *current* portfolio aggregations consumed by the dashboard and portfolio page (see Snapshot as Source of Truth below). Snapshot writers are: a daily cron, an on-demand backfill for historical dates, and an in-browser writer that keeps today's row trailing the freshest prices and balances.

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

## Snapshot as Source of Truth

The dashboard, portfolio page, and performance page read the latest snapshot's `breakdown` JSONB instead of recomputing aggregations from `holdings × prices`. One writer path, one reader. This eliminates an entire class of bugs where parallel compute paths silently disagree on aggregation rules (e.g. how a buy/sell/cash_credit contributes to "invested" capital).

The split between fields is:
- **Current value, allocation breakdowns, totals** — sourced from the snapshot.
- **Cost basis, FIFO lots, realized P&L** — computed from `transactions` (deterministic, no second source).
- **Live balances** — read from `holdings` so transaction edits reflect quantity changes immediately. Per-row value is then derived as `live balance × snapshot's recorded price-per-unit`. The snapshot's stored `value_usd` (which is `amount × price` frozen at write time) is *not* read directly; doing so would briefly show the pre-edit value after a transaction changes the balance.

## Snapshot Density

Two granularity modes for the on-demand backfill:

- **Weekly + last 30 days daily** (default): one snapshot every 7 days walking back from the earliest transaction date, plus daily for the most recent 30 days. Long ranges (1Y / ALL) stay lightweight; recent ranges retain daily detail.
- **Each transaction day**: one snapshot per day a transaction occurred. More precise on activity, sparser on quiet periods.

The daily cron writes one snapshot per user per day at a fixed UTC hour, separate from these density modes.

## Auto-Refresh of Today's Snapshot

The browser-side snapshot writer keeps today's row trailing the freshest data the client has seen. It rewrites today's snapshot when either signal changes:

- **Price refresh** (`lastUpdated` from the prices store moves) — debounced ~5s so a typical page load (cache-load → stale-refresh) collapses to one canonical write.
- **Transaction add/edit/delete** (transaction context bumps a version) — debounced ~200ms so the dashboard total catches up to a fresh edit nearly instantly. Discrete user actions don't burst, so a smaller window is safe.

When both signals fire together the shorter window wins. Each signal is independently deduped so the effect can't loop on its own writes.

The shared snapshot store is loaded once and served to all consumers (dashboard, portfolio page, performance page, snapshot manager). When a writer succeeds it triggers a refetch so every reader sees the new row.

## Defensive Guards

All three snapshot writers — daily cron, on-demand backfill, in-browser writer — apply the same correctness guards:

- **Skip on unpriceable holdings**: if any held asset has `price_usd <= 0` for the target date, the writer skips that date with a logged reason instead of writing a snapshot that silently omits the unpriced holding. Skipping for one day is recoverable; locking in a wrong total isn't. The browser path surfaces the skip as a thrown error so the manual "Take Snapshot" button can toast; the cron logs and continues to other users.
- **Empty portfolio writes a $0 snapshot**: when the user has sold everything, the backfill writes `total_usd = 0` for those dates so charts render a flat $0 line through the closed-position period instead of interpolating a fictional value.
- **`overwrite=ON` wipes the full date range**: when the user requests overwrite, the writer deletes every snapshot in `[earliestTxDate, today]` for the user before upserting fresh rows. Deleting only the target dates leaves stale rows from prior runs surviving; range-based wipe is the correct semantic for "rebuild the slate".

## Cron Authentication

The cron command authenticates to the snapshot writer with a shared `X-Cron-Token` header. Both the token and the writer's base URL live in Postgres Vault; the cron reads from Vault and the writer rejects unmatched headers. This keeps the cron command environment-agnostic.

## Snapshot Breakdown Schema

`snapshots.breakdown` is the JSONB blob that carries all aggregations. See PRD §8.2 for the canonical schema. Per-bucket TRY values are stored alongside USD; per-platform entries carry display color so the dashboard doesn't have to look it up. When a row is missing an optional TRY field, the reader falls back to `usd × the snapshot's recorded usd_try` rate — never the live rate, which would retro-convert old snapshots at today's exchange rate.

## Performance Charts

The performance page renders chronologically against `snapshots`:

- A synthetic `$0` anchor is prepended one day before the earliest transaction across all time ranges. Portfolios that started inside a 1Y / YTD window begin at the actual entry point with $0, like brokers display newly-listed instruments.
- Charts use a time-scale x-axis with monotone smoothing so points are placed by elapsed time, not uniform array index — recent dense daily points don't visually dominate older sparse weekly points on long ranges.
- Negatives in summary tooltips render with a leading minus. Showing `-$940` as `$940` would be the worst silent failure for a P&L tracker.

## Tasks
1. **Snapshot queries** (`lib/queries/snapshots.ts`):
   - fetchSnapshots(userId): all, date ASC
   - createSnapshot(userId): fetch active assets + prices + rates → aggregate by category/platform → build breakdown JSONB (per PRD 8.2) → INSERT. Apply the unpriceable-holdings guard.
   - deleteSnapshot(id): rare admin action

2. **Shared snapshot store**: load once on auth, serve all consumers, expose snapshots[], loading, takeSnapshot(), deleteSnapshot(), refetch(). Subscribe to price-update and transaction-version signals; rewrite today's row on either, with the debounce policy above.

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
- **Snapshot is the single source of truth for current aggregations**: dashboard, portfolio page, and performance page read the snapshot; they never recompute from `holdings × prices`. One writer path, one reader, no drift class.
- **Live balance × snapshot price per unit**: per-row values use `holdings.balance × snapshot.price_usd`, not the snapshot's frozen `value_usd`. Quantity changes (a fresh transaction) reflect immediately while the snapshot stays the source of truth for prices.
- **Snapshot writers share a defensive guard**: unpriceable holdings cause a skip, not a silent omission. Empty portfolios write `$0` rather than a missing date.
- **`overwrite=ON` is range-based**: deletes the full `[earliestTxDate, today]` window before rewriting. Deleting only target dates leaves stale rows from prior cadences alive.
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
