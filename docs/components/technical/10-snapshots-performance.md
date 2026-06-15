# Component 10: Snapshots & Performance — Technical (this build)

> Layer: React/Vite/Supabase implementation. Contract → [../10-snapshots-performance.md](../10-snapshots-performance.md)

## Stack

- React 19 + Vite + TypeScript; charts via **Recharts**, all money/quantity math via **BigNumber.js**.
- Snapshot data is shared through a React Context (`SnapshotsProvider`), loaded once per auth session — never fetched per-call-site.
- Backend: **Supabase** (Postgres + RLS). Two **Deno Edge Functions** (`take-snapshots`, `backfill-snapshots`) and one **pg_cron** job write snapshots server-side; the browser also writes today's row directly via `supabase-js`.
- The `snapshots` table is the **single source of truth** for current totals/allocation across dashboard, portfolio, and performance pages.

## File map

### Page + components

| File | Role |
| --- | --- |
| `src/pages/PerformancePage.tsx` | Composes the page; owns the `timeRange` state; gates charts behind `snapshots.length >= 2`; mounts `SnapshotManager`. |
| `src/components/performance/TimeRangeSelector.tsx` | Button row `1M / 3M / 6M / YTD / 1Y / ALL` (plain buttons, not shadcn ToggleGroup). |
| `src/components/performance/PerformanceSummary.tsx` | Stat-card grid: current value, all-time return, CAGR, best/worst month, max drawdown. Range-scoped cards suffixed with the active range. |
| `src/components/performance/PortfolioValueChart.tsx` | Recharts `AreaChart` of `total_usd`/`total_try` over snapshot dates. |
| `src/components/performance/MonthlyReturnsChart.tsx` | Recharts `BarChart`; per-bar `Cell` colored emerald/red by sign. |
| `src/components/performance/DrawdownChart.tsx` | Recharts `AreaChart`, `YAxis` domain `["auto", 0]`, red fill. |
| `src/components/performance/CategoryAttribution.tsx` | shadcn `Table` (cost basis, value, total P&L, contribution %); uses `gainLossClass`/`formatSignedCurrency`/`formatSignedPercent` from `lib/prices`. |
| `src/components/performance/SnapshotManager.tsx` | "Take Snapshot" button + last-snapshot line + collapsible history with per-row delete; toasts via `sonner`. **Manual capture only — no backfill UI here.** |
| `src/components/settings/SnapshotBackfillCard.tsx` | The on-demand **backfill** UI (lives in Settings, not on the performance page): density radio, overwrite checkbox, run button, result/warning panel. |
| `src/components/charts/LazyChart.tsx` | `React.lazy` wrappers for `PortfolioValueChart`, `MonthlyReturnsChart`, `DrawdownChart` (named→default shim) so Recharts is code-split out of the initial bundle; `PerformancePage` renders them inside `<Suspense>`. `CategoryAttribution` is **not** lazy (no chart lib). |

### Hooks + context

| File | Role |
| --- | --- |
| `src/contexts/SnapshotsContext.tsx` | `SnapshotsProvider` — loads `snapshots[]` once on auth; exposes `takeSnapshot`, `removeSnapshot`, `refetch`; runs the auto-refresh-today effect (see gotchas). |
| `src/hooks/useSnapshots.ts` | Thin re-export of `useSnapshotsContext` as `useSnapshots` (preserves the original import path). |
| `src/hooks/usePerformance.ts` | Memoizes `filterByTimeRange` + `computePerformanceMetrics` + `computeCategoryAttribution`. Note: category attribution is computed over **all** `assetPnLs`, range-independent. |
| `src/hooks/useBenchmark.ts` | Lazy-loads one benchmark ticker's daily-close series; empty until a ticker is passed. **Currently consumed by the dashboard hero overlay**, not `PerformancePage` (the benchmark comparison surfaces there). |

### Lib

| File | Role |
| --- | --- |
| `src/lib/performance.ts` | The compute core. `TimeRange` union (`1D 1W 1M 3M 6M YTD 1Y 2Y ALL` — selector currently exposes a subset), `filterByTimeRange` (with pre-cutoff start-anchor for ≥1M ranges), `subPeriodReturn` (the per-snapshot Modified-Dietz period return — extracted so it can be reused for geometric linking/TWR; returns `{ returnFraction, returnUsd, hadExternalFlow, spanDays }`), `computeMonthlyReturns` (calls `subPeriodReturn`, labels each as a monthly return), **`computeTWRSeries`** (the portfolio **time-weighted return** — geometrically chains `subPeriodReturn` across the window, removing each period's external cash flow; rebased to 0% at the first snapshot; value-weighting is automatic because each period reads the snapshot **total**; returns `TWRSeries = { points: { date, cumulativePct }[], endPct, approximate }`, where `approximate` flips true once a period that contained a flow spanned > 1 day, and a `V_start ≤ 0` period contributes a neutral factor), `computeYTDReturn`, `computeAllTimeReturn`, `computeCAGR`, `computeDrawdown`, `computeCategoryAttribution`, `computePerformanceMetrics`, **`computePnLTimeSeries`** (per-snapshot `value − cumulative net invested`), `computeCurrentInvestedUsd`, and `applyTxToInvested` (the canonical per-tx invested-capital rule). Worked TWR cases (incl. the +8% chain and the +35.7% withdrawal case) live in `src/lib/twr.test.ts` / [pnl-test-cases.md](../../pnl-test-cases.md). |
| `src/lib/queries/snapshots.ts` | `fetchSnapshots`, `deleteSnapshot`, `buildSnapshotInsert` (pure valuation + unpriced guard + `homeDayIso()` date stamp), `persistSnapshot` (upsert on `user_id,snapshot_date`), `createSnapshot` (re-reads holdings then builds+persists), `triggerBackfillSnapshots` (invokes the Edge Function, unwraps `FunctionsHttpError` body), and the `BackfillGranularity`/`BackfillOptions`/`BackfillResult` types. |
| `src/lib/queries/benchmarks.ts` | `fetchBenchmarkSeries(ticker)` — queries `benchmark_prices` **DESC** (PostgREST 1000-row cap returns the most recent ~4 years) then reverses to ascending. |
| `src/lib/constants/benchmarks.ts` | `BENCHMARKS` (`SPY`, `QQQ`), `DEFAULT_BENCHMARK_ID = SPY`, `findBenchmark`, legacy `BENCHMARK_NONE` sentinel. Tickers must match what `fetch-benchmark-history` upserts. |

## Data layer — snapshots table, edge functions, the daily cron

### `snapshots` table (`supabase/migrations/20260520000000_init.sql`)

- Columns: `user_id`, `snapshot_date date`, `total_usd numeric`, `total_try numeric`, `breakdown jsonb`; `UNIQUE(user_id, snapshot_date)`; index `idx_snapshots_user_date`. RLS: per-user select/insert/update/delete on `auth.uid()`.
- Top-level totals are written as strings (`BigNumber.toFixed()`) to keep Postgres `numeric` precision; JSONB breakdown values are plain JS numbers. Breakdown schema = the [Snapshot glossary entry](../GLOSSARY.md#snapshot) (`rates`, `by_category`, `by_platform` (+`color`), `by_tag`, `by_asset[]`).

### `intraday_snapshots` table (`supabase/migrations/20260615000000_intraday_snapshots.sql`)

- Columns: `id`, `user_id`, `captured_at timestamptz`, `total_usd numeric`, `total_try numeric`; index `idx_intraday_user_captured(user_id, captured_at)`. RLS: per-user CRUD on `auth.uid()`. **No breakdown, no unique constraint** — append-only, bounded by the hourly prune.
- Written only by `take-intraday-snapshots`; read by the client for the 1D hero view.

### Edge Functions (Deno)

| Function | What it does |
| --- | --- |
| `supabase/functions/take-snapshots/index.ts` | Bulk "now" snapshot for **all users** in one pass. Loads `price_cache` + latest `exchange_rates` + all non-zero `holdings`, groups by user, aggregates, upserts one row per user for `today` (home-timezone via `HOME_TIMEZONE`). Treats a price row older than `STALE_PRICE_MS` (36h) as unpriced → trips the skip guard. Auth: `X-Cron-Token` header vs `CRON_TOKEN` env (401 otherwise). |
| `supabase/functions/backfill-snapshots/index.ts` | Reconstructs history. **Density logic lives here** (`granularity`): `"monthly"` builds `dailyRange(today, 30)` + `weeklyBetween(earliestTxDate, dailyStart)` + earliest-tx + today; `"tx_dates"` uses only transaction days. Pulls historical closes from **Yahoo Finance** (`query1.finance.yahoo.com/v8/finance/chart`, ~800ms between symbols) and, for `price_source="tefas"` funds, daily NAVs from **TEFAS** (`fetchTefasHistory` in `_shared/tefas.ts` — same `fonFiyatBilgiGetir` endpoint as the live fetcher, smallest `periyod` ∈ {1,3,6,12,36,60} months that covers the fund's first transaction; the API caps at 60 months, so older dates stay unpriced). Converts source-currency closes → USD via dated FX (`TRY=X`, `EURTRY=X`, `GC=F`÷troy-oz for `XAU_GRAM`; TEFAS NAVs are always TRY). Replays transactions per `(asset,platform)` balance up to each date. `overwrite=true` deletes the `[earliestTxDate, today]` range for the affected users before upsert — **excluding dates the run couldn't price** (deleting a date it can't rewrite is data loss, the 2026-06-10 incident); empty portfolio writes `total=0`; an unpriced holding skips that date, `console.log`s it, and reports it in the response (`skipped` field + an `errors` summary line per user). |
| `supabase/functions/take-intraday-snapshots/index.ts` | Hourly totals-only writer for **all users**. Loads `price_cache` + latest `exchange_rates` + non-zero `holdings`, values each user via the shared `valueHoldings()`, inserts one `{ user_id, captured_at, total_usd, total_try }` row, then prunes `captured_at < now()-24h`. Unpriced guard skips just that user's **hour** (not a date). Auth: `X-Cron-Token`. |

Both functions are configured in `supabase/config.toml` (`[functions.take-snapshots]`, `[functions.backfill-snapshots]`, `[functions.fetch-prices]`).

### The daily cron (`supabase/migrations/20260602000000_demand_driven_price_refresh.sql`)

- pg_cron job **`daily-portfolio-snapshot`**, ~**23:55 UTC**. (Unschedules any prior job of the same name first.)
- It does **not** call `take-snapshots` directly anymore. It POSTs `fetch-prices` with body `{"force": true, "snapshot": true}` — force refetches all prices/rates, and `snapshot=true` **chains `take-snapshots`** once prices are fresh. This is the "chain after the price fetch" guarantee. (The original `init.sql` cron called `take-snapshots` directly; this migration supersedes it.)
- Secrets come from Postgres **Vault**: `functions_url` (Edge base URL) + `cron_token` (the `X-Cron-Token`). The cron reads `vault.decrypted_secrets`; the function rejects unmatched tokens. Keeps the job environment-agnostic.

### The benchmark cron (`supabase/migrations/20260607000000_schedule_benchmark_history_cron.sql`)

- pg_cron job **`daily-benchmark-history`**, **21:30 UTC** (just after the US market close, 16:00 ET). Independent of `daily-portfolio-snapshot`. (Unschedules any prior job of the same name first.)
- POSTs `/fetch-benchmark-history`. **No `X-Cron-Token`** — that function ignores its body, writes hardcoded tickers via the service role, and is `verify_jwt = false`. Reuses the same Vault `functions_url`.
- `fetch-benchmark-history` pulls Yahoo's full **10y** range and upserts `onConflict (ticker,date)`, so a single run backfills any gap and the job is idempotent (weekend/holiday runs re-write the prior close). Before this migration nothing invoked the function on a schedule, so the table froze at its one-time manual seed and the overlay forward-filled a flat line.

## Notes & gotchas

- **Snapshot is the single source of truth for totals.** Don't reintroduce a parallel `holdings × prices` total path on these pages — that drift class is exactly what this design removed. Cost basis / FIFO / realized P&L still come from `transactions` (deterministic), and per-row *display* value uses live `holdings.balance × snapshot price_usd` (not the snapshot's frozen `value_usd`) so a fresh transaction's quantity shows immediately. See [snapshot-price / live-quantity](../GLOSSARY.md#snapshot-price-and-live-quantity).
- **Auto-refresh-today effect** (`SnapshotsContext`): trails two signals — `lastUpdated` from prices (debounce **5s**, coalesces the cache-load→stale-refresh burst into one write) and `txVersion` from the transaction context (debounce **200ms**). Shorter window wins when both fire. Each signal is deduped via a ref so the effect can't loop on its own writes. Tx path calls `createSnapshot` (re-reads holdings post-recalc); price path builds from in-memory holdings and **skips the upsert when today's `total_usd`/`total_try` are unchanged** (BigNumber `.eq`) — this is what stopped the per-tick upsert flood.
- **Three writers, one guard.** `buildSnapshotInsert` (browser), `take-snapshots`, and `backfill-snapshots` each independently apply the unpriced-holding skip and the home-timezone date stamp. `buildSnapshotInsert` *throws* on unpriced (so the manual button can toast); `take-snapshots` logs/continues; `backfill-snapshots` logs, returns the skipped dates in its result, and shields them from the overwrite wipe.
- **Shared valuation core (`_shared/valuation.ts`).** `valueHoldings()` is the single per-user `holdings × prices → totals + breakdown + unpriced` aggregation, used by **both** `take-snapshots` (full breakdown) and `take-intraday-snapshots` (totals only). `STALE_PRICE_MS` lives in `_shared/constants.ts`. The browser's `buildSnapshotInsert` is a separate BigNumber copy (different runtime) — intentionally not unified.
- **The hourly cron (`supabase/migrations/20260615000100_schedule_intraday_snapshot_cron.sql`).** pg_cron job `hourly-intraday-snapshot`, `0 * * * *`. POSTs `fetch-prices` with `{"force": true, "intraday": true}` — force-refreshes prices, and `intraday=true` chains `take-intraday-snapshots`. Same Vault secrets as the daily job. `fetch-prices`' `triggerSnapshot` was generalized to `triggerChainedFunction(fnName, cronToken)`.
- **Backfill density is configured in `backfill-snapshots/index.ts`** (the `"monthly"` branch). The Settings card's two options map to `granularity: "monthly" | "tx_dates"` — note the value is still named `"monthly"` though the UI label and behavior are "weekly + last 30 days daily". Change density constants there, not in the client.
- **`TimeRange` type vs. selector:** `performance.ts` defines `1D`/`1W`/`2Y` too, but `TimeRangeSelector` only renders `1M 3M 6M YTD 1Y ALL`. The sub-week ranges exist for the dashboard hero's range deltas / `computePnLTimeSeries` consumers.
- **Benchmark wiring:** `useBenchmark` + `fetchBenchmarkSeries` + `BENCHMARKS` exist for the benchmark comparison, but are currently consumed by the **dashboard hero** overlay rather than `PerformancePage`. `benchmark_prices` is populated by a separate `fetch-benchmark-history` function (out of this component's tree), kept fresh by the `daily-benchmark-history` cron above.
- **`computeAllTimeReturn` / `computeCAGR` / `computeCategoryAttribution` anchor on transactions, not snapshots** — deliberately, so metrics don't lie when snapshot history begins after the first deposit. Only the value/drawdown/monthly-returns *series* read snapshot totals.
- **Lazy charts:** adding a new Recharts chart? Wrap it in `LazyChart.tsx` and render under `<Suspense>` to keep it out of the initial bundle (Recharts is heavy).
- **Intraday wiring (1D hero view).** `SnapshotsContext` now also loads + exposes `intradaySnapshots` (the last 24h of `intraday_snapshots` rows, via `fetchIntradaySnapshots` in `src/lib/queries/snapshots.ts`; type `IntradaySnapshot` in `src/types/database.ts`). It is threaded through `useDashboard` → `DashboardPage` → `DashboardHero` into `useDashboardHero`, whose `timeRange === "1D"` branch builds the series from `intradaySnapshots` via the pure `buildIntradaySeries` (`src/lib/dashboard/intraday.ts`). See Component 7 for the hero-side rendering.
