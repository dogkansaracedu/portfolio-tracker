# P&L Engine Critique — Verification Notes

> Adversarial verification of the P&L-engine critique. For each finding I tried
> to **refute** it with worked numbers + code/data facts before trusting it.
> Verdict legend: ✅ confirmed · ⚠️ real but narrower than first stated · ❌ refuted.
>
> Date: 2026-06-04 · branch `master`. All file:line refs verified against current tree.

## Verdict summary

| # | Claim | Verdict | Net |
|---|-------|---------|-----|
| 1 | Dividend/interest diverge: FIFO treats as acquisition, invested-ledger as cash return | ✅ confirmed | ~2× dividend value, **user-visible** across pages |
| 2 | In-kind `fee` over-books realized loss (`feeCostUsd` vs `cost_consumed`) | ✅ confirmed | real, usually small magnitude |
| 3 | Sold-out positions' realized P&L missing from `assetPnLs` → category attribution understates | ✅ confirmed | **rendered** on Performance page |
| 4 | "Daily" return is "since last snapshot"; cadence is irregular | ⚠️ downgraded | one-per-day upsert refutes "minutes ago"; narrower issue remains |
| ★ | (emergent) Performance page computes Total P&L as `unrealized+realized`, diverging from money-weighted headline | ✅ confirmed | the *mechanism* that makes #1/#2 visible |

---

## Dependency facts confirmed during verification

- **F-A** — `dividend`/`interest` can be attached to **any** asset (no fiat-only filter): `AssetSearchSelect` lists all assets; `AddTransactionModal` requires unit_price for dividend/interest just like buy/sell; payload stores `amount`, `unit_price` (prefilled from market), `total_cost = amount×unit_price`. CSV import even has aliases `temettü→dividend`, `faiz→interest` → intended for real use. `balance.ts`: dividend/interest **add** `amount` to the asset's balance (treated as units). ✅ contradiction is structurally possible.
- **F-B** — `computeCategoryAttribution` **is rendered**: `usePerformance.ts:66-69` → `PerformancePage.tsx:114` `<CategoryAttribution data={categoryAttribution} />` → `CategoryAttribution.tsx` shows per-category `pnlUsd` + `contributionPct`. Not dead code.
- **F-C** — Sold-out positions: `holdings` query filters `.neq("balance", 0)` (`queries/holdings.ts`). Rows aren't deleted but **are excluded from the fetched `holdings`** → never reach `assetPnLs`. Full-history realized total bypasses this via `buildRealizedByTx` (all txs), but `assetPnLs` does not. ✅
- **F-D** — Snapshots: **daily cron** `'55 23 * * *'` (23:55 UTC) in `supabase/migrations/20260602000000_demand_driven_price_refresh.sql` → `fetch-prices` → chains `take-snapshots`. Client also writes on tx/price change. **All writes upsert on `onConflict: "user_id,snapshot_date"`** (`queries/snapshots.ts:200-211` + `take-snapshots`) → **exactly one row per calendar day.** This is what downgrades #4.

---

## Finding ★ (emergent, the linchpin): two pages, two definitions of Total P&L

- **Dashboard hero + Portfolio header** → `usePnLSummary` → `summarizePnLTotals` = `value − net_invested` (money-weighted). `totals.ts:24`.
- **Performance page** → `PerformancePage.tsx:40`:
  ```ts
  const totalPnlUsd = totalUnrealizedPnlUsd.plus(totalRealizedPnlUsd).toNumber()
  ```
  i.e. the **FIFO sum**. This feeds `computeAllTimeReturn(totalPnlUsd, invested)` → the **all-time return %** shown in `PerformanceSummary`.

So the Dashboard's "Total P&L %" (`(value−invested)/|invested|`) and the Performance page's "all-time return %" (`(unrealized+realized)/|invested|`) are computed from **two different P&L definitions**. They agree only when `value − invested == unrealized + realized`. That equality is the thing #1 and #2 break. This is exactly the "historically diverged" problem the single-engine goal was meant to kill — it's still alive on the Performance page.

(Sold-out positions do **not** cause this *total-level* divergence: both `totalRealizedPnlUsd` (full-history `buildRealizedByTx`) and the invested ledger include them. Sold-out only breaks the *category* path — see #3.)

---

## Worked math

### Base case — the equivalence claim holds (sanity check)
One asset, buys + sells only, no dividends/fees/transfers.

- `net_invested = Σbuy_total − Σsell_proceeds`
- `unrealized = value − cost_open`; `realized = Σ(sell_proceeds − cost_consumed)`; `cost_open + cost_consumed = Σbuy_total`
- `unrealized + realized = value + Σsell_proceeds − Σbuy_total`
- `value − net_invested = value − Σbuy_total + Σsell_proceeds` ✓ **equal.**

So in the common case the two definitions match — which is *why* the divergence is sneaky: it only appears with dividends, in-kind fees, or the category path.

### #1 — Dividend on a stock (✅ confirmed, ~2× divergence)
AAPL, currently flat. Record a dividend with `amount = N`, `unit_price ≈ current price P`, `total_cost = N·P`.

- FIFO (`fifo.ts:29-61`, dividend ∈ buy branch): pushes a lot {N units @ ≈P}. value += N·P, cost_open += N·P → **unrealized unchanged**; realized unchanged. ⇒ `unrealized+realized` Δ ≈ **0**.
- Invested ledger (`performance.ts:553-555`, dividend → `cum.minus(total)`): net_invested −= N·P. value += N·P. ⇒ `value − invested` Δ ≈ **+2N·P**.

**Divergence ≈ 2 × dividend value.** Dashboard total jumps ~2N·P; Performance all-time return (FIFO sum) barely moves. Both are arguably wrong (a cash dividend shouldn't add *shares* at all — `balance.ts` inflates the share count by `amount`). Interest behaves identically.
Conditional: only bites if the user records dividend/interest on a non-fiat asset. The Turkish import aliases suggest they intend to.

### #2 — In-kind fee (✅ confirmed; code comment self-admits)
Pay a fee of `N` units of an asset whose lot basis is `B`/unit, current price `P`/unit. `fifo.ts:160-203`:
```ts
const feeCostUsd = bn(tx.amount).times(priceUsd)   // = N·P
...
realizedPnlUsd: feeCostUsd.negated()               // = −N·P   ← books market value
```
But it also consumes `cost_consumed = N·B` from open lots.

- True wealth impact of paying N units = **−N·P**.
- Correct split: realized should be `−cost_consumed = −N·B` (disposal at zero net proceeds); then Δunrealized (value −N·P, cost_open −N·B) = `−N·P + N·B`; sum = `−N·P` ✓.
- Code books realized `−N·P` instead of `−N·B`. Sum = `−N·P + (−N·P + N·B) = −2N·P + N·B`.
- **Error = N·(B − P)** — the unrealized gain on the fee units is double-counted as loss.

Magnitude is small for typical fees, but it's a real reconciliation break and another contributor to ★.

### #3 — Category attribution drops sold-out realized (✅ confirmed, rendered)
`computeCategoryAttribution(assetPnLs)` (`performance.ts:387-431`) sums `a.unrealizedPnlUsd + a.realizedPnlUsd` over `assetPnLs`. `assetPnLs` comes only from fetched `holdings`, which are filtered `.neq("balance", 0)`.

- A fully-sold asset → no holdings row → **absent from every category bucket**, though its realized P&L *is* in the portfolio headline (`totalRealizedPnlUsd`).
- Subtler: a still-held asset that was **fully sold on one platform** loses that platform's realized P&L too (that holdings row is balance-0 and filtered).

⇒ The per-category P&L understates, and the category breakdown won't reconcile to the headline total. The `contributionPct` is internally consistent (numerator and denominator both exclude them) so it *looks* fine — which hides the bug. This is the exact gap the headline total was already patched for (`usePnL.ts:291-302`), not propagated to the attribution path.

### #4 — "Daily" return window (⚠️ downgraded — adversarial check refuted the strong form)
My first claim was "previous snapshot could be an hour or a week ago." **Refuted for the short side:** snapshots upsert one-per-`snapshot_date`, so `snapshots[length-2]` is always a *prior calendar day*, never minutes-old intra-day. So "daily ≈ since yesterday" is normally correct.

What *survives*, weaker:
1. **No guard that prev snapshot is exactly 1 day old.** If the daily cron misses (or the Supabase project is paused on idle), `length-2` is 2+ days back and the delta is silently mislabeled "daily." No staleness check.
2. **Cron at 23:55 UTC = 02:55 Turkey time.** The "daily" snapshot is taken in the small hours local time; depending on whether `snapshot_date` is UTC- or local-derived, a late-evening Turkish tx can land on the "wrong" side of the boundary.
3. **Same-day-as-prev-snapshot cutoff:** `usePortfolio.ts:207` excludes `tx.date.slice(0,10) <= prevDate`; `computePnLTimeSeries` uses inclusive `<= cutoff`. Two conventions for the same boundary; a tx dated on the prev-snapshot day that occurred *after* that snapshot is invisible to both the baseline and `periodInvested`.

Net: not the headline issue I first made it. A rename ("since last snapshot") + a staleness guard covers it.

---

## Secondary / unchanged from first pass (not re-verified numerically)

- **Per-platform breakdown uses raw JS float math + fabricated cost basis** (`usePortfolio.ts:392-397`): violates the bignumber rule; `costPerUnit = aggregateCost/aggregateBalance` smears one blended basis across platforms instead of each platform's real FIFO basis (which `usePnL` computes then discards at aggregation). Plus dead arithmetic at `426-428` (`totalBalance + platformBalance − platformBalance` ≡ `totalBalance`, and the value is overwritten at 458-460).
- **Redundant FIFO replays** across `usePnL` / `buildRealizedByTx` / `useDashboard` / `usePerformance`; cost-basis replay sits in the price-dependent memo so it recomputes on every price tick (only the realized total was split out).
- **Silent currency fallbacks**: `bn(rate.usd_try ?? 1)` (`currency.ts:73`) → present-but-zero rate gives a ~30× error with no warn; unknown currency returned as-is.
- **No invariant `Σlot.amount ≈ holdings.balance`**: cost basis (from txs) and value (from balance) come from two sources; drift yields silent garbage unrealized.

---

## Real-data check (2026-06-04, via Supabase) — what's actually active

Queried the live tx/holdings to separate *active* bugs from *latent* ones:

- **#1 dividend** — exactly **1** dividend tx, on a stock, `total_cost $5.28`. Active but distorts money-weighted Total P&L by ~$10 on a ~$51K book. **Not worth fixing.**
- **#2 in-kind fee** — **zero** standalone `fee`-type txs (all fees ride on buys/sells, handled correctly). The double-count branch never fires. **Purely latent.**
- **★ / #3** — Performance page; user scoped this out ("don't count performance for now").
- **#5 per-platform cost basis** — **ACTIVE and material.** BTC held on 3 platforms, ETH on 2, XAUT on 2, all with very different per-platform buy prices/dates. The blended-average smear misattributes real P&L between platform rows in the group-by-platform view (asset & portfolio totals stay correct; only the split is wrong).

⇒ With Performance out of scope and Tier-1 quiet, **#5 was the biggest marginal return.**

## FIX APPLIED — #5 (per-platform cost basis)

Approach: reuse, don't rederive. `usePnL` already computes correct per-(asset,platform)
FIFO numbers in `holdingPnLs`, then discarded them at asset aggregation. Now exposed.

- `lib/pnl/types.ts`: added exported `HoldingPnL` interface; added `holdingPnLs: HoldingPnL[]` to `PortfolioPnL`.
- `hooks/usePnL.ts`: dropped the local `HoldingPnL` interface (use the shared one); tagged each entry with `platformId`/`platformName`; returned `holdingPnLs` (both empty + populated paths).
- `hooks/usePortfolio.ts` (`groupBy === "platform"`): replaced `costPerUnit = assetCost/assetBalance × platformBalance` (blended, **raw JS float** — violated the BigNumber rule) with each platform's real `costBasisUsd`/`currentValueUsd`/`unrealizedPnlUsd` from `holdingPnLs`, all BigNumber. Removed the dead `allocationPct` arithmetic (`totalBalance + platformBalance − platformBalance` ≡ `totalBalance`, then overwritten downstream).

Correctness invariant preserved: `holdingPnLs` are exactly what `usePnL` sums into `assetPnLs`, so per-platform rows still sum to asset- and portfolio-level totals (the old code's *sum* was already right; only the *split* was wrong). Now split + sum are both right, in BigNumber.

Verified: `tsc --noEmit` clean; `eslint` clean (one pre-existing unrelated `usdTryRate` dep warning). No local dev server (per project norms) → final visual check happens on prod after push.

## REFACTOR (follow-up) — `usePortfolio` extracted to pure functions

`usePortfolio.ts` was a ~640-line hook that was mostly one giant function with a
triple-duplicated group rollup. Extracted the number-crunching into a new pure
module; the hook is now a ~240-line thin orchestrator.

- New `src/lib/portfolio/grouping.ts`: `buildSnapshotLookups`, `buildDailyReturnLookups`, `enrichAsset` / `buildEnrichedAssets`, `filterAssetsBySearch`, `sortAssets`, `scopeAssetToPlatform`, `rollupGroup` (kills the 3× duplicated rollup), `groupByPlatform/Tag/Category`, `groupAssets`. Plus `SnapshotLookups`/`DailyReturnLookups`/`GroupContext` types and `CATEGORY_LABELS`.
- `usePortfolio.ts`: view types kept in place (callers import them unchanged); logic delegated. Pipeline reads top-to-bottom: enrich → filter → sort → group → totals.
- Type-only import of the view types into `grouping.ts` (erased at build) → no runtime cycle.

Behavior-preserving (all logic copied verbatim). Deliberate equivalences:
- tag grouping uses `tags.length > 0 ? tags : ["Other"]` instead of a separate "no tags" branch — same membership.
- `rollupGroup` does **not** recompute allocation for category/tag (keeps `enrichAsset`'s exact values); platform-scoped rows get allocation in `groupByPlatform`, identical to before.
- dropped redundant `usdTryRate` from the `enrichedAssets` memo deps (only ever used via `snapshotLookups`, which already depends on it) → fixes the prior eslint warning, no invalidation change.
- minor: `AssetGroup.color` is now always present (`undefined` for category/tag) vs previously absent — not observable to consumers.

Verified: `tsc --noEmit` ✓, `eslint` ✓ (0 warnings), `npm run build` ✓.

## Suggested guard (would have caught #1/#2/★ automatically)
Dev-time assert in `usePnL`/summary: warn when `|(value − invested) − (unrealized + realized)| > $0.01`. Cheap, and it turns every future divergence into a console warning instead of a silent cross-page mismatch.
