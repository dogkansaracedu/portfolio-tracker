# Snapshot as the Single Source of Truth — Handoff

**Session date:** 2026-05-10
**Triggering bug:** Dashboard chart dipped to ≈−$940 on 2026-04-09 only; surrounding days fine.
**Decision taken:** Option 1 from `cash-flow-feature-discussion.md`-style menu — promote `snapshots` to the only source of truth for derived dashboard numbers; FIFO/cost basis stays on the frontend.

This doc explains what shipped this session, what the next agent needs to *do* to finish closing the loop, and the deliberate gaps (what we *didn't* refactor and why). It is intended to be read by the next session before any further snapshot/dashboard work.

---

## 1. The bug, briefly

Both Value and P&L charts showed a single-point dip at exactly **2026-04-09** in the dashboard hero (`DashboardHero.tsx`). User screenshot showed `P&L: $940.79` at the dip — the value was actually `−$940.79`, displayed without the minus sign because of a separate `formatSigned` bug.

Diagnostic SQL (`SELECT snapshot_date, total_usd, asset_count, created_at FROM snapshots WHERE snapshot_date BETWEEN '2026-04-05' AND '2026-04-15'`) revealed:

| Date | `total_usd` | `asset_count` | `created_at` |
|---|---|---|---|
| 2026-04-08 | $2,212 | **2** | today 09:01 UTC |
| **2026-04-09** | **$1,042** | **1** ← orphan | **yesterday** 22:43 UTC |
| 2026-04-10 → 15 | ~$2,218 | 2 | all today 09:01 UTC |

Root cause was structural, not a math bug:

1. The user's `earliestTxDate` happens to put the *last* weekly snapshot on **April 8** and the daily window starts on **April 10**. **April 9 sits in the gap** of the new `daily-30 + weekly-older` cadence (commit `b359a22`).
2. The orphan was written on **2026-05-09 22:43 UTC** by an old deploy of `backfill-snapshots` whose `balanceSign()` didn't yet know about `cash_credit`/`cash_debit` (fixed in `75fdd6a`). That run silently dropped the cash holding's balance, so the snapshot only saw 1 of 2 assets.
3. Today's backfill (10:01 UTC) ran with the *fixed* code but does **not** include April 9 in `targetSet`, so the orphan was never overwritten — even though its surrounding dates were rewritten correctly.

The orphan is purely a data residue. The code path that produced it has been fixed; the row itself is still there and the cron's defenses against repeating the failure mode were missing.

---

## 2. Architecture shift: why this fix is bigger than "delete one row"

Before this session, "current portfolio value" was computed in **three** places that had to agree but easily drifted:

- `src/hooks/useDashboard.ts` — live `holdings × prices` aggregation
- `supabase/functions/take-snapshots/index.ts` — the daily cron's aggregation
- `supabase/functions/backfill-snapshots/index.ts` — historical replay aggregation

Each fix recently shipped in `c9b69c8`, `75fdd6a`, `3a3cc45` was the *same kind* of bug — frontend and backend disagreeing about what a "buy" or a "cash_credit" does. `3a3cc45`'s commit message captures it: dashboard P&L said `+$1,691.76`, portfolio P&L said `+$515.26`, diff $1,176.50 = USD cash sitting on platforms.

**Decision:** the snapshot's `breakdown` JSON becomes the **only** thing the dashboard reads. The frontend stops re-deriving aggregations from `holdings × prices`. There is one writer (the snapshot path) and one reader (the dashboard).

Cost basis / FIFO **stays on the frontend** — it's a deterministic function of `transactions`, no second source to drift against, so duplication isn't a risk there.

---

## 3. What shipped

### 3.1 `SnapshotBreakdown` schema extended (`src/types/database.ts`)

Added fields that the dashboard needed but the snapshot didn't carry. New fields are **optional** so legacy rows still render with sensible fallbacks:

| Field | Was | Now |
|---|---|---|
| `by_platform[name].try` | missing | added |
| `by_platform[name].color` | missing | added |
| `by_tag[name].try` | missing | added |
| `by_asset[i].value_try` | missing | added |

Dropped: `TagAllocation.quantity` from `useDashboard` (it was unused — `TagBreakdown` UI doesn't render it).

### 3.2 All three snapshot writers updated

- `supabase/functions/take-snapshots/index.ts` — writes new fields. **Plus** new defensive guard: if any held asset has `price_usd <= 0`, the user is **skipped** for this run with a logged error. This is the *exact* failure mode that produced the April 9 orphan (cash holding had no price-cache entry yet, silently dropped from totals). Skipping for one day is recoverable; locking in a wrong total is not.
- `supabase/functions/backfill-snapshots/index.ts` — writes new fields. Already had the unpriced guard.
- `src/lib/queries/snapshots.ts` (`createSnapshot`, the in-browser writer) — writes new fields. **Plus** same defensive guard, but as a thrown `Error`. The auto-refresh path catches; the manual "Take Snapshot" button surfaces a toast.

### 3.3 `useDashboard` rewritten (`src/hooks/useDashboard.ts`)

The aggregation loops over `holdings × prices` are gone. Every dashboard number now comes from `snapshots[snapshots.length - 1].breakdown`:

- `totalValueUsd` / `totalValueTry` ← `latest.total_usd` / `latest.total_try`
- `byCategory` ← `breakdown.by_category` (with `vals.try ?? vals.usd × breakdown.rates.usd_try` fallback for legacy rows — note: uses the **snapshot's recorded** rate, *not* live `usdTry`, so a year-old row doesn't get retro-converted at today's rate)
- `byPlatform` ← `breakdown.by_platform` (color falls back to `#94a3b8` for legacy rows that pre-date the field)
- `byTag` ← `breakdown.by_tag`
- `topMovers` ← `deriveTopMovers(breakdown.by_asset, assets, transactions, rates)`. Per-asset current value comes from the snapshot (sum across platforms), cost basis from `computeFIFOLots(txs, rates)`, P&L = the difference.

Public API of `useDashboard` is unchanged except for dropping `quantity` from `TagAllocation` and dropping `investmentPnL` (it was internal-only — verified by grep before removal).

### 3.4 `SnapshotsContext` introduced (`src/contexts/SnapshotsContext.tsx`)

`useSnapshots` is now an alias re-exported from `@/contexts/SnapshotsContext`. Reasons:

- Multiple callers (`useDashboard`, `PerformancePage`, `SnapshotManager`) used to each `fetchSnapshots()` independently. Wasteful, but more importantly — if one writes a fresh snapshot, the others don't know.
- The auto-refresh that keeps today's snapshot trailing the freshest prices needs to live in *one* place. A context is the natural home.

The provider's auto-refresh effect:
- watches `usePrices().lastUpdated`
- dedupes by that timestamp (one snapshot write per `lastUpdated` value, ever — held in a ref)
- resets the dedupe ref on user change (so a new login still gets a fresh snapshot on first price load)
- on success, calls `load()` so all consumers see the new row
- failures are caught and `console.warn`'d — non-fatal; dashboard falls back to the previous snapshot

Wired into `src/main.tsx` *between* `TransactionDataProvider` and `TransactionProvider`.

### 3.5 `formatSigned` minus-sign bug fixed (`src/components/dashboard/DashboardHero.tsx:59`)

```ts
// before: dropped the minus on losses
const sign = value >= 0 ? "+" : ""

// after: explicit minus, mirrors compactCurrency right below it
const sign = value > 0 ? "+" : value < 0 ? "-" : ""
```

This is why the screenshot showed `$940.79` for a value of `−$940.79`.

---

## 4. **Required manual cleanup the user still needs to run**

This is **not in the code**. It's data + deploy work. Without it, the chart still shows the April 9 dip.

```sql
-- Supabase SQL editor
DELETE FROM snapshots WHERE snapshot_date = '2026-04-09';
```

```bash
# Local terminal — pushes the new edge-function code to Supabase Cloud.
supabase functions deploy backfill-snapshots take-snapshots
```

Then in the app:
- **Settings → Run backfill**
- **Overwrite ON**
- Granularity: **"Each transaction day"** (safer than weekly+daily; ensures any other gap-day orphans get caught too)

After that, verify the diagnostic SQL returns `asset_count=2` for April 9 and that the dashboard chart no longer dips.

---

## 5. Future work — what the next agent should pick up

### 5.1 Migrate `usePnL` / `usePortfolio` to read from snapshot (deliberate gap)

**Why deferred:** the portfolio page is more involved (per-platform drill-down, group-by-category/tag/platform UI, FIFO-sourced cost basis). Doing it in this session would have ballooned the diff right after a heavy cash-flow refactor and risked breaking a working page. The dashboard duplication was the more pressing one.

**What to do:**
- `usePnL`'s per-asset `currentValueUsd` should come from `snapshot.by_asset` (sum `value_usd` across platforms keyed by `ticker`), not `bn(h.balance).times(bn(currentPriceUsd))`. The pattern to copy is `deriveTopMovers` in `src/hooks/useDashboard.ts:90`.
- `costBasisUsd` keeps coming from `computeFIFOLots(txs, rates)` — no change.
- `usePortfolio.ts`'s per-platform values (used by the "group by platform" view) need per-(asset, platform) `value_usd` and `value_try`. The snapshot's `by_asset` is *already* per (asset, platform) — each entry has both `ticker` and `platform` keys, so look up by that pair.
- Guard against the empty-snapshot case. New users with no snapshot yet should still see something. Either fall back to live computation, or trigger a snapshot eagerly on their first dashboard load.

When done, the *entire* "current portfolio value" math lives in one place: the snapshot path.

### 5.2 `usePrices` should be a context too

Currently `usePrices` is a hook with per-call state. `Header`, `SnapshotsProvider`, and `useDashboard` each have their own instance. Consequence: when the user clicks the **Refresh prices** button in the header, only `Header`'s `usePrices` instance reloads. `SnapshotsProvider`'s instance stays stale until *its own* staleness check fires. So the manual click does **not** immediately trigger a snapshot refresh.

**What to do:** lift `usePrices` into `PricesProvider` mirroring `SnapshotsProvider`. Then `refreshPrices()` writes to a shared `lastUpdated`, which `SnapshotsProvider`'s effect already watches.

Low-risk; mostly mechanical. Worth doing before adding any more snapshot-dependent UI.

### 5.3 Consider reducing `useFreshTodaySnapshot`'s write rate

Right now `SnapshotsProvider`'s auto-refresh fires **every time `lastUpdated` changes**. On a normal page load, that's:
1. `usePrices.loadPrices()` reads cache → `lastUpdated` set → write #1.
2. `usePrices` auto-stale-refresh runs → fetch-prices → cache reloaded → `lastUpdated` updates → write #2.

Two snapshot writes on every page load is fine for cost (Supabase free tier, JSONB column, sub-millisecond write) but not great for `created_at` history if anyone ever audits when snapshots were taken.

**Possible fix:** debounce by 5–10s, or only write when `lastUpdated` is *fresher* than the previous write *and* differs by more than a threshold.

Not urgent; flagged for awareness.

### 5.4 Cron monitoring still owed (carryover from `post-deploy-gaps.md`)

The `daily-portfolio-snapshot` cron has not been observed firing in production since deploy. With the new defensive guard in `take-snapshots`, the *most likely* failure mode going forward is "skipped — N unpriced holding(s)" rather than a silent partial write. **Watch the edge function logs.** If skips appear, that's `price_cache` being stale at 23:55 UTC, not a regression — usually because `fetch-prices` ran into an upstream rate limit. The dashboard will simply trail by 24h until the next clean run, which is the correct behavior.

### 5.5 Documentation / PRD update (carryover from `post-deploy-gaps.md` §6)

`PRD.md` §5 (Snapshots) and §16 (Status matrix) are still pre-deploy era. Reflect:
- Snapshot density: daily-30 + weekly-older (not monthly).
- Snapshot is the source-of-truth for dashboard aggregations as of this session.
- Auto-refresh on price update via `SnapshotsProvider`.

Not a session of work; bundle with the next docs commit.

---

## 6. Things the next agent should *not* do

- **Do not** re-introduce `holdings × prices` aggregation on the dashboard. The whole point of this refactor is one source of truth. If a new dashboard feature needs derived data, it goes in `snapshot.breakdown` (extending the schema as we did here) and is read by the dashboard — not computed in `useDashboard`.
- **Do not** remove the unpriced-holdings guards in `take-snapshots`, `backfill-snapshots`, or `createSnapshot`. They are the structural defense against the failure mode that produced the April 9 orphan. If they're noisy, the right answer is to fix `fetch-prices` so the cache *is* complete, not silence the guard.
- **Do not** weaken `formatSigned` back to "no minus on negatives". The dashboard tooltip is the only place users see a number with a sign — and a `-$940` rendered as `$940` is the worst possible silent failure for a P&L tracker.
- **Do not** delete the `created_at`-stale orphan (April 9) without first running `supabase functions deploy` for the new edge-function code. Otherwise the next backfill will rewrite it using the same buggy code that created it.

---

## 7. Verification after the manual cleanup

1. SQL: `SELECT snapshot_date, total_usd, jsonb_array_length(breakdown->'by_asset') AS n FROM snapshots WHERE snapshot_date = '2026-04-09';` → should return one row, `n = 2`, `total_usd ≈ 2200`.
2. Dashboard hero, **1Y** range, **P&L** view → no dip on April 9. Tooltip on a negative point shows a leading `−`.
3. `npm run typecheck` → clean.
4. `npm run build` → clean.
5. Force a stale-price refresh (`Header` → Refresh prices). After it completes, the dashboard hero updates within ~1s. Behind the scenes, `SnapshotsProvider` should have written a new snapshot for today; verify with `SELECT created_at FROM snapshots WHERE snapshot_date = current_date ORDER BY created_at DESC LIMIT 1;`.

---

## 8. Quick file-level diff index

| File | Why it changed |
|---|---|
| `src/types/database.ts` | Extended `SnapshotBreakdown` shape. |
| `supabase/functions/take-snapshots/index.ts` | Writes new fields + unpriced guard. |
| `supabase/functions/backfill-snapshots/index.ts` | Writes new fields. |
| `src/lib/queries/snapshots.ts` | `createSnapshot` writes new fields + unpriced guard. |
| `src/hooks/useDashboard.ts` | **Rewritten** — reads from snapshot, drops `holdings × prices` loops. |
| `src/contexts/SnapshotsContext.tsx` | **New** — shared snapshot store + auto-refresh on price update. |
| `src/hooks/useSnapshots.ts` | Now an alias re-export so existing imports work unchanged. |
| `src/main.tsx` | Wires `SnapshotsProvider`. |
| `src/components/dashboard/DashboardHero.tsx` | `formatSigned` shows the minus. |
