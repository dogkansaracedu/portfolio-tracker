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
  lays out interest alerts → hero → (allocation + platform) → (movers +
  currency) in `grid-cols-1 md:grid-cols-2` rows, with the foreign-income card
  full-width at the bottom. Owns the skeleton + no-assets empty state; wraps the
  lazy hero/allocation in `<Suspense>`.
- `src/components/dashboard/InterestAlerts.tsx` — **Component 16's** two
  warning banners (expired / ends-soon interest positions), rendered above the
  hero and dismissable for the browser session. Owned by Component 16; see
  [technical/16-interest.md](16-interest.md).
- `src/components/dashboard/DashboardHero.tsx` — the hero card: the Value|P&L,
  TWR|MWR and time-range switches (all three are
  `components/common/SegmentedControl`, the app's single pick-one control),
  benchmark `DropdownMenu`, the Recharts `AreaChart`, and the
  headline/delta/subtitle. Owns axis-tick math (`niceStep`/`niceTicks`) and the
  dual-axis calibration; compact money ticks come from `lib/prices`'
  `formatCompactCurrency`, shared with the Asset Detail and Budget charts. The
  measure switch's explainer and the MWR/yr chip are `HintPopover`s (hover *and*
  tap), so no shadcn `Tooltip` is imported here any more.
- `src/components/dashboard/NetWorthCard.tsx` — net worth: primary + secondary
  currency. (Defined and exported; **not currently mounted** by the page — the
  hero's headline shows total value. See gotchas.)
- `src/components/dashboard/AllocationChart.tsx` — the **two-ring** donut +
  grouped legend; consumes `AllocationNode[]` (`byAllocation`). Inner `Pie` =
  top categories, outer `Pie` = leaves in the same order (fiat → its currencies,
  others pass through), both `paddingAngle={0}` and `startAngle={90}
  endAngle={-270}` (12 o'clock, clockwise) so the rings stay radially aligned.
  Local `CATEGORY_COLORS`/`CATEGORY_LABELS` + the shared
  `CURRENCY_CHART_COLORS` (`lib/constants/currencies.ts`) for the fiat children
  — the same map `CurrencyBreakdown` reads, so a currency is one colour app-wide;
  `labelFor`/`colorFor` resolve a node's key.
  **Interaction is driven by local `activeKey` state** (not Recharts'
  `activeShape`/`activeIndex` — `activeIndex` was dropped in Recharts 3, where
  active state is Tooltip-bound; there is no `<Tooltip>` here): `onMouseEnter` on
  each `Pie`/legend row sets `activeKey`, `onMouseLeave` clears it. Cells dim to
  `fillOpacity` `DIM_OPACITY` (0.28) unless lit; `isLit` lights the hovered slice
  plus its parent/children via a `parentOf` map (hover a currency → its fiat
  wedge lights too, and vice-versa). The center overlay reads the total at rest
  and the hovered slice's label/value/percent on hover (from a `meta` map).
  `LegendRow` renders each slice's value + percent (value via `obfuscate`),
  Fiat's `children` indented; its hover syncs the same `activeKey`. Pies set
  `isAnimationActive={false}` so re-renders from hover don't re-animate.
- `src/lib/dashboard/allocation.ts` — pure `deriveAllocationSlices` + the
  `AllocationNode` type (below). Separate module (not in the hook) so its test
  doesn't import the Supabase-backed data hooks.
- `src/components/dashboard/AllocationBreakdown.tsx` — the breakdown card
  itself: card shell, empty state, and one labelled coloured bar per slice with
  its share and its value in the display currency (plain divs, not Recharts).
  Takes `{ title, emptyText, rows }` where a row is
  `{ label, color, valueUsd, valueTry, percentage }` — `label` doubles as the key.
- `src/components/dashboard/PlatformBreakdown.tsx` — maps the ranked platform
  list onto it; each platform carries its own colour.
- `src/components/dashboard/CurrencyBreakdown.tsx` — maps the ranked
  native-currency list onto it; colours from the shared `CURRENCY_CHART_COLORS`
  / `CURRENCY_CHART_FALLBACK_COLOR`. The two cards were the same component
  written twice, down to the bar's `Math.max(pct, 1)%` floor.
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
  `byPlatform` is `Object.entries(breakdown.by_platform)` mapped to
  `{ …, valueUsd, valueTry, percentage, color }` and **sorted by `valueUsd` desc**.
  (`by_tag` is written to the snapshot but the dashboard does not read it — there
  is no Tags card.) No holdings × prices recompute here — the snapshot is the
  single source of truth, which is what keeps the dashboard and the Portfolio page
  from drifting apart on P&L.
- `byAllocation = deriveAllocationSlices(breakdown.by_asset, assets, totalValueUsd)`
  (`@/lib/dashboard/allocation`): the donut slices are re-derived from `by_asset`,
  **not** read from `breakdown.by_category`. Cash, `fund` (PPF), and stablecoins
  (`isStablecoin`) collapse into one `fiat` `AllocationNode` whose `children` are
  the per-currency split (`fiatCurrencyKey`: stablecoins keep their ticker, cash +
  funds fold into `assetNativeCurrency`); stablecoins therefore drop out of the
  `crypto` total. Every other asset stays its own category node; an unknown ticker
  becomes a top-level node keyed by the ticker. Plain `number` math (render-only
  aggregation), same ticker→asset join as `deriveByCurrency`. `breakdown.by_category`
  is unused by the dashboard (it is still written to the snapshot).
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

- Args: `{ snapshots, intradaySnapshots, currentValueUsd, currentValueTry,
  viewMode, timeRange, measure?, usdTry, currentPnlUsd?, currentPnlTry?,
  benchmarkTicker?, benchmarkSeries? }` (`measure` defaults to `"twr"`; see the
  MWR section). Reads `transactions`/`rates` from `useTransactionData`.
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
- `delta = end − start`; `delta.pct = deltaUsd / |startUsd|` only when
  `|startUsd| ≥ 1` — otherwise **null**, and the hero hides the percent. No
  fallback denominator exists: peak-invested calculations and
  `lib/dashboard/heroPercent.ts` were removed 2026-08-28. P&L mode never
  renders this percent (its % lenses are the TWR/MWR measure and the MWR chip).
- `pnlDenom` = portfolio value at the visible start; the hero uses it to calibrate
  the left (currency) axis to the right (%) axis.
- Benchmark overlay (P&L mode, **`measure === "twr"` only**): `closesAtOrBefore`
  (imported from `@/lib/mwr` — the hook's private twin was deleted) two-pointer
  walk fills per-point `benchmarkPct` as cumulative % from the first usable
  close. Under `"mwr"` this raw rebase is skipped and `benchmarkPct` comes from
  the what-if index instead (below).
- **Portfolio lead overlay (P&L mode):** over `filterByTimeRange(snapshots,
  timeRange)` plus a minimal live "now" snapshot (both engines only read
  `snapshot_date` + `total_usd`, so the same `Snapshot`-shaped cast used for
  `fakeSnapshots` suffices):
  - `measure === "twr"` → `computeTWRSeries(nowSnaps, transactions, rates)`
    (`@/lib/performance`); `approximate` passes through.
  - `measure === "mwr"` → `computeMWRSeries(nowSnaps, transactions, rates)` for
    the lead line **and** `computeWhatIfIndexMWRSeries(nowSnaps, transactions,
    rates, benchmarkSeries)` for `benchmarkPct`; `approximate` is forced `false`.
  Either engine's `points[].cumulativePct` are written onto the chart points by
  the local `applyPctSeries(chartData, points, field)` helper (carry-forward for
  points the series doesn't cover — one mapping shared by all three series);
  `endPct` → `twrEnd`. Top-level fields exposed: `twrEnd` (the portfolio's return
  % at "now" **in the active measure**), `benchmarkEnd` (= the last point's
  `benchmarkPct`), `gapPts` (`twrEnd − benchmarkEnd`, percentage points),
  `approximate`, and `lifetimeXirrPct`. The `twrPct`/`twrEnd`/`benchmarkPct`/
  `benchmarkEnd` **names are kept from the TWR-only build but carry the active
  measure** — no rename was made (a rename would also have to touch
  `lib/dashboard/intraday.ts`, which has its own `twrPct`/`twrEnd`). Both series
  are **rebased to 0% at the visible window start** (TWR/MWR by construction;
  the raw benchmark by anchoring on its first usable close).
- `lifetimeXirrPct = computeLifetimeXirrPct(transactions, rates,
  currentValueUsd, today)` in P&L mode (null in value mode). Range-independent,
  so it is computed once above the 1D branch and returned by both branches.
- `xTicks`: one tick per unique formatted label (avoids the same month string
  repeating for dense daily snapshots); last label forced to `NOW_LABEL`
  (`"Now"`, `lib/constants/app.ts` — shared with `intraday.ts`). Date labels are
  formatted with `DISPLAY_LOCALE` (`en-US`), not `tr-TR`.
- **1D intraday branch:** `DashboardHero` passes `intradaySnapshots` (from
  `useSnapshots` via `useDashboard`) into the hook; when `timeRange === "1D"` the
  series is built from those hourly totals by the pure `buildIntradaySeries`
  (`@/lib/dashboard/intraday.ts`) — the last ~24h of points on a time-of-day axis
  with the live current value as the right-edge "now" point — instead of the
  snapshot/TWR path above.

### `useForeignIncomeYtd.ts` specifics

- Wires the pure helpers `foreignDeclarableAssetIds(assets)` +
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

- View mode / time range / benchmark id / measure persisted via
  `usePersistedState` (**`dashboardHero.viewMode.v2` default `"pnl"`**,
  `.timeRange` default `"1M"`, `.benchmark` default `SPY`, **`.measure` default
  `"twr"`**) — survives the re-mounts an auth-token refresh on tab focus
  triggers. The `.v2` suffix on the view-mode key is load-bearing: changing
  the default again requires a new suffix, otherwise browsers with a stale
  persisted value keep overriding it. `TIME_RANGES` includes **2Y**.
- **Measure switch (TWR | MWR):** a second, smaller segmented control from the
  `MEASURES` constant (`{ id, label, hint }`; `hint` → the `HintPopover` beside
  the switch, never a `title`), same
  visual language as the `VIEW_MODES` tabs at `p-0.5 / px-2 py-1 text-xs`. It sits
  in the **header row, right of the Value|Performance tabs** (that row is
  `justify-between`, so it lands flush right), and renders only when
  `showMeasureSwitch = viewMode === "pnl" && timeRange !== "1D"`.
  `effectiveMeasure = showMeasureSwitch ? measure : "twr"` is what the labels and
  the hook arg use — it mirrors the hook ignoring `measure` in 1D/value mode, so a
  persisted `"mwr"` can never mislabel the intraday view.
- **Label vs id:** `VIEW_MODES` renders the `pnl` mode with the visible label
  **"Performance"** (and the headline eyebrow reads `Performance · <range>`) — the
  chart is a TWR percent race, not dollar P&L. The internal id, persisted value, and
  `viewMode === "pnl"` checks all keep the `pnl` name; "P&L mode" below refers to that id.
- **P&L mode is a you-vs-index percent race:** the chart plots **two `<Area>`s on
  the right (%) axis** — `dataKey="twrPct"` (the portfolio's return in the active
  measure, the lead line, green/red by `twrEnd` sign) and `dataKey="benchmarkPct"`
  (the index, thin, low opacity) — both already rebased to 0% at the window start
  by the hook, and both switched to their money-weighted counterparts by the
  measure switch (the dataKeys don't change). A `ReferenceLine y={0}` marks the
  shared baseline. (Value mode keeps the single value `<Area>` with a cost-basis
  reference line.)
- **Stroke/fill color follows the plotted series:** `isLoss` is
  `viewMode === "pnl" ? twrEnd < 0 : delta.usd < 0`, so the lead line's green/red
  always matches its own headline — measure-correct without a second branch,
  because `twrEnd` carries whichever measure is active. Don't key it off
  `delta.usd` in both modes — a
  large mid-window deposit can make the money-weighted `delta.usd` positive while
  `twrEnd` is negative, which painted a green line under a red headline. Exactly
  zero counts as non-loss (green tint) in both modes.
- **1D hides the index:** the benchmark `<Area>` and the subtitle's "vs index"
  chip are gated behind `timeRange !== "1D"` (a single daily index close can't draw
  an intraday line); the 1D series comes from `buildIntradaySeries` (see the
  `useDashboardHero` 1D branch above) and the tooltip shows HH:mm times.
- Left (currency) axis in P&L mode is still drawn for scale, calibrated so the
  percent lines aren't clipped. **The round step is picked in percent**:
  `niceTicks` runs over the *percent* extent (giving 0.5 / 1 / 2 / 5 … steps on
  the axis both lines actually plot on) and the left axis's money ticks are
  derived from it as `(pct / 100) × denom` — the inverse of the old order, which
  produced gridlines at 2.1% / 8.7%. The axis pad floor is `denom × 1%` for multi-range views
  but `denom × 0.1%` for `1D`, so a sub-1% intraday day fills the chart instead of
  collapsing into a sliver. Tooltip rows show **You (TWR)** / **You (MWR)**
  (`youLabel`, built once from `MEASURES` and reused by the legend dot's row —
  one label source, not a second string map) and the index (`benchmarkLabel`). The **You** row shows the
  money gained since the window start beside the percent — the hovered point's
  `valueUsd`/`valueTry` from `displayChartData` (already rebased to 0 at the
  window's first point), via `formatSignedCurrency` wrapped in `obfuscate`,
  then ` · ` and `formatSignedPercent(point.twrPct, DECIMALS.percentage)`. The index row stays
  percent-only (`formatSignedPercent`) — there is no "your money" amount for
  the benchmark line.
- **Headline (P&L mode)** = `formatSignedPercent(twrEnd, DECIMALS.percentage)`, colored by `twrColor`
  (`gainLossClass(twrEnd > 0)`, muted when exactly flat), followed by the period's
  money gain in a smaller inline span (`text-lg sm:text-xl md:text-2xl` vs the
  percent's `2xl…4xl`): `formatSignedCurrency(periodDeltaValue, currency)` wrapped
  in `obfuscate` — the same window-rebased delta the tooltip's "Now" row shows.
  It is colored by `periodColor` (its own sign, keyed off `delta.usd`), not
  `twrColor` — a mid-window deposit can flip the two signs apart. Its sub-label
  comes from
  `MEASURE_SUBLABELS[effectiveMeasure]` — TWR: "Growth vs market — time-weighted,
  deposits/withdrawals removed"; MWR: "Your money's growth — money-weighted,
  deposit timing included". The subtitle row shows the
  dollar lifetime **Total** P&L (+ %), the lifetime MWR chip (below), and the
  benchmark dropdown label (`benchmarkLabel` = `activeBenchmark.label` +
  `WHAT_IF_LABEL_SUFFIX` `" (same flows)"` under MWR, so the user can tell the grey
  line changed meaning) with `formatSignedPercent(benchmarkEnd, DECIMALS.percentage)` and the gap
  `({formatSignedPercent(gapPts, DECIMALS.percentageRate)} pts)` colored by `gapColor`
  (`gainLossClass(gapPts > 0)` — green when ahead of the market). An
  **"approximate"** badge renders next to the headline when `approximate` is true —
  which the hook never sets under MWR, so no extra gate is needed here. The row
  closes with the **`NET_INVESTED_LABEL`** amount ("Net invested" — the same
  string the Value subtitle, the dashed series and its tooltip row use).
  The benchmark chip carries a `SeriesDot`
  (`src/components/common/SeriesDot.tsx`, shared with Asset Detail's chart) in
  `BENCHMARK_STROKE`, and the
  measure sub-label carries one in `strokeColor`: those two dots ARE the chart
  legend (no separate legend row at any width). Chips are separated by
  `CHIP_SEPARATOR`, a `::before` middle dot on the FOLLOWING chip (a separator
  as its own flex child dangles at the end of a wrapped line) and only from
  `sm` up, where the subtitle is one line.
- **Lifetime MWR chip (P&L mode):** rendered in the subtitle right after the
  Total figure as `· MWR {formatSignedPercent(lifetimeXirrPct, DECIMALS.percentageRate)}{"/yr"}`
  (`MWR_LABEL` + `MWR_PER_YEAR_SUFFIX` from `lib/constants/returns.ts`, shared
  with the Portfolio summary bar and Asset Detail), colored by `xirrColor`
  (`gainLossToneClass`). The explainer is a `HintPopover`, not a bare
  `title` (a `title` never fires on touch) — it opens on hover *and* on tap. Rendered **only when
  `lifetimeXirrPct != null`** — no "—" placeholder, no fabricated 0. It is a
  percent, so it is deliberately **not** wrapped in `obfuscate`.
- **"Total" subtitle (P&L mode):** the dollar figure is rendered from the gross
  `totalPnlUsd`/`Try` props (usePnLSummary); colour/sign use
  `gainLossToneClass(totalPnlUsdNow)`. **No percent companion** — the peak-based
  `totalPnlPct` prop was removed (2026-08-28); the money-weighted % surfaces as
  the MWR chip here and as the Portfolio summary bar's cumulative MWR %. No
  after-tax figures are rendered or plumbed here — the engine's tax accrual
  surfaces only on the Portfolio page's taxed rows (component 8).

### MWR / XIRR measure (implementation contract)

The Performance mode's TWR | MWR measure switch (behavioral spec: measure toggle +
lifetime MWR chip) is built on a dedicated engine module:

- **`src/lib/xirr.ts`** — the **solver leaf module**, and the app's single
  money-weighted mathematical core. Imports nothing from `lib/performance.ts` or
  `lib/mwr.ts`, so both can depend on it without a cycle (the dependency graph is
  `config → xirr → performance → mwr`). Time convention: **ACT/365.25**, dates as
  `YYYY-MM-DD` at UTC midnight. Money is assembled as BigNumber; `.toNumber()`
  only at the iterative-search and result boundaries (the search needs
  `exp`/`pow`, which BigNumber can't express — same tradeoff `computeCAGR`
  makes). Exports `MS_PER_DAY`, `DAYS_PER_YEAR`, `yearsBetween`, the `XirrFlow`
  type, and:
  - `solveXirrLog1p(flows, terminalValueUsd, terminalDate): number | null` — the
    solver's **native** output, `s = ln(1+r)`, for the annual rate solving
    `Σ C_i·(1+r)^(−y_i) − V_end·(1+r)^(−Y) = 0` over real-dated USD flows
    (`XirrFlow = { date, amountUsd }`, positive = into the portfolio, matching
    `externalCashFlowUsd`). Time origin = the first non-zero flow (free: scaling
    every term by a constant power of (1+r) doesn't move the root).
    **Bracketed bisection in log space**, with the bracket **scaled by the solve's
    own horizon**: `s ∈ ±ln(EXTREME_TERMINAL_MULTIPLE) / horizonYears` where
    `EXTREME_TERMINAL_MULTIPLE = 1e4` and `horizonYears` is the furthest any term
    is discounted. Both halves matter. The log transform is what lets one bracket
    span every window length (an ordinary +50% day annualizes to `r ≈ 2e64`, past
    any linear bracket on `r`); scaling by the horizon is what lets the same
    solver serve a one-day snapshot pair and a five-year window — a **−10% day
    annualizes to `s ≈ −38.5`**, far below the fixed `ln(0.0001)` floor this
    module used before `subPeriodReturn` started calling it, while a fixed floor
    wide enough for the day would overflow `exp` on the five-year case. Two
    consequences fall out: every exponent evaluated is bounded by
    `ln(1e4)` so nothing overflows, and the representable range is the same
    *cumulative* range on every window. Returns `null` — never a fabricated 0 —
    when inputs are degenerate (no non-zero flows, span ≤ 0, every signed amount
    pointing the same way, e.g. a total loss) or the bracket holds no sign change
    / roots only on an edge. Inherits the standard XIRR caveat: sign-alternating
    flows can admit multiple roots; bisection returns the bracketed one.
  - `deannualizeLog1p(logGrowth, years): BigNumber` — `expm1(s · years)`, the
    cumulative fraction over a span. **Takes `s`, not `r`, on purpose**: a −10%
    day is `r = −1 + 1.9e-17`, which `1 + r` rounds straight back to 0 and prints
    −100% for the period. Always de-annualize from `solveXirrLog1p`; never from
    `solveXirr`'s annual rate.
  - `solveXirr(flows, terminalValueUsd, terminalDate): BigNumber | null` — thin
    wrapper returning `expm1(s)`, i.e. `r` itself. Use only where an **annualized**
    figure is the answer (the lifetime "%/yr" chip). Callers render "—" on null.
- **`src/lib/mwr.ts`** (pure, no React; Vitest-covered in `src/lib/mwr.test.ts`
  like `lib/performance.ts`). Holds the windowed/lifetime/what-if series builders
  over the solver above, and **re-exports `solveXirr` + the `XirrFlow` type** so
  existing callers and tests keep importing them from here.
  - `computeMWRSeries(snapshots, transactions, rates): MWRSeries` — same call
    shape and window semantics as `computeTWRSeries` (caller passes the window's
    snapshots plus the live "now" pseudo-snapshot; only `snapshot_date` +
    `total_usd` are read, defensively sorted ascending). Point *i* solves the
    XIRR of [window start → snapshot *i*] with the start snapshot's `total_usd`
    as an opening inflow at the start date and flows filtered by the same
    `(periodStart, periodEnd]` boundary convention as `subPeriodReturn` (a flow
    dated on the window-start date belongs to the opening value; one dated on
    the point counts); `cumulativePct` is the de-annualized cumulative
    `(1+r)^years − 1`, 0 at the first point. A point whose solve returns `null`
    **carries the previous point's `cumulativePct`** (neutral, like TWR's
    skipped periods). Returns `MWRSeries = { points: { date, cumulativePct }[],
    endPct, annualizedEndPct }`; `annualizedEndPct` is null for windows spanning
    < 1 year *and* when the last point had no solution.
  - `computeLifetimeXirrPct(transactions, rates, currentValueUsd, todayIso):
    number | null` — lifetime annualized XIRR from all external flows (V_start
    = 0) to the live value at `todayIso`; null when the first-flow→today span is
    < 1 year, there are no external flows, or there is no solution.
  - `computeWhatIfIndexMWRSeries(snapshots, transactions, rates,
    benchmarkSeries: BenchmarkPrice[]): MWRSeries` — simulates the same external
    flows into the benchmark: each flow buys/sells index units at the
    close-at-or-before its date (flows before the first available close use the
    first close), units accumulate through each snapshot date **inclusive**
    (mirroring a snapshot, which already contains that day's deposit), and the
    synthetic value = units × close-at-or-before; that series then runs through
    the same windowed MWR mechanics with the same flows. Only the snapshots'
    **dates** are read — their totals belong to the portfolio side. An
    empty/absent `benchmarkSeries` yields a zero series (points present, all 0)
    so the caller can draw a flat line or hide it. This is the MWR mode's
    benchmark line.
  - `closesAtOrBefore(series, targets)` is exported here too (the ascending
    two-pointer close lookup) so the hero overlay can drop its private twin
    instead of keeping two copies of the convention.
  - Shared machinery is **reused, not duplicated**, in both directions:
    `lib/performance.ts` exports `externalCashFlowUsd`, `collectPairedParentIds`
    and `sortSnapshotsAsc` for this module, and both modules solve through the
    same `lib/xirr.ts` leaf — `subPeriodReturn` uses it for each snapshot-pair
    period (which `computeTWRSeries` then chains), `mwrSeriesFromValues` for each
    window. There is no second money-weighted formula in the codebase; the
    Modified Dietz linear approximation `subPeriodReturn` used to run was retired
    in favour of this solver.
- **`useDashboardHero`** takes a `measure?: HeroMeasure` (`"twr" | "mwr"`, default
  `"twr"`; exported from the hook module) — meaningful only in pnl view, the 1D
  branch ignores it. Under `mwr` the hook fills `twrPct`/`twrEnd` from
  `computeMWRSeries` and `benchmarkPct`/`benchmarkEnd` from
  `computeWhatIfIndexMWRSeries` over the same `windowSnaps + now` snapshots the
  TWR path builds (the raw-index rebase is skipped), and forces
  `approximate = false`. **Field names were not renamed** — `twrPct`/`twrEnd`/
  `benchmarkPct`/`benchmarkEnd` carry whichever measure is active (doc-comments say
  so); a `leadPct` rename would also have to reach `lib/dashboard/intraday.ts`.
  The hook also returns `lifetimeXirrPct: number | null` from
  `computeLifetimeXirrPct`, and imports `closesAtOrBefore` from `@/lib/mwr`
  (its private copy is gone).
- **`DashboardHero.tsx`**: measure switch persisted as
  `dashboardHero.measure` (default `"twr"`), a small `MEASURES`-driven segmented
  control in the header row right of the Value|Performance tabs, rendered only
  when `viewMode === "pnl" && timeRange !== "1D"`; headline sub-label from
  `MEASURE_SUBLABELS`; tooltip lead row label follows the measure ("You (TWR)" /
  "You (MWR)") and the benchmark label gains `" (same flows)"` under MWR; the
  Total subtitle appends the lifetime MWR chip ("+X.X%/yr") when
  `lifetimeXirrPct` is non-null (percent — stays visible under obfuscation).

## Notes & gotchas

- **Render formatting / colors:** `gainLossClass`, `formatSignedCurrency`,
  `formatSignedPercent`, `formatCurrency` from `@/lib/prices` — canonical
  emerald-600 / red-500; losses carry an ASCII minus, gains and zero render
  bare (no "+" anywhere — colour carries direction). Don't hand-roll. (Known
  deviation: `TopMovers` still uses inline `text-emerald-600`/`text-red-500`.)
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
- **Color maps are component-local:** `CATEGORY_COLORS` + `CURRENCY_COLORS`
  (AllocationChart), `CURRENCY_COLORS` (CurrencyBreakdown — a *different*,
  non-green palette for the native-currency card), and platform color (from the
  snapshot's `by_platform[].color`) all live locally. The two `CURRENCY_COLORS`
  maps intentionally differ: the allocation donut uses a green→teal→cyan ramp so
  the fiat currencies read as one cash block, while the Currencies card uses
  distinct hues. Consolidate into `@/lib/constants` if they grow.
- **Top movers ≠ 24h movers:** the label says "Top Movers" but the figure is
  lifetime unrealized P&L (no intraday price history exists). Movers are
  **USD-only** even under the TRY toggle.
- **Empty/loading gating:** page shows skeletons while `useDashboard().loading ||
  usePnLSummary().loading`; the no-assets state keys off
  `byAllocation.length === 0 && byPlatform.length === 0`. The hero independently
  guards `chartData.length >= 2` for its "not enough data" placeholder.
- **Charts are lazy:** `DashboardHero` and `AllocationChart` import through
  `LazyChart.tsx`; they must stay default-exported for `React.lazy`.
