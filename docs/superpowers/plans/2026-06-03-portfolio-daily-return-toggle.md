# Portfolio Daily/Total Return Toggle — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Total | Daily toggle on the Portfolio page that switches the return figure on group section headers and asset rows between lifetime Total P&L and money-weighted daily return.

**Architecture:** Daily return = ΔP&L over the day = `currentValue − prevSnapshotValue − periodInvested`, i.e. the canonical money-weighted Total P&L (`lib/pnl/totals.ts`) applied across one day. One new pure formula (`src/lib/pnl/daily.ts`) reused at asset + (asset,platform) granularity; `usePortfolio` assembles inputs from `usePnL` (per-asset value + transactions), `computeCurrentInvestedUsd` (period cash flow), and the previous snapshot (prior value). UI threads a `returnMode` state through the existing Portfolio components.

**Tech Stack:** React + Vite + TypeScript, Tailwind + shadcn/ui, bignumber.js for money math. Spec: `docs/superpowers/specs/2026-06-03-portfolio-daily-return-toggle-design.md`.

---

## Project conventions (READ FIRST — they override the generic skill defaults)

- **No test suite.** This repo has no tests and no local dev server. "Verify" = run `npm run typecheck` (fast, `tsc --noEmit`) after each task, and `npm run build` + `npm run lint` at the end. Behavior is verified on **live prod** after deploy.
- **Deploy is a handoff.** Commits land on the current branch. Do **not** run `npm run deploy` / `vercel --prod` yourself — prepare everything and hand the user the command.
- **Money math uses `bn`/BigNumber** (`@/lib/config`); convert to `number` only at the render/return boundary (`.toNumber()`).
- **No hardcoded UI strings** — labels go in a constants file.
- **Gain/loss styling** uses `gainLossClass` / `formatSignedCurrency` / `formatSignedPercent` from `@/lib/prices` (emerald-600 / red-500, ASCII minus, zero = no sign).
- **Reuse, don't duplicate.** The daily math reuses `computeCurrentInvestedUsd` and the new `computeDailyReturn`; do not re-derive value/cost-basis anywhere.

---

## File Structure

- **Create** `src/lib/pnl/daily.ts` — pure money-weighted daily-return formula + percent guard. One responsibility: the daily-return math, reusable by any page.
- **Create** `src/lib/constants/portfolio.ts` — Portfolio page UI string constants (return-mode labels, return column headers).
- **Modify** `src/hooks/usePortfolio.ts` — add `ReturnMode` type + `returnMode` state; compute per-asset and per-group daily return; expose `dailyReturnAvailable`.
- **Modify** `src/components/portfolio/PortfolioFilters.tsx` — add the Total | Daily toggle.
- **Modify** `src/pages/PortfolioPage.tsx` — wire `returnMode` to filters + table.
- **Modify** `src/components/portfolio/PortfolioTable.tsx` — thread `returnMode`/`dailyReturnAvailable`; relabel the return column.
- **Modify** `src/components/portfolio/PortfolioGroupHeader.tsx` — render daily vs total on the group header.
- **Modify** `src/components/portfolio/PortfolioRow.tsx` — render daily vs total on the desktop row and the mobile card.

---

## Task 1: Daily-return formula (`src/lib/pnl/daily.ts`)

**Files:**
- Create: `src/lib/pnl/daily.ts`

- [ ] **Step 1: Create the file with the pure formula + guard**

```ts
import type BigNumber from "bignumber.js"
import { BN_HUNDRED } from "@/lib/config"

/**
 * Day's % return on the capital that was at work during the period.
 *
 * Returns `null` when there's no sensible base (denominator <= 0) — e.g. a
 * fully netted-out / zero-base position — so callers render "—" instead of a
 * misleading 0% / NaN / huge number. Mirrors the divide-by-zero guards used
 * throughout the P&L code (e.g. usePnL `costBasisUsd.isZero()`).
 */
export function dailyReturnPct(
  returnUsd: BigNumber,
  denomUsd: BigNumber,
): BigNumber | null {
  if (denomUsd.lte(0)) return null
  return returnUsd.div(denomUsd).times(BN_HUNDRED)
}

export interface DailyReturnInput {
  /** Current USD value of the asset (or holding). */
  currentValueUsd: BigNumber
  /** USD value at the previous snapshot ("yesterday's close"). 0 if not held then. */
  prevValueUsd: BigNumber
  /**
   * Net USD cash deployed into it since the previous snapshot (buys/fees add,
   * sells/dividends subtract, transfers net out). Produced by
   * `computeCurrentInvestedUsd(periodTxs, rates)`.
   */
  periodInvestedUsd: BigNumber
}

export interface DailyReturn {
  /** Money-weighted day P&L = currentValue − prevValue − periodInvested. */
  dailyReturnUsd: BigNumber
  /**
   * Base the percentage is taken on = prevValue + periodInvested. Carried so a
   * group rollup can sum denominators and call `dailyReturnPct(Σreturn, Σdenom)`.
   */
  denomUsd: BigNumber
  dailyReturnPct: BigNumber | null
}

/**
 * Money-weighted daily return: the canonical Total P&L definition
 * (value − net invested, see `lib/pnl/totals.ts`) applied over a single day.
 *
 * Subtracting the period's deployed cash removes principal, leaving only price
 * movement — including the intraday move on a position opened today, measured
 * from its purchase price. Pure; used at both asset and (asset, platform)
 * granularity, and its `denomUsd` lets group rollups reuse `dailyReturnPct`.
 */
export function computeDailyReturn(input: DailyReturnInput): DailyReturn {
  const dailyReturnUsd = input.currentValueUsd
    .minus(input.prevValueUsd)
    .minus(input.periodInvestedUsd)
  const denomUsd = input.prevValueUsd.plus(input.periodInvestedUsd)
  return {
    dailyReturnUsd,
    denomUsd,
    dailyReturnPct: dailyReturnPct(dailyReturnUsd, denomUsd),
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS (no errors). `BN_HUNDRED` is exported from `@/lib/config` (used in `lib/pnl/totals.ts`).

- [ ] **Step 3: Commit**

```bash
git add src/lib/pnl/daily.ts
git commit -m "feat(pnl): add money-weighted daily-return formula"
```

---

## Task 2: Portfolio UI string constants (`src/lib/constants/portfolio.ts`)

**Files:**
- Create: `src/lib/constants/portfolio.ts`

Note: `ReturnMode` is defined in `usePortfolio.ts` in Task 3 and imported here as a
**type-only** import (matches how `PortfolioFilters.tsx` already imports
`GroupBy`/`SortBy` from `usePortfolio`). Type-only imports don't create a runtime
cycle, so file order doesn't matter for the build.

- [ ] **Step 1: Create the constants file**

```ts
import type { ReturnMode } from "@/hooks/usePortfolio"

/** Labels for the Portfolio Total | Daily return toggle. */
export const RETURN_MODE_LABELS: Record<ReturnMode, string> = {
  total: "Total",
  daily: "Daily",
}

/** Return column header on the desktop table, per return mode. */
export const RETURN_COLUMN_LABEL_TOTAL = "P&L"
export const RETURN_COLUMN_LABEL_DAILY = "Today"
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS once Task 3 has added `export type ReturnMode`. If running Task 2 before Task 3, this import will error — do Task 3 first or together. (Recommended: complete Task 3, then Task 2, then commit both. Order below assumes Task 3 is done.)

- [ ] **Step 3: Commit** (after Task 3 compiles)

```bash
git add src/lib/constants/portfolio.ts
git commit -m "feat(portfolio): add return-mode UI string constants"
```

---

## Task 3: Compute daily return in `usePortfolio`

**Files:**
- Modify: `src/hooks/usePortfolio.ts`

This is the core task. All edits below are in one file; complete them together so
the file typechecks, then commit once.

- [ ] **Step 1: Add imports**

Find the import block at the top (lines 1–11). Add the two new imports after the existing `summarizePnLTotals` import is added later — concretely, add these lines to the import section:

```ts
import { computeCurrentInvestedUsd } from "@/lib/performance"
import { computeDailyReturn, dailyReturnPct } from "@/lib/pnl/daily"
import type { Transaction } from "@/types/database"
```

(`summarizePnLTotals` is already imported at line 8. `Transaction` may already be importable from the existing `@/types/database` import group — if `Transaction` is not yet in that import, add it; otherwise add it to the existing `import type { ... } from "@/types/database"`.)

- [ ] **Step 2: Add the `ReturnMode` type and extend exported types**

Find (around line 53):

```ts
export type GroupBy = "platform" | "category" | "tag"
export type SortBy = "value" | "pnl" | "name"
```

Replace with:

```ts
export type GroupBy = "platform" | "category" | "tag"
export type SortBy = "value" | "pnl" | "name"
export type ReturnMode = "total" | "daily"
```

Find the `EnrichedAsset` interface (lines 15–41). Add these fields before the closing `}` (after `allocationPct: number`):

```ts
  /** Money-weighted daily return in USD (current − prev-snapshot − period cash). */
  dailyReturnUsd: number
  /** Daily return %, or null when there's no sensible base (denom <= 0). */
  dailyReturnPct: number | null
  /** Denominator the daily % is taken on (prev value + period invested); summed
   *  by group rollups. */
  dailyDenomUsd: number
```

Find the `AssetGroup` interface (lines 43–51). Add before its closing `}` (after `totalPnlUsd: number`):

```ts
  dailyReturnUsd: number
  dailyReturnPct: number | null
```

Find the `UsePortfolioReturn` interface (lines 56–77). Add before its closing `}` (after `setSortBy`):

```ts
  returnMode: ReturnMode
  setReturnMode: (value: ReturnMode) => void
  /** False when there's no previous snapshot to diff against (daily shows "—"). */
  dailyReturnAvailable: boolean
```

- [ ] **Step 3: Destructure transactions + rates from `usePnL`, add state**

Find the `usePnL` destructure (lines 97–105):

```ts
  const {
    assetPnLs,
    totalCostBasisUsd,
    totalCurrentValueUsd,
    totalUnrealizedPnlUsd,
    totalRealizedPnlUsd,
    totalInvestedUsd,
    loading: pnlLoading,
  } = usePnL(holdings, prices)
```

Replace with (add `transactions` + `rates: txRates` — `usePnL` already returns both, so no new data source or loading gate is needed):

```ts
  const {
    assetPnLs,
    totalCostBasisUsd,
    totalCurrentValueUsd,
    totalUnrealizedPnlUsd,
    totalRealizedPnlUsd,
    totalInvestedUsd,
    transactions,
    rates: txRates,
    loading: pnlLoading,
  } = usePnL(holdings, prices)
```

Find the state block (lines 107–109):

```ts
  const [search, setSearch] = useState("")
  const [groupBy, setGroupBy] = useState<GroupBy>("category")
  const [sortBy, setSortBy] = useState<SortBy>("value")
```

Replace with:

```ts
  const [search, setSearch] = useState("")
  const [groupBy, setGroupBy] = useState<GroupBy>("category")
  const [sortBy, setSortBy] = useState<SortBy>("value")
  const [returnMode, setReturnMode] = useState<ReturnMode>("total")
```

- [ ] **Step 4: Add the `dailyReturnLookups` memo**

Insert this block immediately after the existing `snapshotLookups` memo (after line 155, before `const enrichedAssets = useMemo(...)` at line 157):

```ts
  // Daily-return inputs derived from the *previous* snapshot. Daily return is
  // ΔP&L over the day = current value − previous-snapshot value − cash deployed
  // since then (computeCurrentInvestedUsd over the period's txs) — the canonical
  // money-weighted Total P&L (lib/pnl/totals.ts) applied across one day, so it
  // captures fiat FX too. We read the previous snapshot's *frozen* value_usd
  // (unlike the latest snapshot, where we use price × live balance): the frozen
  // value IS "yesterday's close," which is exactly the baseline we want.
  const dailyReturnLookups = useMemo(() => {
    const prev = snapshots[snapshots.length - 2]
    const available = !!prev?.breakdown?.by_asset
    const prevValueByTicker = new Map<string, number>()
    const prevValueByTickerPlatform = new Map<string, number>()
    const investedByAsset = new Map<string, number>()
    const investedByAssetPlatform = new Map<string, number>()

    if (available && prev?.breakdown?.by_asset) {
      for (const e of prev.breakdown.by_asset) {
        prevValueByTicker.set(
          e.ticker,
          (prevValueByTicker.get(e.ticker) ?? 0) + e.value_usd,
        )
        prevValueByTickerPlatform.set(`${e.ticker}|${e.platform}`, e.value_usd)
      }

      // Net cash deployed strictly AFTER the previous snapshot's date — same
      // date-slice cutoff computePnLTimeSeries uses (performance.ts:605-607).
      // Bucket once, then sum net invested per asset and per (asset, platform).
      const prevDate = prev.snapshot_date
      const txByAsset = new Map<string, Transaction[]>()
      const txByAssetPlatform = new Map<string, Transaction[]>()
      for (const tx of transactions) {
        if (tx.date.slice(0, 10) <= prevDate) continue
        const a = txByAsset.get(tx.asset_id) ?? []
        a.push(tx)
        txByAsset.set(tx.asset_id, a)
        const k = `${tx.asset_id}|${tx.platform_id}`
        const ap = txByAssetPlatform.get(k) ?? []
        ap.push(tx)
        txByAssetPlatform.set(k, ap)
      }
      for (const [id, txs] of txByAsset) {
        investedByAsset.set(id, computeCurrentInvestedUsd(txs, txRates))
      }
      for (const [k, txs] of txByAssetPlatform) {
        investedByAssetPlatform.set(k, computeCurrentInvestedUsd(txs, txRates))
      }
    }

    return {
      available,
      prevValueByTicker,
      prevValueByTickerPlatform,
      investedByAsset,
      investedByAssetPlatform,
    }
  }, [snapshots, transactions, txRates])
```

- [ ] **Step 5: Populate daily fields in `enrichedAssets`**

In the `enrichedAssets` map, find where `const pnl = pnlMap.get(asset.id)` is followed by the `return { ... }` (lines 212–236). Insert the daily computation between `const pnl = pnlMap.get(asset.id)` and the `return {`:

```ts
      const pnl = pnlMap.get(asset.id)

      const daily = dailyReturnLookups.available
        ? computeDailyReturn({
            currentValueUsd,
            prevValueUsd: bn(
              dailyReturnLookups.prevValueByTicker.get(asset.ticker) ?? 0,
            ),
            periodInvestedUsd: bn(
              dailyReturnLookups.investedByAsset.get(asset.id) ?? 0,
            ),
          })
        : null
```

Then add these three fields inside the returned object, right after `allocationPct: ...` (the last field before the closing `}` at line 235):

```ts
        dailyReturnUsd: daily ? daily.dailyReturnUsd.toNumber() : 0,
        dailyReturnPct:
          daily && daily.dailyReturnPct !== null
            ? daily.dailyReturnPct.toNumber()
            : null,
        dailyDenomUsd: daily ? daily.denomUsd.toNumber() : 0,
```

Add `dailyReturnLookups` to the `enrichedAssets` useMemo dependency array (lines 238–246):

```ts
  }, [
    activeAssets,
    holdings,
    prices,
    assetPnLs,
    totalCurrentValueUsd,
    usdTryRate,
    snapshotLookups,
    dailyReturnLookups,
  ])
```

- [ ] **Step 6: Platform branch — rescope daily per (asset, platform)**

In the `groupBy === "platform"` branch, find the `scoped` object construction (lines 304–318). Just before `const scoped: EnrichedAsset = {`, insert the platform-scoped daily computation:

```ts
          const platformDaily = dailyReturnLookups.available
            ? computeDailyReturn({
                currentValueUsd: bn(platformValueUsd),
                prevValueUsd: bn(
                  dailyReturnLookups.prevValueByTickerPlatform.get(
                    `${asset.ticker}|${h.platformName}`,
                  ) ?? 0,
                ),
                periodInvestedUsd: bn(
                  dailyReturnLookups.investedByAssetPlatform.get(
                    `${asset.id}|${h.platformId}`,
                  ) ?? 0,
                ),
              })
            : null
```

Then inside the `scoped` object, after `allocationPct: ...` (the last property, line 315–317), add:

```ts
            dailyReturnUsd: platformDaily ? platformDaily.dailyReturnUsd.toNumber() : 0,
            dailyReturnPct:
              platformDaily && platformDaily.dailyReturnPct !== null
                ? platformDaily.dailyReturnPct.toNumber()
                : null,
            dailyDenomUsd: platformDaily ? platformDaily.denomUsd.toNumber() : 0,
```

- [ ] **Step 7: Sum daily return into each group (all three branches)**

There are three group-building loops that each declare `totalValueUsdBn / totalValueTryBn / totalPnlUsdBn` accumulators and push an `AssetGroup`. Update **all three** identically.

**(a) Platform branch** — the loop at lines 328–351. Replace:

```ts
      for (const [key, groupAssets] of map) {
        const meta = platformMeta.get(key)!
        let totalValueUsdBn = BN_ZERO
        let totalValueTryBn = BN_ZERO
        let totalPnlUsdBn = BN_ZERO
        for (const a of groupAssets) {
          totalValueUsdBn = totalValueUsdBn.plus(bn(a.currentValueUsd))
          totalValueTryBn = totalValueTryBn.plus(bn(a.currentValueTry))
          totalPnlUsdBn = totalPnlUsdBn.plus(bn(a.unrealizedPnlUsd))
          a.allocationPct = totalValue.isZero()
            ? 0
            : bn(a.currentValueUsd).div(totalValue).times(100).toNumber()
        }

        result.push({
          key,
          label: meta.name,
          color: meta.color,
          assets: groupAssets,
          totalValueUsd: totalValueUsdBn.toNumber(),
          totalValueTry: totalValueTryBn.toNumber(),
          totalPnlUsd: totalPnlUsdBn.toNumber(),
        })
      }
```

with:

```ts
      for (const [key, groupAssets] of map) {
        const meta = platformMeta.get(key)!
        let totalValueUsdBn = BN_ZERO
        let totalValueTryBn = BN_ZERO
        let totalPnlUsdBn = BN_ZERO
        let dailyReturnUsdBn = BN_ZERO
        let dailyDenomUsdBn = BN_ZERO
        for (const a of groupAssets) {
          totalValueUsdBn = totalValueUsdBn.plus(bn(a.currentValueUsd))
          totalValueTryBn = totalValueTryBn.plus(bn(a.currentValueTry))
          totalPnlUsdBn = totalPnlUsdBn.plus(bn(a.unrealizedPnlUsd))
          dailyReturnUsdBn = dailyReturnUsdBn.plus(bn(a.dailyReturnUsd))
          dailyDenomUsdBn = dailyDenomUsdBn.plus(bn(a.dailyDenomUsd))
          a.allocationPct = totalValue.isZero()
            ? 0
            : bn(a.currentValueUsd).div(totalValue).times(100).toNumber()
        }
        const groupDailyPct = dailyReturnLookups.available
          ? dailyReturnPct(dailyReturnUsdBn, dailyDenomUsdBn)
          : null

        result.push({
          key,
          label: meta.name,
          color: meta.color,
          assets: groupAssets,
          totalValueUsd: totalValueUsdBn.toNumber(),
          totalValueTry: totalValueTryBn.toNumber(),
          totalPnlUsd: totalPnlUsdBn.toNumber(),
          dailyReturnUsd: dailyReturnLookups.available
            ? dailyReturnUsdBn.toNumber()
            : 0,
          dailyReturnPct: groupDailyPct !== null ? groupDailyPct.toNumber() : null,
        })
      }
```

**(b) Tag branch** — the loop at lines 376–395. Replace:

```ts
      for (const [key, assetIds] of map) {
        const groupAssets = [...assetIds].map((id) => assetMap.get(id)!).filter(Boolean)
        let totalValueUsdBn = BN_ZERO
        let totalValueTryBn = BN_ZERO
        let totalPnlUsdBn = BN_ZERO
        for (const a of groupAssets) {
          totalValueUsdBn = totalValueUsdBn.plus(bn(a.currentValueUsd))
          totalValueTryBn = totalValueTryBn.plus(bn(a.currentValueTry))
          totalPnlUsdBn = totalPnlUsdBn.plus(bn(a.unrealizedPnlUsd))
        }

        result.push({
          key,
          label: key,
          assets: groupAssets,
          totalValueUsd: totalValueUsdBn.toNumber(),
          totalValueTry: totalValueTryBn.toNumber(),
          totalPnlUsd: totalPnlUsdBn.toNumber(),
        })
      }
```

with:

```ts
      for (const [key, assetIds] of map) {
        const groupAssets = [...assetIds].map((id) => assetMap.get(id)!).filter(Boolean)
        let totalValueUsdBn = BN_ZERO
        let totalValueTryBn = BN_ZERO
        let totalPnlUsdBn = BN_ZERO
        let dailyReturnUsdBn = BN_ZERO
        let dailyDenomUsdBn = BN_ZERO
        for (const a of groupAssets) {
          totalValueUsdBn = totalValueUsdBn.plus(bn(a.currentValueUsd))
          totalValueTryBn = totalValueTryBn.plus(bn(a.currentValueTry))
          totalPnlUsdBn = totalPnlUsdBn.plus(bn(a.unrealizedPnlUsd))
          dailyReturnUsdBn = dailyReturnUsdBn.plus(bn(a.dailyReturnUsd))
          dailyDenomUsdBn = dailyDenomUsdBn.plus(bn(a.dailyDenomUsd))
        }
        const groupDailyPct = dailyReturnLookups.available
          ? dailyReturnPct(dailyReturnUsdBn, dailyDenomUsdBn)
          : null

        result.push({
          key,
          label: key,
          assets: groupAssets,
          totalValueUsd: totalValueUsdBn.toNumber(),
          totalValueTry: totalValueTryBn.toNumber(),
          totalPnlUsd: totalPnlUsdBn.toNumber(),
          dailyReturnUsd: dailyReturnLookups.available
            ? dailyReturnUsdBn.toNumber()
            : 0,
          dailyReturnPct: groupDailyPct !== null ? groupDailyPct.toNumber() : null,
        })
      }
```

**(c) Category branch (default)** — the loop at lines 412–431. Replace:

```ts
    for (const [key, groupAssets] of map) {
      const label = CATEGORY_LABELS[key] ?? key

      let totalValueUsdBn = BN_ZERO
      let totalValueTryBn = BN_ZERO
      let totalPnlUsdBn = BN_ZERO
      for (const a of groupAssets) {
        totalValueUsdBn = totalValueUsdBn.plus(bn(a.currentValueUsd))
        totalValueTryBn = totalValueTryBn.plus(bn(a.currentValueTry))
        totalPnlUsdBn = totalPnlUsdBn.plus(bn(a.unrealizedPnlUsd))
      }

      result.push({
        key,
        label,
        assets: groupAssets,
        totalValueUsd: totalValueUsdBn.toNumber(),
        totalValueTry: totalValueTryBn.toNumber(),
        totalPnlUsd: totalPnlUsdBn.toNumber(),
      })
    }
```

with:

```ts
    for (const [key, groupAssets] of map) {
      const label = CATEGORY_LABELS[key] ?? key

      let totalValueUsdBn = BN_ZERO
      let totalValueTryBn = BN_ZERO
      let totalPnlUsdBn = BN_ZERO
      let dailyReturnUsdBn = BN_ZERO
      let dailyDenomUsdBn = BN_ZERO
      for (const a of groupAssets) {
        totalValueUsdBn = totalValueUsdBn.plus(bn(a.currentValueUsd))
        totalValueTryBn = totalValueTryBn.plus(bn(a.currentValueTry))
        totalPnlUsdBn = totalPnlUsdBn.plus(bn(a.unrealizedPnlUsd))
        dailyReturnUsdBn = dailyReturnUsdBn.plus(bn(a.dailyReturnUsd))
        dailyDenomUsdBn = dailyDenomUsdBn.plus(bn(a.dailyDenomUsd))
      }
      const groupDailyPct = dailyReturnLookups.available
        ? dailyReturnPct(dailyReturnUsdBn, dailyDenomUsdBn)
        : null

      result.push({
        key,
        label,
        assets: groupAssets,
        totalValueUsd: totalValueUsdBn.toNumber(),
        totalValueTry: totalValueTryBn.toNumber(),
        totalPnlUsd: totalPnlUsdBn.toNumber(),
        dailyReturnUsd: dailyReturnLookups.available
          ? dailyReturnUsdBn.toNumber()
          : 0,
        dailyReturnPct: groupDailyPct !== null ? groupDailyPct.toNumber() : null,
      })
    }
```

- [ ] **Step 8: Add `dailyReturnLookups` to the `groups` memo deps**

Find (line 436):

```ts
  }, [sortedAssets, groupBy, snapshotLookups, totalCurrentValueUsd])
```

Replace with:

```ts
  }, [sortedAssets, groupBy, snapshotLookups, totalCurrentValueUsd, dailyReturnLookups])
```

- [ ] **Step 9: Return the new fields from the hook**

Find the return object (lines 456–477). Add after `setSortBy,`:

```ts
    returnMode,
    setReturnMode,
    dailyReturnAvailable: dailyReturnLookups.available,
```

- [ ] **Step 10: Typecheck**

Run: `npm run typecheck`
Expected: PASS. (Task 2's constants file imports `ReturnMode`, now exported — complete Task 2's file now if not already, so both compile.)

- [ ] **Step 11: Commit (with Task 2's constants file)**

```bash
git add src/hooks/usePortfolio.ts src/lib/constants/portfolio.ts
git commit -m "feat(portfolio): compute money-weighted daily return per asset and group"
```

---

## Task 4: Add the Total | Daily toggle to `PortfolioFilters`

**Files:**
- Modify: `src/components/portfolio/PortfolioFilters.tsx`

- [ ] **Step 1: Add imports + props**

At the top, add the constants/type import (the file already imports `GroupBy, SortBy` from `usePortfolio` on line 11 — extend it to include `ReturnMode`):

Find (line 11):

```ts
import type { GroupBy, SortBy } from "@/hooks/usePortfolio"
```

Replace with:

```ts
import type { GroupBy, SortBy, ReturnMode } from "@/hooks/usePortfolio"
import { RETURN_MODE_LABELS } from "@/lib/constants/portfolio"
```

Find the props interface (lines 19–26) and add two props after `onSortByChange`:

```ts
interface PortfolioFiltersProps {
  search: string
  onSearchChange: (value: string) => void
  groupBy: GroupBy
  onGroupByChange: (value: GroupBy) => void
  sortBy: SortBy
  onSortByChange: (value: SortBy) => void
  returnMode: ReturnMode
  onReturnModeChange: (value: ReturnMode) => void
}
```

Find the destructure (lines 28–35) and add the two props:

```ts
export function PortfolioFilters({
  search,
  onSearchChange,
  groupBy,
  onGroupByChange,
  sortBy,
  onSortByChange,
  returnMode,
  onReturnModeChange,
}: PortfolioFiltersProps) {
```

- [ ] **Step 2: Render the toggle**

Inside the right-hand controls `<div className="flex items-center gap-3">` (line 49), add this `ToggleGroup` as the **first** child (before the group-by toggle), mirroring the existing guarded `onValueChange` pattern:

```tsx
        {/* Return mode toggle */}
        <ToggleGroup
          value={[returnMode]}
          onValueChange={(newValue: string[]) => {
            if (newValue.length > 0) {
              onReturnModeChange(newValue[0] as ReturnMode)
            }
          }}
          variant="outline"
          size="sm"
        >
          <ToggleGroupItem value="total">{RETURN_MODE_LABELS.total}</ToggleGroupItem>
          <ToggleGroupItem value="daily">{RETURN_MODE_LABELS.daily}</ToggleGroupItem>
        </ToggleGroup>
```

(`ToggleGroup`/`ToggleGroupItem` are already imported at line 3.)

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS. (Will still error at `PortfolioPage` until Task 5 passes the new props — that's expected; finish Task 5 before the final build.)

- [ ] **Step 4: Commit**

```bash
git add src/components/portfolio/PortfolioFilters.tsx
git commit -m "feat(portfolio): add Total/Daily return toggle to filters"
```

---

## Task 5: Wire `returnMode` through `PortfolioPage`

**Files:**
- Modify: `src/pages/PortfolioPage.tsx`

- [ ] **Step 1: Destructure the new hook fields**

Find the `usePortfolio()` destructure (lines 7–23). Add `returnMode`, `setReturnMode`, `dailyReturnAvailable` (after `setSortBy`):

```ts
  const {
    groups,
    totalValueUsd,
    totalValueTry,
    totalPnlUsd,
    totalPnlPct,
    totalUnrealizedPnlUsd,
    totalRealizedPnlUsd,
    heldAssetCount,
    loading,
    search,
    setSearch,
    groupBy,
    setGroupBy,
    sortBy,
    setSortBy,
    returnMode,
    setReturnMode,
    dailyReturnAvailable,
  } = usePortfolio()
```

- [ ] **Step 2: Pass props to `PortfolioFilters`**

Find the `<PortfolioFilters ... />` block (lines 47–54). Add the two props:

```tsx
      <PortfolioFilters
        search={search}
        onSearchChange={setSearch}
        groupBy={groupBy}
        onGroupByChange={setGroupBy}
        sortBy={sortBy}
        onSortByChange={setSortBy}
        returnMode={returnMode}
        onReturnModeChange={setReturnMode}
      />
```

- [ ] **Step 3: Pass props to `PortfolioTable`**

Find the `<PortfolioTable groups={groups} />` (line 62). Replace with:

```tsx
        <PortfolioTable
          groups={groups}
          returnMode={returnMode}
          dailyReturnAvailable={dailyReturnAvailable}
        />
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: PASS for `PortfolioFilters` wiring; `PortfolioTable` will error until Task 6 accepts the new props — expected; continue.

- [ ] **Step 5: Commit**

```bash
git add src/pages/PortfolioPage.tsx
git commit -m "feat(portfolio): thread returnMode from page to filters and table"
```

---

## Task 6: Thread `returnMode` through `PortfolioTable` + relabel column

**Files:**
- Modify: `src/components/portfolio/PortfolioTable.tsx`

- [ ] **Step 1: Add imports + props**

At the top, add imports:

```ts
import type { AssetGroup, ReturnMode } from "@/hooks/usePortfolio"
import {
  RETURN_COLUMN_LABEL_TOTAL,
  RETURN_COLUMN_LABEL_DAILY,
} from "@/lib/constants/portfolio"
```

(Replace the existing `import type { AssetGroup } from "@/hooks/usePortfolio"` on line 10 with the combined import above.)

Find the props interface (lines 12–14):

```ts
interface PortfolioTableProps {
  groups: AssetGroup[]
}
```

Replace with:

```ts
interface PortfolioTableProps {
  groups: AssetGroup[]
  returnMode: ReturnMode
  dailyReturnAvailable: boolean
}
```

Find the component signature (line 18):

```ts
export function PortfolioTable({ groups }: PortfolioTableProps) {
```

Replace with:

```ts
export function PortfolioTable({
  groups,
  returnMode,
  dailyReturnAvailable,
}: PortfolioTableProps) {
```

- [ ] **Step 2: Relabel the return column header**

Find the desktop header cell (line 40):

```tsx
              <TableHead className="text-right">P&L</TableHead>
```

Replace with:

```tsx
              <TableHead className="text-right">
                {returnMode === "daily"
                  ? RETURN_COLUMN_LABEL_DAILY
                  : RETURN_COLUMN_LABEL_TOTAL}
              </TableHead>
```

- [ ] **Step 3: Pass `returnMode` to header + rows**

Update `GroupSection` to accept and forward `returnMode`. Find (lines 46–48):

```tsx
            {groups.map((group) => (
              <GroupSection key={group.key} group={group} />
            ))}
```

Replace with:

```tsx
            {groups.map((group) => (
              <GroupSection
                key={group.key}
                group={group}
                returnMode={returnMode}
                dailyReturnAvailable={dailyReturnAvailable}
              />
            ))}
```

Find the mobile card list `group.assets.map` (lines 73–75):

```tsx
            {group.assets.map((asset) => (
              <PortfolioRowCard key={asset.id} asset={asset} />
            ))}
```

Replace with:

```tsx
            {group.assets.map((asset) => (
              <PortfolioRowCard
                key={asset.id}
                asset={asset}
                returnMode={returnMode}
                dailyReturnAvailable={dailyReturnAvailable}
              />
            ))}
```

Find the `GroupSection` function (lines 85–94):

```tsx
function GroupSection({ group }: { group: AssetGroup }) {
  return (
    <>
      <PortfolioGroupHeader group={group} colSpan={COL_COUNT} />
      {group.assets.map((asset) => (
        <PortfolioRow key={asset.id} asset={asset} />
      ))}
    </>
  )
}
```

Replace with:

```tsx
function GroupSection({
  group,
  returnMode,
  dailyReturnAvailable,
}: {
  group: AssetGroup
  returnMode: ReturnMode
  dailyReturnAvailable: boolean
}) {
  return (
    <>
      <PortfolioGroupHeader
        group={group}
        colSpan={COL_COUNT}
        returnMode={returnMode}
        dailyReturnAvailable={dailyReturnAvailable}
      />
      {group.assets.map((asset) => (
        <PortfolioRow
          key={asset.id}
          asset={asset}
          returnMode={returnMode}
          dailyReturnAvailable={dailyReturnAvailable}
        />
      ))}
    </>
  )
}
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: PASS for the table wiring; `PortfolioGroupHeader`/`PortfolioRow`/`PortfolioRowCard` will error until Tasks 7–8 accept the new props — expected; continue.

- [ ] **Step 5: Commit**

```bash
git add src/components/portfolio/PortfolioTable.tsx
git commit -m "feat(portfolio): thread returnMode through table and relabel return column"
```

---

## Task 7: Render daily vs total on `PortfolioGroupHeader`

**Files:**
- Modify: `src/components/portfolio/PortfolioGroupHeader.tsx`

- [ ] **Step 1: Add imports + props**

Find the imports (lines 3–9) and add `formatSignedPercent`:

```ts
import {
  formatCurrency,
  formatSignedCurrency,
  formatSignedPercent,
  gainLossClass,
  obfuscate,
} from "@/lib/prices"
import type { AssetGroup } from "@/hooks/usePortfolio"
import type { ReturnMode } from "@/hooks/usePortfolio"
```

Find the props interface (lines 11–14):

```ts
interface PortfolioGroupHeaderProps {
  group: AssetGroup
  colSpan: number
}
```

Replace with:

```ts
interface PortfolioGroupHeaderProps {
  group: AssetGroup
  colSpan: number
  returnMode: ReturnMode
  dailyReturnAvailable: boolean
}
```

Find the component signature (lines 16–19):

```ts
export function PortfolioGroupHeader({
  group,
  colSpan,
}: PortfolioGroupHeaderProps) {
```

Replace with:

```ts
export function PortfolioGroupHeader({
  group,
  colSpan,
  returnMode,
  dailyReturnAvailable,
}: PortfolioGroupHeaderProps) {
```

- [ ] **Step 2: Render the return figure by mode**

Find the value/pnl computation + the return `<span>` (lines 23–51). Replace this block:

```tsx
  const displayValue =
    currency === "USD" ? group.totalValueUsd : group.totalValueTry
  const displayPnl = group.totalPnlUsd
  const pnlIsPositive = displayPnl >= 0

  return (
    <TableRow className="bg-muted/30 hover:bg-muted/40">
      <TableCell colSpan={colSpan} className="py-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {group.color && (
              <span
                className="inline-block size-3 rounded-full"
                style={{ backgroundColor: group.color }}
              />
            )}
            <span className="font-semibold text-sm">{group.label}</span>
            <span className="text-xs text-muted-foreground">
              ({group.assets.length} asset{group.assets.length !== 1 ? "s" : ""})
            </span>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span className="font-medium">
              {o(formatCurrency(displayValue, currency))}
            </span>
            <span className={gainLossClass(pnlIsPositive)}>
              {o(formatSignedCurrency(displayPnl, "USD"))}
            </span>
          </div>
        </div>
      </TableCell>
    </TableRow>
  )
```

with:

```tsx
  const displayValue =
    currency === "USD" ? group.totalValueUsd : group.totalValueTry

  const isDaily = returnMode === "daily"
  // Daily mode with no prior snapshot → no figure to show.
  const showReturn = !isDaily || dailyReturnAvailable
  const returnUsd = isDaily ? group.dailyReturnUsd : group.totalPnlUsd
  const returnPct = isDaily ? group.dailyReturnPct : null
  const returnIsPositive = returnUsd >= 0

  return (
    <TableRow className="bg-muted/30 hover:bg-muted/40">
      <TableCell colSpan={colSpan} className="py-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {group.color && (
              <span
                className="inline-block size-3 rounded-full"
                style={{ backgroundColor: group.color }}
              />
            )}
            <span className="font-semibold text-sm">{group.label}</span>
            <span className="text-xs text-muted-foreground">
              ({group.assets.length} asset{group.assets.length !== 1 ? "s" : ""})
            </span>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span className="font-medium">
              {o(formatCurrency(displayValue, currency))}
            </span>
            {showReturn ? (
              <span className={gainLossClass(returnIsPositive)}>
                {o(formatSignedCurrency(returnUsd, "USD"))}
                {isDaily && returnPct !== null && (
                  <span className="ml-1 text-xs">
                    {formatSignedPercent(returnPct, 2)}
                  </span>
                )}
              </span>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </div>
        </div>
      </TableCell>
    </TableRow>
  )
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS for this file (PortfolioRow still pending Task 8).

- [ ] **Step 4: Commit**

```bash
git add src/components/portfolio/PortfolioGroupHeader.tsx
git commit -m "feat(portfolio): render daily vs total return on group header"
```

---

## Task 8: Render daily vs total on `PortfolioRow` + `PortfolioRowCard`

**Files:**
- Modify: `src/components/portfolio/PortfolioRow.tsx`

- [ ] **Step 1: Add the `ReturnMode` import + props on both components**

At the top, add (after the existing `import type { EnrichedAsset } from "@/hooks/usePortfolio"` on line 16):

```ts
import type { ReturnMode } from "@/hooks/usePortfolio"
```

Find the props interface (lines 20–22):

```ts
interface PortfolioRowProps {
  asset: EnrichedAsset
}
```

Replace with:

```ts
interface PortfolioRowProps {
  asset: EnrichedAsset
  returnMode: ReturnMode
  dailyReturnAvailable: boolean
}
```

- [ ] **Step 2: Desktop row — switch the P&L cell**

Find the desktop component signature (line 39):

```ts
export function PortfolioRow({ asset }: PortfolioRowProps) {
```

Replace with:

```ts
export function PortfolioRow({
  asset,
  returnMode,
  dailyReturnAvailable,
}: PortfolioRowProps) {
```

Find `const pnlIsPositive = asset.unrealizedPnlUsd >= 0` (line 62). Replace with the mode-aware values:

```ts
  const isDaily = returnMode === "daily"
  const showReturn = !isDaily || dailyReturnAvailable
  const returnUsd = isDaily ? asset.dailyReturnUsd : asset.unrealizedPnlUsd
  const returnPct = isDaily ? asset.dailyReturnPct : asset.unrealizedPnlPct
  const returnIsPositive = returnUsd >= 0
```

Find the P&L `<TableCell>` (lines 128–137):

```tsx
      <TableCell className="text-right">
        <div className="flex flex-col items-end">
          <span className={gainLossClass(pnlIsPositive)}>
            {o(formatSignedCurrency(asset.unrealizedPnlUsd, "USD"))}
          </span>
          <span className={`text-xs ${gainLossClass(pnlIsPositive)}`}>
            {formatSignedPercent(asset.unrealizedPnlPct)}
          </span>
        </div>
      </TableCell>
```

Replace with:

```tsx
      <TableCell className="text-right">
        {showReturn ? (
          <div className="flex flex-col items-end">
            <span className={gainLossClass(returnIsPositive)}>
              {o(formatSignedCurrency(returnUsd, "USD"))}
            </span>
            {returnPct !== null && (
              <span className={`text-xs ${gainLossClass(returnIsPositive)}`}>
                {formatSignedPercent(returnPct)}
              </span>
            )}
          </div>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
```

- [ ] **Step 3: Mobile card — switch the P&L line**

Find the mobile component signature (line 169):

```ts
export function PortfolioRowCard({ asset }: PortfolioRowProps) {
```

Replace with:

```ts
export function PortfolioRowCard({
  asset,
  returnMode,
  dailyReturnAvailable,
}: PortfolioRowProps) {
```

Find `const pnlIsPositive = asset.unrealizedPnlUsd >= 0` (line 175). Replace with:

```ts
  const isDaily = returnMode === "daily"
  const showReturn = !isDaily || dailyReturnAvailable
  const returnUsd = isDaily ? asset.dailyReturnUsd : asset.unrealizedPnlUsd
  const returnPct = isDaily ? asset.dailyReturnPct : asset.unrealizedPnlPct
  const returnIsPositive = returnUsd >= 0
```

Find the P&L line in the card (lines 205–209):

```tsx
          <span className={`text-xs ${gainLossClass(pnlIsPositive)}`}>
            {formatSignedCurrency(asset.unrealizedPnlUsd, "USD")}
            {" "}
            ({formatSignedPercent(asset.unrealizedPnlPct)})
          </span>
```

Replace with:

```tsx
          {showReturn ? (
            <span className={`text-xs ${gainLossClass(returnIsPositive)}`}>
              {formatSignedCurrency(returnUsd, "USD")}
              {returnPct !== null && (
                <>
                  {" "}
                  ({formatSignedPercent(returnPct)})
                </>
              )}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
```

- [ ] **Step 4: Typecheck + full build + lint**

Run: `npm run typecheck`
Expected: PASS (whole app now consistent).

Run: `npm run build`
Expected: PASS (tsc -b + vite build succeed).

Run: `npm run lint`
Expected: PASS (no new lint errors in the touched files).

- [ ] **Step 5: Commit**

```bash
git add src/components/portfolio/PortfolioRow.tsx
git commit -m "feat(portfolio): render daily vs total return on asset rows"
```

---

## Task 9: Verify on live prod (deploy handoff)

**Files:** none (verification only).

- [ ] **Step 1: Hand the deploy command to the user**

Tell the user the change is committed and ready; ask them to run the prod deploy:

```bash
npm run deploy
```

(Do **not** run this yourself — deploy is the user's step.)

- [ ] **Step 2: Verify behaviors on the live site** (from the spec's Verification section)

Confirm each:
- The **Total | Daily** toggle appears in the filters and defaults to **Total**; Total mode is unchanged from before.
- Switching to **Daily** changes the right-hand figure on every group header **and** every asset row (desktop + mobile), and the column header reads **"Today"**.
- On a no-trade day, an asset's daily return ≈ `qty × (today − yesterday price)`, and each group header equals the sum of its visible rows.
- An asset bought today shows its intraday move from the purchase price (not its full principal).
- Daily figures show **amount + percent**; obfuscation still hides currency amounts while percent stays visible; gain/loss colors match the canonical palette.
- If the account has only one snapshot (or none), Daily mode shows **"—"** everywhere and the toggle still switches cleanly.

---

## Self-review notes (already reconciled)

- **Spec coverage:** toggle (Task 4–5), per-asset + per-group daily math (Task 1, 3), platform/tag/category granularity (Task 3 all branches), header + rows + mobile (Tasks 7–8), column relabel (Task 6), "—" unavailable state (Tasks 7–8), USD + amount/percent + obfuscation + colors (Tasks 7–8). Summary bar deliberately untouched (non-goal).
- **Type consistency:** `ReturnMode` exported from `usePortfolio`; `EnrichedAsset.{dailyReturnUsd, dailyReturnPct, dailyDenomUsd}`, `AssetGroup.{dailyReturnUsd, dailyReturnPct}`; `computeDailyReturn`/`dailyReturnPct` signatures match their uses; props (`returnMode`, `dailyReturnAvailable`) threaded consistently through Page → Table → GroupSection → Header/Row/Card.
- **Noted edge (not fixed):** a position fully sold during the day isn't a visible row, so the page's daily-return sum can differ slightly from the Dashboard hero's portfolio-wide 1D delta — consistent with how the page already omits sold-out realized gains. See spec Risks.
