# Project Review — 2026-05-04

Reviewed the codebase end-to-end (architecture, business logic, supabase functions, migrations) and cross-referenced against the PRD and budget plan. Build passes cleanly; no TS errors.

## Overall

A genuinely well-structured project for a solo build. Clean separation: `pages → hooks → queries → supabase`. Strict TypeScript, no `any` casts, `BigNumber` used consistently for math, RLS enforced on all user-owned tables. Docs and recent commits make intent very legible. The recent comments in `useDashboardHero.ts` and `performance.ts` (around the "ALL" range zero-anchor and transfer-neutral cash flows) show real thought — those are the kinds of issues that quietly produce wrong numbers, and you've already worked through them.

## PRD vs Reality (gaps and drift)

**MVP table is mostly accurate, but a few items have drifted:**

1. **§8.1 says monthly auto-snapshots** — actual implementation in `20260502120100_daily_snapshot_cron.sql` is **daily** at 23:55 UTC. The new `take-snapshots` Edge Function + the `fetch-prices → take-snapshots` chain are nicely done, but the PRD doesn't reflect this evolution. Update §8.1 (or §16's "Automated monthly snapshots" entry → mark Done as daily).
2. **§9.5 Settings page lists 7 sections; only 3 are wired up** (`SettingsPage.tsx:16-34`): Platforms, Assets, Snapshots-Backfill. Missing tabs/sections:
   - Display currency / obfuscation toggles (actually implemented in `Header.tsx` — fine, just stale PRD)
   - Manual snapshot trigger (no UI — Backfill card covers historical, but no "snapshot now")
   - **`ManualPriceEntry.tsx` exists but is not mounted anywhere** (`src/components/prices/ManualPriceEntry.tsx`). Either expose it in Settings or delete.
   - Export / Import — acknowledged P2 not-started.
3. **PRD §16 says "MVP ~85% complete"** — feels accurate. Service worker and CSV import/export are the two real gaps left from the P2 list.

## Budget Feature (`docs/budget-feature-plan.md`) — Plan Review

The plan is detailed and implementation-ready (14 numbered steps, file paths, schemas). Nothing has been built yet — `grep budget` returns zero matches in `src/` or `supabase/`. A few notes on the plan itself before you start:

1. **Investment-into-budget conversion is computed client-side** (step 5: `useBudgetSummary` fetches buys + rates, converts in JS). Fine for a solo app, but consider that `total_cost` is already stored on the transaction row — you might just sum `total_cost` filtered by `price_currency` and apply rates only where needed.
2. **No category normalization**: `category` is free-text, autocomplete from past values. Workable, but typos like "Market" / "market" / "Markett" will fragment your charts. A simple `LOWER(TRIM(category))` index, or normalizing on insert, prevents this.
3. **`buy` filter assumes investments = buys**, but `transfer_in` (after the `20260503100000_reclassify_loading_event` migration) now represents opening balances, *not* new cash. Don't include `transfer_in`; the plan correctly says "buy only" — just flagging that the loading-event reclassification matters here.
4. **The plan doesn't address sells / dividends / interest as cash flow** to the user. If you sell BTC for $10k and that hits Paribu cash, that's "income" in cash-flow terms — the plan won't reflect it. May be intentional (you only care about money flowing in from outside), but worth deciding explicitly.
5. **Step 13 layout is sensible**, but no empty-state UX is defined. Add a "no entries this month → CTA to add" so the page isn't blank when navigating to a new month.

## Issues Worth Acting On (priority order)

### 1. `balance.ts:37` writes `balance.toNumber()` to Postgres

`holdings.balance` is `numeric` (lossless) but you cast to JS `number` (~15-17 sig figs) before upsert. This is the one place in the codebase that violates your own "all money/quantity math via bignumber.js" rule. For BTC at 8 decimals it's fine; for tokens with >15 sig figs of meaningful precision, it silently rounds. Pass the `BigNumber.toFixed()` string to supabase — `numeric` accepts strings.

Same issue in `snapshots.ts:154-155`, `:111-112`, `:121-122`, `:132-133` — `.toNumber()` on aggregated values before insert.

### 2. Bundle size: 1.35MB unminified JS (400kB gzip)

Your PRD targets PWA-on-mobile. Recharts is the biggest offender. Easy wins:

- `React.lazy()` per route in `App.tsx` (Performance, Settings rarely visited).
- Lazy-load `recharts` inside chart components only.

First-paint on 3G drops noticeably — worth it.

### 3. Public unauthenticated Edge Functions

`config.toml:374-381` sets `verify_jwt = false` on `take-snapshots` and `backfill-snapshots`. They both use the service role internally. Anyone with the URL can trigger writes. For `take-snapshots` it's idempotent (upsert today's snapshot) so the blast radius is small. For `backfill-snapshots` it's heavier — long-running, hits external APIs, can overwrite. Even for a personal app, consider a shared-secret header check inside the function, or restrict `backfill-snapshots` to JWT-authenticated only and have the cron call only `take-snapshots`.

### 4. Duplicate fetching across dashboard hooks

`useDashboard`, `usePnL`, `useDashboardHero`, `useCostBasis` each make their own `fetchTransactionsForAllAssets` + `fetchAllExchangeRates` calls. On Dashboard mount you're fetching the same transactions 3-4× over. The `TransactionContext` you added recently is the right place to put this — make it the single source of truth for transactions and rates.

### 5. `useDashboard.ts` recomputes `computeHoldingValue` 3× per holding

Minor, but the function loops over `holdings` four times (totals, by-category, by-platform, by-tag) and recomputes `bn(h.balance).times(bn(price.price_usd))` each pass. Single pass with accumulators is cleaner and faster.

### 6. Language inconsistency

Settings page uses English ("Settings", "Manage your platforms..."), but `SnapshotBackfillCard.tsx`, `DashboardHero.tsx`, etc. are Turkish. Pick one and stick to it (Turkish seems to be the user-facing default).

### 7. FIFO `fee` handling — worth a doc comment

In `fifo.ts:104-141`, fees consume cost-basis lots AND record realized P&L as `-feeCostUsd` (current market value of fee paid). This double-counts if cost basis ≠ market value at fee time. It's self-consistent and conservative, but probably worth a one-line comment so future-you doesn't re-litigate it.

## Things I Liked

- The `applyTxToInvested` function in `performance.ts` and the reasoning behind treating `transfer_in/out` as cash-flow-neutral. The migration `20260503100000_reclassify_loading_event.sql` shows you spotted and fixed the underlying data issue cleanly.
- `localIso` / `pad2` helpers — using them consistently to dodge timezone drift.
- The synthetic zero-anchor in `useDashboardHero` for the "ALL" range is the right fix for the right reason.
- RLS policies are uniform (4 per user-owned table) and `price_cache` / `exchange_rates` correctly readable by all authenticated.
- Edge Functions handle CORS preflight and have explicit error collection — easier to debug than silent failures.

## Suggested Next Moves

1. Fix `balance.toNumber()` → use BigNumber strings for Postgres `numeric` writes. ~30 min.
2. Update PRD §8.1 / §16 to reflect daily (not monthly) auto-snapshots.
3. Decide on `ManualPriceEntry` — wire it into Settings or delete it.
4. Lock down `backfill-snapshots` (require JWT or shared secret).
5. Consolidate transaction/rate fetching into `TransactionContext`.
6. Then start the budget feature — the plan is solid, just clarify the cash-flow semantics (point 4 above) before coding.
