# Component 7: Dashboard — Technical (this build)

> Layer: React/Vite/Supabase implementation. Contract → [../07-dashboard.md](../07-dashboard.md)

## Stack

- React 19 + Vite + TypeScript; Tailwind 4 + shadcn/ui (`Card`, `Skeleton`,
  `DropdownMenu`).
- Recharts for the visuals: an `AreaChart` (the hero, with dual Y-axes in P&L
  mode) and a `PieChart`/`Pie`/`Cell` donut (allocation). Both are code-split via
  `React.lazy` behind `<Suspense>` (`src/components/charts/LazyChart.tsx`) so the
  charting lib isn't in the initial bundle.
- BigNumber.js for all money math in the data layer (`bn`, `BN_ZERO`,
  `BN_HUNDRED` from `@/lib/config`); `.toNumber()` only at the render boundary.
- Data via React Context + hooks (no react-query): `useAssets`, `usePrices`,
  `useSnapshots`, `useTransactionData`, `useBenchmark`, `usePnLSummary`. The page
  fetches nothing per-mount.
- Display state (`currency`, `obfuscated`) from `DisplayContext`.

## File map

- `src/pages/DashboardPage.tsx` — page shell. Pulls breakdowns/snapshots from
  `useDashboard` and the live current-value/total-P&L from `usePnLSummary`, then
  lays out hero → (tag + allocation) → (platform + movers) → (currency +
  foreign-income) in a `grid-cols-1 md:grid-cols-2`. Owns the skeleton + no-assets
  empty state; wraps
  the lazy hero/allocation in `<Suspense>`.
- `src/components/dashboard/DashboardHero.tsx` — the hero card: Value|P&L tabs,
  time-range buttons, benchmark `DropdownMenu`, the Recharts `AreaChart`, and the
  headline/delta/subtitle. Owns axis-tick math (`niceStep`/`niceTicks`,
  `compactCurrency`) and the dual-axis calibration.
- `src/components/dashboard/NetWorthCard.tsx` — net worth: primary + secondary
  currency. (Defined and exported; **not currently mounted** by the page — the
  hero's headline shows total value. See gotchas.)
- `src/components/dashboard/AllocationChart.tsx` — the donut + legend; local
  `CATEGORY_COLORS`/`CATEGORY_LABELS` maps; center-total overlay.
- `src/components/dashboard/PlatformBreakdown.tsx` — ranked platform list with
  percent bars (plain divs, not Recharts).
- `src/components/dashboard/TagBreakdown.tsx` — ranked tag list with percent bars;
  local `TAG_COLORS` map.
- `src/components/dashboard/CurrencyBreakdown.tsx` — ranked native-currency list
  with percent bars; local `CURRENCY_COLORS` map (USD blue / TRY amber / EUR
  violet) + `FALLBACK_COLOR` slate. Mirrors `PlatformBreakdown` exactly.
- `src/components/dashboard/ForeignIncomeCard.tsx` — the "Foreign income · <year>"
  heads-up: reads `useForeignIncomeYtd()`, renders the YTD-vs-threshold line + a
  progress bar (`bg-primary` → `bg-amber-500` at `pct >= 80` → `bg-red-500` once
  `crossed`), and fires the one-shot `sonner` `toast.warning` in a `useEffect`
  guarded by the `foreign-income-notified-<year>` `localStorage` flag (see gotchas).
  Default-exported but mounted directly (not lazy). Amounts via `formatCurrency`.
- `src/components/dashboard/TopMovers.tsx` — compact movers list; `AssetIcon` +
  ticker + signed amount/percent.
- `src/hooks/useDashboard.ts` — breakdown engine (below).
- `src/hooks/useDashboardHero.ts` — hero time-series + delta engine (below).
- `src/hooks/useForeignIncomeYtd.ts` — foreign-income heads-up view-model (below).
- `src/lib/constants/tax.ts` — `FOREIGN_INCOME_DECLARATION_THRESHOLD_TRY` (22000),
  the Turkish GVK 86/1-d annual declaration threshold (revalues yearly; verify each
  tax year). No hardcoded threshold literal lives in the hook or card.
- `src/contexts/DisplayContext.tsx` — `currency` (USD/TRY) + `obfuscated`, both
  `localStorage`-backed (`portfolio-display-currency`, `portfolio-obfuscated`);
  exposes `toggleCurrency`/`toggleObfuscated` via `useDisplayCurrency()`.

### `useDashboard.ts` specifics

- Composes `useAssets` + `usePrices` + `useSnapshots` + `useTransactionData`;
  `loading` is the OR of all four. `usdTry = rates?.usd_try ?? 1`.
- `latest = snapshots[len-1]`. Totals from `latest.total_usd`/`total_try`;
  `byCategory`/`byPlatform`/`byTag` are `Object.entries(breakdown.by_*)` mapped to
  `{ …, valueUsd, valueTry, percentage }` and **sorted by `valueUsd` desc**.
  `by_platform` also carries `color`. No holdings × prices recompute here — the
  snapshot is the single source of truth (prevented the dashboard-vs-portfolio P&L
  drift, commit 3a3cc45).
- `deriveTopMovers(breakdown.by_asset, assets, transactions, txRates)`: aggregates
  `value_usd` per ticker across platforms, **skips `category === "fiat"`**, then
  pairs with FIFO cost basis (`computeFIFOLots` from `@/lib/pnl/fifo`) →
  `unrealizedPnlUsd = currentValue − costBasis`, `pct` guarded against zero cost
  basis (`BN_ZERO`). Sorted by `Math.abs(unrealizedPnlUsd)` desc, `slice(0, 5)`.
- `deriveByCurrency(breakdown.by_asset, assets, totalValueUsd)`: maps each
  `by_asset` entry to its asset's native currency via `assetNativeCurrency`
  (`@/lib/constants/assets`) — same ticker→asset join as `deriveTopMovers` — and
  sums `value_usd`/`value_try` per currency; unknown ticker falls back to `"USD"`.
  `percentage = usd / totalValueUsd × 100` (guarded at 0). Sorted by `valueUsd`
  desc. Plain `number` math (not BigNumber) — render-only aggregation, mirrors the
  other breakdowns.

### `useDashboardHero.ts` specifics

- Args: `{ snapshots, currentValueUsd, currentValueTry, viewMode, timeRange,
  usdTry, currentPnlUsd?, currentPnlTry?, benchmarkTicker?, benchmarkSeries? }`.
  Reads `transactions`/`rates` from `useTransactionData`.
- Always computes `computePnLTimeSeries(snapshots, transactions, rates)` (from
  `@/lib/performance`) — value mode uses `investedUsd` per snapshot for the
  cost-basis secondary line; P&L mode uses `pnlUsd` as the primary series.
- TRY per point = `snapTotalTry / snapTotalUsd` ratio applied to the USD figure
  (per-point snapshot FX, never the live rate — avoids retro-converting history).
- Appends a live "now" point (`computeCurrentInvestedUsd`); in P&L mode anchors it
  to `currentPnlUsd`/`Try` (the `usePnLSummary` total) so **chart end == headline**.
- Prepends a synthetic **$0 anchor one day before the earliest transaction** so any
  range starts at first activity, not the window edge; de-dupes a same-date "now".
- Range filtering via `filterByTimeRange(fakeSnapshots, timeRange)` (rebuilds
  throwaway `Snapshot`-shaped objects; `compareByDate` re-attaches the secondary
  values the filter would otherwise drop).
- `delta = end − start`; percent denominator via `resolveHeroPctDenom`
  (`lib/dashboard/heroPercent.ts`): normal value window → `startUsd`; **P&L mode, or
  `startUsd ≈ 0`, or `timeRange === "ALL"`** → `computePeakInvestedUsd` (the same base
  as the headline Total P&L %, stable across withdrawals). In the ~$0-start case the
  numerator is lifetime `value − computeCurrentInvestedUsd` (avoids "millions-of-percent"
  off a ~$0 base), so the figure equals the headline Total P&L % exactly.
- `pnlDenom` = portfolio value at the visible start; the hero uses it to calibrate
  the left (currency) axis to the right (%) axis.
- Benchmark overlay (P&L mode): `closesAtOrBefore` two-pointer walk fills
  `benchmarkPct` as cumulative % from the first usable close.
- `xTicks`: one tick per unique formatted label (avoids the same month string
  repeating for dense daily snapshots); last label forced to `"Şimdi"`.

### `useForeignIncomeYtd.ts` specifics

- Wires the Plan-1 pure helpers `foreignDeclarableAssetIds(assets)` +
  `computeForeignIncomeTry(transactions, rates, year, declarable)` (from
  `@/lib/pnl/foreign-income`) to live data via `useAssets` + `useTransactionData`;
  `loading` is the OR of both. No money math here — it just `.toNumber()`s the
  BigNumber result at the boundary.
- `year = Number(homeDayIso().slice(0, 4))` — the calendar/tax year comes from the
  portfolio's home timezone (`homeDayIso`, `@/lib/config`) so it flips at the right
  local midnight, not the browser's.
- Returns `{ ytdTry, threshold, year, pct, crossed, loading }`: `threshold =
  FOREIGN_INCOME_DECLARATION_THRESHOLD_TRY`, `pct = ytdTry / threshold × 100`
  (guarded at 0, can exceed 100), `crossed = ytdTry > threshold`. Memoized on the
  inputs.

### Hero rendering specifics (`DashboardHero.tsx`)

- View mode / time range / benchmark id persisted via `usePersistedState`
  (`dashboardHero.viewMode` default `"value"`, `.timeRange` default `"1M"`,
  `.benchmark` default `SPY`) — survives the re-mounts an auth-token refresh on tab
  focus triggers. `TIME_RANGES` includes **2Y**.
- P&L mode subtracts `chartData[0]` from each point so the area starts at 0 and a
  `ReferenceLine y={0}` is drawn; line color is green/red by `delta.usd` sign
  (`rgb(16 185 129)` / `rgb(239 68 68)`), independent of theme primary.
- Dual Y-axes in P&L mode: left = `compactCurrency` USD/TRY ticks from `niceTicks`;
  right = same physical positions relabeled `%` via `pctTicks = pnlTicks / denom ×
  100`, so the green line reads identically off both axes. Benchmark plotted as `%`
  on the right axis (thin, 0.45 opacity).
- **After-tax "Total" subtitle (P&L mode):** the lifetime total is rendered from
  `totalPnlAfterTaxUsd`/`Try` props (gross − tax, computed in `usePnLSummary`, not
  here); its colour/sign use `gainLossClass(totalPnlAfterTaxUsdNow > 0)`. When
  `totalTaxAccrualUsd > 0` a muted `gross … · −{tax} tax` line follows, with the tax
  in TRY = `totalTaxAccrualUsd × usdTry`. The lifetime **percent stays gross**
  (`totalPnlPct`, over peak net invested); the period delta + chart series are
  untouched. Untaxed portfolios render as before (net == gross, no extra line).

## Notes & gotchas

- **Render formatting / colors:** `gainLossClass`, `formatSignedCurrency`,
  `formatSignedPercent`, `formatCurrency` from `@/lib/prices` — canonical
  emerald-600 / red-500, ASCII minus, no sign at zero. Don't hand-roll. (TopMovers'
  inline `text-emerald-600`/`text-red-500` predates the helper; a noted edge, not
  fixed in this pass.)
- **Obfuscation hides amounts only:** every currency string is wrapped in
  `obfuscate(v, obfuscated)` (some components alias `const o = (v) => obfuscate(v,
  obfuscated)`). **Percentages are deliberately never wrapped** — allocation %,
  period %, total %, and benchmark % stay visible when amounts are hidden. Preserve
  this asymmetry.
- **Two data paths, on purpose:** breakdowns/chart are **snapshot-derived**
  (`useDashboard`/`useDashboardHero`); the hero's *current* value + total P&L come
  from `usePnLSummary` (live holdings × prices). The "now" point is anchored to the
  `usePnLSummary` number so the chart's end matches the headline and the Portfolio
  page — don't unify these into one source.
- **Per-point FX, not live rate:** chart TRY values use each snapshot's
  `try/usd` ratio. Retro-converting old snapshots at today's rate would corrupt
  history; keep the per-point ratio.
- **`NetWorthCard` is built but unmounted:** `DashboardPage` does not render it
  (the hero headline covers net worth). The component and its tests-of-intent
  remain; mounting it would duplicate the hero's total. Leave it unless net worth
  needs a dedicated card.
- **Foreign-income notification is a one-shot per tax year per browser:** the
  `toast.warning` in `ForeignIncomeCard` is gated by a `localStorage` flag keyed
  `foreign-income-notified-<year>` — set on first fire so it never re-toasts on
  later renders/visits. It's intentionally **browser-local** (not server-synced) and
  **per-year** (a new key each tax year). Don't move the toast above the
  `loading`/`crossed` guards or it can fire on a half-loaded state.
- **Color maps are component-local:** `CATEGORY_COLORS` (AllocationChart),
  `TAG_COLORS` (TagBreakdown), and platform color (from the snapshot's
  `by_platform[].color`) live in three places. Category/tag maps duplicate some
  hues; a noted edge (not fixed) — consolidate into `@/lib/constants` if they grow.
- **Top movers ≠ 24h movers:** the label says "Top Movers" but the figure is
  lifetime unrealized P&L (no intraday price history exists). Movers are
  **USD-only** even under the TRY toggle.
- **Empty/loading gating:** page shows skeletons while `useDashboard().loading ||
  usePnLSummary().loading`; the no-assets state keys off
  `byCategory.length === 0 && byPlatform.length === 0`. The hero independently
  guards `chartData.length >= 2` for its "not enough data" placeholder.
- **Charts are lazy:** `DashboardHero` and `AllocationChart` import through
  `LazyChart.tsx`; they must stay default-exported for `React.lazy`.
