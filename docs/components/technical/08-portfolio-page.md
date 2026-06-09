# Component 8: Portfolio Page — Technical (this build)

> Layer: React/Vite/Supabase implementation. Contract → [../08-portfolio-page.md](../08-portfolio-page.md)

## Stack

- React 19 + Vite + TypeScript; Tailwind 4 + shadcn/ui (`Table`, `ToggleGroup`,
  `Input`, `Select`, `Card`, `Button`).
- BigNumber.js for all money/quantity math (`bn`, `BN_ZERO`, `BN_HUNDRED` from
  `@/lib/config`); `.toNumber()` only at the render boundary.
- Data via React Context + hooks (no react-query). Snapshots/prices/holdings come
  through shared context-backed hooks; this page never fetches per-mount.
- Display state (`currency`, `obfuscated`) from `DisplayContext`; the
  record-transaction modal from `TransactionContext`.

## File map

- `src/pages/PortfolioPage.tsx` — page shell. Pulls everything from
  `usePortfolio`, renders summary bar → filters → table; threads `returnMode` +
  `dailyReturnAvailable` to the table and `returnMode`/`onReturnModeChange` to the
  filters. (Note: no `AssetDetailSheet` — it was deferred and never built.)
- `src/components/portfolio/PortfolioTable.tsx` — desktop `Table` + mobile card
  list; renders group sections; swaps the return column header label
  (`RETURN_COLUMN_LABEL_TOTAL` "P&L" ↔ `RETURN_COLUMN_LABEL_DAILY` "Today");
  `COL_COUNT = 9`.
- `src/components/portfolio/PortfolioGroupHeader.tsx` — full-width subtotal row;
  picks `group.totalPnlUsd` (total) vs `group.dailyReturnUsd` + `dailyReturnPct`
  (daily); renders "—" when `!dailyReturnAvailable`. In **Total** mode, when
  `group.totalTaxAccrualUsd > 0` the headline is `groupNet = totalPnlUsd −
  totalTaxAccrualUsd` with a muted `gross {totalPnlUsd}` suffix; daily stays gross.
- `src/components/portfolio/PortfolioRow.tsx` — exports **both** the desktop
  `PortfolioRow` and the mobile `PortfolioRowCard`; each picks
  `unrealizedPnlUsd`/`unrealizedPnlPct` (total) vs `dailyReturnUsd`/`dailyReturnPct`
  (daily). In **Total** mode, taxed rows (`asset.taxAccrualUsd > 0`) show
  `netUsd = returnUsd − taxAccrualUsd` as the headline (percent recomputed over
  `costBasisUsd`), with a muted `gross … · −… tax` annotation (desktop) / `· gross …`
  suffix (mobile). Shared `CurrentPrice` + `formatQuantity` helpers; asset cell links
  to `/transactions/edit/:assetId`. The desktop row also renders nested fund
  children (chevron + recursive `nested` render — see the funds-nested-under-fiat
  entry below).
- `src/components/portfolio/PortfolioSummaryBar.tsx` — lifetime cards (value, P&L
  with unrealized/realized split, held count). **No `returnMode` prop** — by
  construction unaffected by the toggle. Takes `totalTaxAccrualUsd`; the P&L
  **headline** shows `netPnl = totalPnlUsd − totalTaxAccrualUsd` with a muted
  `gross … · −… tax` line when taxed. The unrealized/realized split stays gross.
- `src/components/portfolio/PortfolioFilters.tsx` — search `Input`, the
  **Total | Daily** `ToggleGroup`, the group-by `ToggleGroup` (Tag/Platform/
  Category — `GroupBy = "platform" | "category" | "tag"`, no `currency` axis), and
  the sort `Select` (`SORT_LABELS` inlined here).
- **Funds-nested-under-fiat** (replaces the deleted `CurrencyHoldings.tsx` card):
  - `nestFundsUnderFiat(assets)` in `src/lib/portfolio/grouping.ts` lifts every
    `category === "fund"` asset out of the top level and attaches it to the
    matching fiat row as `children`: it buckets funds by `assetNativeCurrency(a)`,
    then for each `fiat` asset whose `ticker` matches a currency bucket pushes
    `{ ...a, children }`. Orphan funds (no matching fiat row) are re-appended as
    top-level rows so they never disappear. Returns the input unchanged when there
    are no funds.
  - `EnrichedAsset.children?: EnrichedAsset[]` (`src/hooks/usePortfolio.ts`) holds
    the nested funds; `usePortfolio`'s `nestedAssets` memo calls
    `nestFundsUnderFiat(enrichedAssets)` **only** when `groupBy !== "platform"`
    (`groupBy === "platform"` passes `enrichedAssets` through unchanged) — the
    nesting is a currency view that doesn't compose with the platform axis.
  - `PortfolioRow.tsx` renders children recursively: `const childRows =
    asset.children ?? []`, a `useState(hasChildren)` chevron (`ChevronDown`/
    `ChevronRight`, default-open), and after the parent's `TableRow` it maps
    `childRows` back through `<PortfolioRow … nested />`. The `nested` prop adds
    `pl-6` indentation (and a spacer where a leaf child has no chevron). The mobile
    `PortfolioRowCard` does **not** recurse into children (cards stay flat).
  - `rollupGroup` (same file) iterates `a.children ? [a, ...a.children] : [a]` so
    nested children are summed into the group's value/`totalPnlUsd`/
    `totalTaxAccrualUsd`/daily totals — the header stays equal to the sum of every
    visible row. Per child the after-tax figure reuses the row's
    `unrealizedPnlUsd − taxAccrualUsd` (rendered in `PortfolioRow`, no new math).
- `src/hooks/usePortfolio.ts` — the engine (below).
- `src/lib/constants/portfolio.ts` — `RETURN_MODE_LABELS` (`{ total: "Total",
  daily: "Daily" }`), `RETURN_COLUMN_LABEL_TOTAL = "P&L"`,
  `RETURN_COLUMN_LABEL_DAILY = "Today"`.
- `src/lib/pnl/daily.ts` — pure `computeDailyReturn(input)` + `dailyReturnPct(return,
  denom)` guard; the only new math, kept in the shared P&L layer.

### `usePortfolio.ts` specifics

- Composes `useAssets` + `useHoldings` + `usePrices` + `useSnapshots` + `usePnL`.
  `transactions` and `rates` (destructured `rates: txRates` to avoid colliding
  with `usePrices().rates`) come from `usePnL`'s existing return — no extra fetch.
- `returnMode` is `useState<ReturnMode>("total")` (alongside `search`/`groupBy`/
  `sortBy`); `ReturnMode = "total" | "daily"`. Not persisted.
- `snapshotLookups` (latest = `snapshots[len-1]`): per-ticker and per-(ticker,
  platform) `price_usd` maps + a snapshot-recorded `usd_try` fallback. Value =
  `bnBalance.times(snapshotPrice)`, falling back to the live price when the
  snapshot lacks the ticker.
- `dailyReturnLookups` (baseline via `pickBaselineSnapshot(snapshots, homeDayIso())` —
  the most recent snapshot dated **before today**, home-local; robust before today's
  snapshot is written and across gaps, not `snapshots[len-2]`): `available =
  !!prev?.breakdown?.by_asset` → drives `dailyReturnAvailable`. Reads the baseline
  snapshot's **frozen** `value_usd` per ticker (summed) and per (ticker, platform).
  Period capital: buckets `transactions` with `homeDayIso(new Date(tx.date)) > prevDate`
  (home-local day, not `date.slice(0,10)`) into per-asset and per-(asset, platform)
  maps, then `computeCurrentInvestedUsd(txs, txRates)` each.
- Per `EnrichedAsset`: `computeDailyReturn({ currentValueUsd, prevValueUsd,
  periodInvestedUsd })`; stores `dailyReturnUsd`, `dailyReturnPct: number | null`,
  `dailyDenomUsd`. When `!available` → `0 / null / 0`.
- `groupBy === "platform"` branch re-scopes per (ticker, platform): platform value
  from the per-(ticker, platform) snapshot entry × that holding's balance, prev
  value from the prev snapshot's per-(ticker, platform) entry, period capital from
  txs filtered to `platform_id` — same `computeDailyReturn` call.
- Group rollups (`AssetGroup`) sum `dailyReturnUsd` + `dailyDenomUsd` over the
  group's assets in the **same loop** that sums `totalPnlUsd`, then
  `dailyReturnPct(Σreturn, Σdenom)` → `dailyReturnPct: number | null`. The same loop
  sums `taxAccrualUsd` → `totalTaxAccrualUsd` (group-level after-tax).
- After-tax wiring (view-model only, no new money math — reuses the engine's
  `taxAccrualUsd`): `enrichAsset` copies `pnl?.taxAccrualUsd` to
  `EnrichedAsset.taxAccrualUsd`; `scopeAssetToPlatform` uses the matched
  `hp.taxAccrualUsd` (per-(asset, platform), **not** the spread asset-level value) so
  platform grouping doesn't double-count. The hook exposes the engine's
  `totalTaxAccrualUsd` (BigNumber → number).
- Totals: `totalPnlUsd`/`totalPnlPct` via `summarizePnLTotals` (shared with the
  dashboard — money-weighted value − net invested).

### `daily.ts` signatures

```ts
function computeDailyReturn(input: {
  currentValueUsd: BigNumber
  prevValueUsd: BigNumber
  periodInvestedUsd: BigNumber
}): { dailyReturnUsd: BigNumber; denomUsd: BigNumber; dailyReturnPct: BigNumber | null }

function dailyReturnPct(returnUsd: BigNumber, denomUsd: BigNumber): BigNumber | null
//   denomUsd.lte(0) → null  (callers render "—")
```

Used at both asset and (asset, platform) granularity; group rollups reuse
`dailyReturnPct` on summed inputs. One formula, one guard — no duplication.

## Notes & gotchas

- **Render formatting / colors:** all return cells use `gainLossClass`,
  `formatSignedCurrency`, `formatSignedPercent` from `@/lib/prices` — canonical
  emerald-600 / red-500, ASCII minus, no sign at zero. Do not hand-roll.
- **Obfuscation:** wrap currency strings in `o(v) = obfuscate(v, obfuscated)`;
  **percent is never obfuscated** (intentional). Applies to value, return amount,
  and subtotals.
- **Divide-by-zero:** `dailyReturnPct` returns `null` when `denom ≤ 0` → percent
  renders "—" while the dollar amount still shows. Mirrors the existing
  `costBasisUsd.isZero()` / allocation guards.
- **Frozen-vs-live asymmetry:** latest snapshot → price × **live** balance (so a
  fresh tx updates Value instantly); previous snapshot → frozen `value_usd` (that
  *is* yesterday's close). Don't "fix" this into symmetry.
- **`usd_try` fallback** for the prev/latest snapshot comes from the snapshot's
  recorded rate, never the live rate — retro-converting old snapshots at today's
  rate would corrupt history.
- **Held filter:** rows are filtered to `totalBalance > 0`, and platform holdings
  to `balance > 0`, matching snapshot semantics so the platform view never renders
  empty positions and rollups match the dashboard.
- **NOTED EDGE (not fixed): sold-out-today positions.** A position fully exited
  during the period has no row (`totalBalance > 0` filter), so the visible
  daily-return rows can sum to slightly less than the dashboard hero's 1D delta on
  an exit day. Consistent with how lifetime return already omits sold-out
  positions; left as-is per "note, don't fix."
- **Daily figures are USD-only** (the return column is USD even when the display
  toggle is TRY) — matches the existing P&L column; not wired to the currency
  toggle in this pass.
- **`AssetDetailSheet` was deferred and never built** — there is no sheet/detail
  drill-down; the asset cell links to the transactions edit route instead. (The
  old spec listed it as optional; it does not exist.)
