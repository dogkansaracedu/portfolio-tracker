# Portfolio daily/total return toggle — Design

**Date:** 2026-06-03
**Status:** Approved — engine consolidation landed (commit `0312253`, money-weighted
P&L). Reconciled against the unified engine; ready to plan.

## Dependencies & conventions

This feature is **P&L-adjacent and builds on the single, money-weighted P&L
engine** (`docs/pnl-methodology.md`) — it does not introduce a parallel
computation. P&L has historically been the app's worst bug source because
Dashboard and Portfolio computed it separately and diverged; everything now
flows through one definition.

The unified engine, as it actually exists now:
- **Canonical Total P&L = `current value − net invested capital`, in USD**
  (`summarizePnLTotals`, `src/lib/pnl/totals.ts`). Net invested =
  `computeCurrentInvestedUsd(transactions, rates)` (`src/lib/performance.ts`),
  which folds the per-transaction cash-flow logic in the private
  `applyTxToInvested`.
- **Per-asset P&L** comes from `usePnL(holdings, prices)` → `assetPnLs`
  (`AssetPnL.currentValueUsd`, etc.). Fiat carries real FX P&L (cost basis = net
  USD deployed into that currency). `usePnL` also **already returns
  `transactions` and `rates`**, so consumers don't need a second data source.

How this feature reuses it (no duplicate math):
- **Daily return = ΔP&L over the day = Δ(value − invested).** Because the total
  is money-weighted, the one-day change is exactly `(value_now − invested_now) −
  (value_prev − invested_prev)`. We reuse `computeCurrentInvestedUsd` for the
  "invested" side (passing only the period's transactions yields the period's net
  cash deployed) and the snapshot for the "value" side. **No new cash-flow
  helper** — `computeCurrentInvestedUsd` is the canonical primitive.
- **Fiat FX is included for free:** a fiat holding's USD value moves with the
  rate, so `value_now − value_prev − periodInvested` captures its daily FX swing,
  exactly as the headline now does. No fiat special-case.
- **The formula lives in the shared P&L layer** as a pure function
  (`src/lib/pnl/daily.ts`), consumable by any page; `usePortfolio` assembles the
  inputs (it already assembles value at both asset and platform granularity) and
  *calls* the formula.
- **Sketchy edges are noted, not fixed** (see Risks: the sold-out-position
  reconciliation gap).

## Problem

On the Portfolio page, each group section header (`PortfolioGroupHeader`) shows
the group's total value plus its **total return** — `totalPnlUsd`, the sum of
each asset's unrealized P&L (current value − cost basis). Per-asset rows show the
same total-return figure in the P&L column. There is no way to see how the
portfolio moved **today**. We want a toggle that switches the return figure
(on both the group headers and the asset rows) between **Total return** and
**Daily return**.

## Goals

- A **Total | Daily** toggle on the Portfolio page that switches the return
  figure shown on both group section headers and individual asset rows.
- **Daily return** = the money-weighted gain/loss since the previous snapshot
  (normally yesterday's close), correctly excluding cash deployed during the
  period so a same-day buy contributes only its price *movement*, not its
  principal.
- Show both the **dollar amount and the percent** for daily return (matching how
  the asset rows already show amount + percent for total return).
- Reuse the unified engine: `computeCurrentInvestedUsd` for cash flow, `usePnL`
  for per-asset value, the previous snapshot for prior value. No new financial
  model, no duplicate math.
- Break nothing: total return stays the exact default behavior.

## Non-goals (YAGNI)

- The top **summary bar** (`PortfolioSummaryBar`) is unchanged — it stays the
  lifetime total. The toggle only affects group headers and asset rows.
- **No persistence** of the toggle choice. It is `useState` in `usePortfolio`,
  matching `groupBy`/`sortBy` (which also reset on reload). localStorage can be a
  trivial follow-up if wanted.
- No new time-range selector. "Daily" means "since the previous snapshot,"
  period. (When snapshots have a gap, that is honestly "since the last
  snapshot" — see Edge cases.)
- Currency: daily figures render in **USD**, matching the current USD-only P&L
  column. Not wired to the USD/TRY display toggle in this pass.

## The model

### Daily-return definition (per asset, over the period since the previous snapshot)

```
dailyReturnUsd = currentValueUsd − prevSnapshotValueUsd − periodInvestedUsd
dailyReturnPct = denom <= 0 ? null : dailyReturnUsd / denom × 100
  where denom = prevSnapshotValueUsd + periodInvestedUsd
```

- `currentValueUsd` — the asset's `currentValueUsd` from `usePnL`'s `assetPnLs`
  (the same value the page/headline already use), surfaced via `EnrichedAsset`.
- `prevSnapshotValueUsd` — the asset's frozen `value_usd` from the snapshot
  **before the latest** (`snapshots[length - 2]`), summed across platforms. `0`
  if the asset was not held at that snapshot (i.e. bought today). We read the
  stored `by_asset[].value_usd` directly here — unlike the *latest* snapshot
  (where `usePnL` deliberately uses price×live-balance), the previous snapshot's
  frozen value *is* exactly "yesterday's close value," which is what we want.
- `periodInvestedUsd` — net USD cash deployed into the asset since the previous
  snapshot = `computeCurrentInvestedUsd(periodTxs, rates)`, where `periodTxs` are
  the asset's transactions whose date is **after** the previous snapshot's
  `snapshot_date` (same `date.slice(0,10) > cutoff` rule `computePnLTimeSeries`
  uses at `performance.ts:605-607`). `computeCurrentInvestedUsd` already nets
  buys/fees/sells/dividends/transfers and cash-leg pairings — reused verbatim,
  just fed the period slice.

This equals **ΔP&L over the period**: `(value_now − invested_now) −
(value_prev − invested_prev)` — the canonical money-weighted P&L (totals.ts)
applied across one day. Same definition the Dashboard hero uses for its period
P&L delta, so the two pages stay consistent by construction. Because the total
is money-weighted, **fiat FX shows up in daily return automatically** (a fiat
holding's USD value moved while no cash was deployed → that's its daily P&L).

#### Why subtracting cash is correct (worked examples)

- **Bought 1 share at $210 today, now $220:** `220 − 0 − 210 = +$10` (4.76% on
  the $210 deployed). The intraday gain on a same-day buy is counted, measured
  from the purchase price.
- **Held 10 from yesterday (closed $200), now $210, no trades:**
  `2100 − 2000 − 0 = +$100`.
- **Held 10 (closed $200), now $210, bought 5 more today at $205:**
  `3150 − 2000 − 1025 = +$125` = old 10 gaining $10 each ($100) + new 5 gaining
  $5 each from the $205 buy ($25).

Subtracting cash removes principal, leaving only price movement.

### Aggregation to groups

Each `AssetGroup` sums its **displayed** assets' `dailyReturnUsd`, preserving the
page's existing invariant that *the group header equals the sum of its visible
rows*. The group percent is computed from group totals:
`groupDailyPct = groupDenom <= 0 ? null : groupDailyUsd / groupDenom × 100`,
where `groupDenom = Σ (prevSnapshotValueUsd + periodInvestedUsd)` over the
group's displayed assets (reusing the same `dailyReturnPct` guard helper).

When grouped by **platform**, both `prevSnapshotValueUsd` and `periodInvestedUsd`
are scoped per `(ticker, platform)` so the per-platform daily figure is correct
(prev value from the prev snapshot's per-`(ticker, platform)` `by_asset` entry;
`periodTxs` filtered to that holding's `platform_id`). This mirrors exactly how
the existing `groupBy === "platform"` branch already rescopes value and P&L.

### Edge cases

- **No previous snapshot** (zero or one snapshot total): daily return is
  unavailable. `dailyReturnAvailable = false`; headers and rows render `—` in
  daily mode. The toggle still works (switches the label/empty state).
- **Asset bought today** (absent from the previous snapshot): `prevValue = 0`,
  `netCash = +cost`, so `dailyReturnUsd = currentValue − cost` (its intraday
  move) and `denom = cost`. Correct.
- **Denominator ≤ 0** (degenerate — only reachable by a partial sale of a
  position that ran up sharply intraday, or a zero-base asset): the dollar figure
  is still correct; the **percent renders `—`** (not `0%`, which would falsely
  read as flat). This is the same divide-by-zero defensiveness already used at
  `usePortfolio.ts:312`, `:439`, and `useDashboard.ts:115`.

## Code changes

### New: `src/lib/pnl/daily.ts` (the shared formula)
The only new math, kept as pure BigNumber functions in the P&L layer so any page
can reuse them:

```ts
import type BigNumber from "bignumber.js"

// Day's % return on the capital at work; null when there's no sensible base
// (denom <= 0) — same divide-by-zero guard used across the P&L code.
export function dailyReturnPct(
  returnUsd: BigNumber,
  denomUsd: BigNumber,
): BigNumber | null

export interface DailyReturnInput {
  currentValueUsd: BigNumber
  prevValueUsd: BigNumber
  periodInvestedUsd: BigNumber
}
export interface DailyReturn {
  dailyReturnUsd: BigNumber   // currentValue − prevValue − periodInvested
  denomUsd: BigNumber         // prevValue + periodInvested (carried for rollups)
  dailyReturnPct: BigNumber | null
}
export function computeDailyReturn(input: DailyReturnInput): DailyReturn
```

`computeDailyReturn` is used at **both** the asset-rollup and the per-`(asset,
platform)` granularity; group rollups sum `dailyReturnUsd`/`denomUsd` and call
`dailyReturnPct(Σreturn, Σdenom)`. One formula, one guard — no duplication.
(Extension path: if the Dashboard later wants per-asset daily change, it assembles
the same three inputs and calls `computeDailyReturn`.)

### `src/hooks/usePortfolio.ts`
- Get `transactions` and `rates` from **`usePnL`'s existing return** (it already
  surfaces them — line 304) rather than adding another `useTransactionData()`
  call. Destructure the tx-rates array as `rates: txRates` to avoid colliding with
  the `usePrices()` `rates` already used for `usdTryRate`.
- Add `returnMode: ReturnMode` via `useState<ReturnMode>("total")` plus
  `setReturnMode`, mirroring `groupBy`/`sortBy`.
- Build `prevSnapshotLookups` from `snapshots[snapshots.length - 2]`, parallel to
  the existing `snapshotLookups`: per-ticker (summed) and per-`(ticker, platform)`
  maps of the frozen `value_usd` straight from `by_asset[].value_usd`.
  `dailyReturnAvailable = snapshots.length >= 2 && prevSnapshot?.breakdown?.by_asset != null`.
  `prevSnapshotDate = prevSnapshot.snapshot_date`.
- Pre-bucket `transactions` once into `Map<asset_id, Transaction[]>` and
  `Map<"asset_id|platform_id", Transaction[]>` (mirrors `usePnL`'s
  `groupByAssetPlatform` and the existing `holdingsByAsset` pattern), each filtered
  to `date.slice(0,10) > prevSnapshotDate`.
- Per `EnrichedAsset` (asset rollup), compute via `computeDailyReturn`:
  - `currentValueUsd` = the asset's value (already in the enrichment),
    `prevValueUsd` = per-ticker prev-snapshot value (0 if absent),
    `periodInvestedUsd = computeCurrentInvestedUsd(assetPeriodTxs, txRates)`.
  - Store `dailyReturnUsd: number`, `dailyReturnPct: number | null`,
    `dailyDenomUsd: number` (`.toNumber()` at the boundary, like the other fields).
  - When `dailyReturnAvailable` is false → `dailyReturnUsd = 0`,
    `dailyReturnPct = null`, `dailyDenomUsd = 0` (rendered as `—`).
- In the `groupBy === "platform"` branch, recompute the daily figures per
  `(ticker, platform)`: `currentValueUsd = platformValueUsd` (already computed
  there), `prevValueUsd` from the per-`(ticker, platform)` prev-snapshot entry,
  `periodInvestedUsd = computeCurrentInvestedUsd(platformPeriodTxs, txRates)` —
  same `computeDailyReturn` call.
- Each `AssetGroup` gains `dailyReturnUsd` (Σ of its assets') and `dailyReturnPct`
  (`dailyReturnPct(Σ dailyReturnUsd, Σ dailyDenomUsd)`), computed in the same group
  loops that already sum `totalPnlUsd`.
- Return `returnMode`, `setReturnMode`, and `dailyReturnAvailable` from the hook.

### Type changes (`src/hooks/usePortfolio.ts`)
- `EnrichedAsset`: add `dailyReturnUsd: number`, `dailyReturnPct: number | null`,
  `dailyDenomUsd: number`.
- `AssetGroup`: add `dailyReturnUsd: number`, `dailyReturnPct: number | null`.
- Add `export type ReturnMode = "total" | "daily"`.
- `UsePortfolioReturn`: add `returnMode`, `setReturnMode`, `dailyReturnAvailable`.

### `src/lib/constants/portfolio.ts` (new — no hardcoded strings)
- New file (no portfolio constants file exists today). Add
  `RETURN_MODE_LABELS: Record<ReturnMode, string>` (`{ total: "Total", daily:
  "Daily" }`) and the daily column header label `RETURN_COLUMN_LABEL_DAILY =
  "Today"`. Optionally move the `SORT_LABELS` map currently inlined in
  `PortfolioFilters.tsx:13-17` here while editing that file (opportunistic
  cleanup, not required).

## UI changes

### `src/components/portfolio/PortfolioFilters.tsx`
- Add a **Total | Daily** `ToggleGroup` (`variant="outline" size="sm"`, single
  select, same guarded `onValueChange` pattern as the group-by toggle) before or
  after the group-by control. New props: `returnMode`, `onReturnModeChange`.

### `src/pages/PortfolioPage.tsx`
- Destructure `returnMode`, `setReturnMode`, `dailyReturnAvailable` from
  `usePortfolio`; pass `returnMode`/`onReturnModeChange` to `PortfolioFilters`
  and `returnMode` (+ `dailyReturnAvailable`) to `PortfolioTable`.

### `src/components/portfolio/PortfolioTable.tsx`
- Accept `returnMode` (+ `dailyReturnAvailable`); thread to `PortfolioGroupHeader`
  and `PortfolioRow`. Change the desktop column header **"P&L" → "Today"** when
  `returnMode === "daily"`.

### `src/components/portfolio/PortfolioGroupHeader.tsx`
- Accept `returnMode`. In `total` mode render `group.totalPnlUsd` (unchanged). In
  `daily` mode render `group.dailyReturnUsd` + `group.dailyReturnPct` (when
  available) using `formatSignedCurrency`/`formatSignedPercent`/`gainLossClass`;
  render `—` when daily is unavailable or the pct is `null`. Currency obfuscated
  via the existing `o(...)`; percent stays visible (canonical gain/loss
  handling).

### `src/components/portfolio/PortfolioRow.tsx` (desktop row + mobile card)
- Both `PortfolioRow` and `PortfolioRowCard` accept `returnMode`. The P&L cell
  switches: `total` mode shows `asset.unrealizedPnlUsd` + `unrealizedPnlPct`
  (unchanged); `daily` mode shows `asset.dailyReturnUsd` + `dailyReturnPct`
  (or `—`). Color from `gainLossClass(dailyReturnUsd >= 0)`. Reuses the existing
  `formatSignedCurrency`/`formatSignedPercent` + `o(...)` exactly as the
  total-mode rendering does.

## Rollout

1. Add `src/lib/pnl/daily.ts` (`computeDailyReturn` + `dailyReturnPct`).
2. Add the constants (`RETURN_MODE_LABELS`, daily header label).
3. Extend `usePortfolio` types + compute daily return per asset and per group
   (reusing `computeCurrentInvestedUsd` + `computeDailyReturn`); add `returnMode`
   state and `dailyReturnAvailable`.
4. Add the toggle to `PortfolioFilters`; thread `returnMode` through
   `PortfolioPage` → `PortfolioTable` → header/rows.
5. Render daily vs total in the header, desktop row, and mobile card; relabel the
   column header.
6. Push to prod (project's standard commit → push → verify-on-live loop).

## Risks / mitigations

- **Snapshot gaps make "daily" span multiple days.** Honest and bounded: the
  baseline is the previous snapshot, and the `periodTxs` filter covers exactly
  the same window, so the figure stays internally correct ("since last
  snapshot"). Daily snapshots are the norm (auto-refresh + cron), so this is rare.
- **Today's snapshot already reflects today's buys.** Intended: `currentValueUsd`
  includes them, and subtracting `periodInvestedUsd` removes the principal,
  leaving only movement. Consistent by construction.
- **Divide-by-zero / negative denominator.** Guarded in `dailyReturnPct` →
  percent shows `—`, dollar figure stays correct. Same pattern as existing code.
- **NOTED EDGE (not fixed): sold-out-today positions.** The portfolio page only
  renders current holdings (`totalBalance > 0`), so an asset fully sold *during
  the period* is not a row and is excluded from the page's daily-return sum — yet
  it *did* contribute to the portfolio-wide day change the Dashboard hero shows.
  Result: on a day you fully exit a position, the sum of the portfolio page's
  daily-return rows can differ slightly from the hero's 1D delta. This is
  consistent with how the page already treats Total P&L (it also omits sold-out
  positions' realized gains from the visible rows), so we **leave it as-is and
  note it** rather than special-casing — flagged here per the "note, don't fix"
  convention.
- **No extra data dependency.** `transactions`/`rates` come from `usePnL`'s
  existing return, so there's no new fetch or context wiring.

## Verification

- Toggle flips every group header and asset row between total and daily return;
  default is Total (current behavior unchanged).
- On a no-trade day, an asset's daily return equals `qty × (today − yesterday
  price)` and the group header equals the sum of its rows.
- An asset bought today shows daily return measured from its purchase price
  (e.g. buy at 210, price 220 → +$10), not its full principal.
- With only one snapshot (or none), daily mode renders `—` everywhere and the
  toggle still switches cleanly.
- Obfuscation still hides currency amounts; percents remain visible; gain/loss
  colors follow the canonical palette.
