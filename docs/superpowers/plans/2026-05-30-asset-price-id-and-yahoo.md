# Asset `price_id` + Yahoo crypto pricing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separate the price-fetch key (`price_id`) from the display label (`ticker`), move BTC/ETH/PAXG/XAUT pricing to Yahoo to fill the 2024-2025 snapshot gap, and show ticker-only in display rows.

**Architecture:** Add a nullable `assets.price_id` column; all fetch sites read `price_id ?? ticker`, so behaviour is identical until rows are backfilled. The migration backfills `price_id = ticker`, retargets the 6 crypto/gold-token rows to Yahoo, and re-keys `price_cache` so there's no unpriced window. `ticker` becomes display-only.

**Tech stack:** React 19 + Vite + TypeScript, Supabase (Postgres + Deno edge functions), Tailwind/shadcn, bignumber.js.

**No test suite** (project convention). Per-task verification = `npm run typecheck` + `npm run lint`; final gate = `npm run build`. Functional verification happens on live prod after deploy (project convention: no local dev server).

**Spec:** `docs/superpowers/specs/2026-05-30-asset-price-id-and-yahoo-design.md`

**Parallelism:** Phase 0 is sequential (shared type + migration file). Phase 1 has three streams (A/B/C) that touch **disjoint files** and run in parallel. Phase 2 (rollout) is sequential and run by the human/orchestrator, not agents.

---

## Phase 0 — Foundation (sequential, blocks Phase 1 B & C)

### Task 0.1: Add `price_id` to the Asset type

**Files:**
- Modify: `src/types/database.ts:25-37` (Asset interface)

- [ ] **Step 1:** Add `price_id` to the `Asset` interface, right after `ticker`:

```ts
export interface Asset {
  id: string;
  user_id: string;
  category: string;
  ticker: string;
  /** Provider-specific identifier used to FETCH prices (e.g. "BTC-USD" for
   *  Yahoo, "bitcoin" for CoinGecko). Display uses `ticker`. Fetch sites read
   *  `price_id ?? ticker` so a null behaves like the old ticker-as-key. */
  price_id: string | null;
  name: string;
  tags: string[];
  price_source: string;
  is_currency: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
```

`AssetInsert`/`AssetUpdate` (lines 143-144) derive from `Asset`, so they pick up `price_id` automatically (`AssetInsert` will now require it; `AssetUpdate` makes it optional).

- [ ] **Step 2:** `npm run typecheck`. Expected: errors ONLY at `AssetInsert` call sites missing `price_id` (these are fixed in Stream C, Task C.5/C.6). No errors in `src/types/database.ts` itself.

- [ ] **Step 3:** Commit.

```bash
git add src/types/database.ts
git commit -m "feat(assets): add price_id field to Asset type"
```

### Task 0.2: Create the migration files (split into safe + breaking)

The migration is split so the safe half can land ahead of the code deploy.

**Files:**
- Create: `supabase/migrations/20260530000000_asset_price_id_column.sql` — **safe**, behaviour-neutral (add column + backfill `price_id = ticker`). Applied to prod immediately by the orchestrator.
- Create: `supabase/migrations/20260530000001_asset_yahoo_retarget.sql` — **breaking** (ticker renames + `price_source = yahoo` + `price_cache` re-key). Applied in **Phase 2**, in lockstep with the frontend + edge-function deploy. Applying it earlier makes the live app show crypto as unpriced.

(See the two committed files for exact SQL.)

---

## Phase 1 — Code changes (Streams A, B, C run in parallel)

### Stream A — Edge functions (Deno). Owns: `supabase/functions/{fetch-prices,take-snapshots,backfill-snapshots}/index.ts`

**Rule for the whole stream:** anywhere an asset's `ticker` is used as a *fetch key* or to *key `price_cache`*, use `price_id ?? ticker`. Anywhere `ticker` is *displayed/stored for display* (e.g. `breakdown.by_asset[].ticker`), keep `ticker`.

#### Task A.1: `fetch-prices` — fetch and cache by price_id

**File:** `supabase/functions/fetch-prices/index.ts`

- [ ] **Step 1:** CoinGecko branch (around lines 138-185): change the asset query to `select("ticker, price_id")`; build ids from `price_id ?? ticker`; key `price_cache` rows by that same value. Concretely:
  - Line 140: `.select("ticker, price_id")`
  - Line 145: `const ids = [...new Set(assets.map((a) => (a.price_id ?? a.ticker).toLowerCase()))]` (rename the local `tickers` → `ids`; iterate over these to read `cgData[id]` and write `ticker: id` in the cache row).
- [ ] **Step 2:** Yahoo branch (around lines 199-270): `.select("ticker, price_id")`; build the symbol set from `price_id ?? ticker`; fetch + cache keyed by that symbol. The `.IS` TRY check stays on the symbol string (Yahoo symbols like `BTC-USD` aren't `.IS`, so they price as USD — correct).
- [ ] **Step 3:** TCMB rows (lines 97-110): unchanged — `USD`/`EUR`/`TRY`/`XAU_GRAM` are their own price_id values.
- [ ] **Step 4:** `cd supabase/functions/fetch-prices && deno check index.ts` (if `deno` available; otherwise eyeball — these functions are not part of the Vite typecheck).
- [ ] **Step 5:** Commit: `git commit -am "feat(fetch-prices): key price fetch/cache by price_id"`

#### Task A.2: `take-snapshots` — resolve prices by price_id

**File:** `supabase/functions/take-snapshots/index.ts`

- [ ] **Step 1:** Where the asset query is built, include `price_id`. Where `prices[asset.ticker]` resolves a cache row, change to `prices[asset.price_id ?? asset.ticker]`.
- [ ] **Step 2:** Re-key any hardcoded ticker checks (e.g. `=== "USD"`, `"tether"`, `"usd-coin"`, `"XAU_GRAM"`) onto `price_id ?? ticker`. Keep `breakdown.by_asset[].ticker = asset.ticker` (display).
- [ ] **Step 3:** Read the file first to confirm exact lines; the stale-price/skip logic is unchanged in structure.
- [ ] **Step 4:** Commit: `git commit -am "feat(take-snapshots): resolve prices by price_id"`

#### Task A.3: `backfill-snapshots` — historical fetch + pricing by price_id

**File:** `supabase/functions/backfill-snapshots/index.ts`

- [ ] **Step 1:** Replace `heldTickers` with held **price_ids**: when building the set (lines 344-348), push `a.price_id ?? a.ticker`. Build a parallel `assetsByPriceId` map (or extend `AssetRow` with `price_id` in the select at line 251 and the interface at lines 6-14).
- [ ] **Step 2:** `coingeckoTickers` (lines 353-356) → filter assets where `price_source === "coingecko"` excluding the stablecoins, keyed by price_id (`pid !== "tether" && pid !== "usd-coin"`). After migration this set is empty; that's fine.
- [ ] **Step 3:** `yahooTickers` (lines 371-374) → assets where `price_source === "yahoo"`, fetch via `fetchYahooHistory(price_id, fromTs, toTs)`; store in `priceMaps` keyed by price_id. This now includes `BTC-USD`/`ETH-USD`/`PAXG-USD`/`XAUT-USD` — **the gap fix**.
- [ ] **Step 4:** `XAU_GRAM` special (lines 387-400): key on `price_id === "XAU_GRAM"`.
- [ ] **Step 5:** Pricing loop (lines 486-494): re-key the hardcoded cases onto the asset's price_id — `=== "USD"`, `"TRY"`, `"EUR"`, `"tether"`, `"usd-coin"`; the fallthrough `priceMaps.get(a.price_id ?? a.ticker)`. Keep `byAsset.push({ ticker: a.ticker, ... })` (display).
- [ ] **Step 6:** Commit: `git commit -am "feat(backfill): fetch+price by price_id, crypto via Yahoo"`

---

### Stream B — Client price resolution. Owns: `src/lib/queries/prices.ts`, `src/contexts/PricesContext.tsx`, `src/hooks/usePortfolio.ts`, `src/hooks/usePnL.ts`, `src/hooks/useDashboard.ts`

**Rule:** the `price_cache` map is keyed by `price_id` values now. Every consumer that did `prices[asset.ticker]` must do `prices[asset.price_id ?? asset.ticker]`. Display of `asset.ticker` is unchanged.

#### Task B.1: prices query keying note
**File:** `src/lib/queries/prices.ts` — no change needed (it keys by `row.ticker`, the cache's own key column, which now holds price_id values). Add a one-line comment clarifying the key is a price_id. Verify nothing else assumed the key was a display ticker.

#### Task B.2: Re-key all price lookups
**Files:** `src/contexts/PricesContext.tsx`, `src/hooks/usePortfolio.ts`, `src/hooks/usePnL.ts`, `src/hooks/useDashboard.ts`

- [ ] **Step 1:** Read each file; find every `prices[<asset>.ticker]` (and any `Map` keyed by ticker that is then matched against `price_cache`). Replace the **lookup key** with `<asset>.price_id ?? <asset>.ticker`.
- [ ] **Step 2:** In `PricesContext.tsx` stale-asset detection, the keys are price_ids; if it maps those back to a user-facing label, map through the asset to show `ticker`. (Read to confirm; keep display as ticker.)
- [ ] **Step 3:** Leave all *display* uses of `ticker` untouched (e.g. `useDashboard` building `TopMover.ticker`).
- [ ] **Step 4:** `npm run typecheck && npm run lint`. Expected: clean (Phase 0 type is merged).
- [ ] **Step 5:** Commit: `git commit -am "feat(prices): look up price_cache by price_id"`

---

### Stream C — Display rows + asset form. Owns: `src/components/portfolio/PortfolioRow.tsx`, `src/components/transactions/TransactionRow.tsx`, `src/components/dashboard/TopMovers.tsx`, `src/components/assets/AssetForm.tsx`, `src/components/assets/AssetList.tsx`, `src/hooks/useAssets.ts`, `src/components/transactions/sheet/ResolveAssetsStepper.tsx`

#### Task C.1: PortfolioRow — ticker only
**File:** `src/components/portfolio/PortfolioRow.tsx`
- [ ] Read the file. Make `asset.ticker` the row's primary identifier; remove the full `asset.name` as the row label (both desktop row ~line 58 and mobile card ~line 100). If the name was the primary line and ticker secondary, swap so only ticker shows. Keep all numeric/value columns.

#### Task C.2: TransactionRow — ticker only
**File:** `src/components/transactions/TransactionRow.tsx`
- [ ] Read the file. Show `tx.assets?.ticker` as the asset label; remove the full name as the row label (~line 148 and the delete-confirmation ~line 272 may keep ticker).

#### Task C.3: TopMovers — ticker only
**File:** `src/components/dashboard/TopMovers.tsx`
- [ ] Read the file. Render `mover.ticker` as the label; drop the full name line if present. (`TopMover` already carries `ticker`; no hook change.)

#### Task C.4: AssetForm — add price_id input
**File:** `src/components/assets/AssetForm.tsx`
- [ ] **Step 1:** Add a controlled `price_id` text input below the ticker field. State: `const [priceId, setPriceId] = useState(asset?.price_id ?? "")`; hydrate in the edit-mode effect alongside ticker/priceSource.
- [ ] **Step 2:** Hint text: `"Provider id used to fetch price — e.g. BTC-USD (Yahoo), bitcoin (CoinGecko). Leave blank to use the ticker."`. Reword the existing ticker hint so ticker reads as the display shorthand (drop "Use CoinGecko ID").
- [ ] **Step 3:** In `onSubmit`, include `price_id: trimmedPriceId || trimmedTicker` (coalesce blank → ticker).
- [ ] **Step 4:** Add `price_id` to the form's submit payload type so it flows to `AssetList`.

#### Task C.5: AssetList — pass price_id through
**File:** `src/components/assets/AssetList.tsx`
- [ ] In both `addAsset(...)` and `editAsset(id, ...)` payloads, include `price_id: data.price_id`.

#### Task C.6: useAssets + ResolveAssetsStepper — include price_id on insert
**Files:** `src/hooks/useAssets.ts`, `src/components/transactions/sheet/ResolveAssetsStepper.tsx`
- [ ] **Step 1:** `useAssets.ts`: ensure `addAsset`/`editAsset` types accept `price_id` (they take `AssetInsert`/`AssetUpdate`, which now include it — confirm no narrower local type drops it).
- [ ] **Step 2:** `ResolveAssetsStepper.tsx`: in the `addAsset({...})` call (~lines 161-169) add `price_id: form.ticker` (bulk import defaults price_id to ticker).

#### Task C.7: verify Stream C
- [ ] `npm run typecheck && npm run lint`. Expected: clean (this resolves the `AssetInsert` errors surfaced by Phase 0). Commit: `git commit -am "feat(assets): ticker-only rows + price_id form input"`

---

## Phase 2 — Rollout & gap fill (sequential; orchestrator/human, after Phase 1 merged + `npm run build` green)

- [ ] **Step 1:** Apply the **breaking** retarget migration via Supabase MCP `apply_migration` (project `hhqwxygrtqcugaxamrtu`, name `asset_yahoo_retarget`, SQL from `20260530000001_asset_yahoo_retarget.sql`). The safe column migration `20260530000000` was already applied during Phase 0. Apply this in lockstep with Step 3's deploy.
- [ ] **Step 2:** Verify rows: `select ticker, price_id, price_source from assets where category in ('crypto','gold')` → BTC/ETH/PAXG/XAUT on yahoo with `*-USD` price_ids; USDT/USDC with price_id `tether`/`usd-coin`.
- [ ] **Step 3:** Deploy frontend + edge functions (hand the user the `npm run deploy` / function-deploy commands per project deploy-handoff convention; do not run `vercel --prod` directly).
- [ ] **Step 4:** Invoke `fetch-prices` once; confirm `price_cache` has fresh rows keyed `BTC-USD`/`ETH-USD`/`PAXG-USD`/`XAUT-USD`.
- [ ] **Step 5:** Re-run backfill (Settings → Historical Snapshots) with **overwrite = true**, monthly granularity.
- [ ] **Step 6:** Verify the gap is gone: re-run the `LAG()` gap query — no >7-day gaps except genuine empty-portfolio periods; snapshot count up ~60. Spot-check a mid-gap date (e.g. 2024-09-01) now exists with crypto in `breakdown`.

---

## Self-review notes
- **Spec coverage:** price_id column ✅ (0.1, 0.2); fetch-by-price_id ✅ (A.1-A.3, B); ticker-only rows ✅ (C.1-C.3); price_id form input ✅ (C.4-C.6); Yahoo retarget + gap fill ✅ (0.2, A.3, Phase 2); stablecoin $1 kept ✅ (0.2 keeps coingecko + price_id; A.3 step 5); search keeps name ✅ (not in scope of C = unchanged).
- **No silent caps:** the empty CoinGecko fetch set post-migration is expected, not an error.
- **Type consistency:** `price_id: string | null` everywhere; fetch sites use `price_id ?? ticker`; cache key column remains `price_cache.ticker` (holds price_id values).
