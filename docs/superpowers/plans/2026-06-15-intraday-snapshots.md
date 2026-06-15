# Intraday (hourly) Snapshots Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture the portfolio's total value hourly for a rolling 24-hour window via a server-side cron, render that intraday detail in the dashboard hero's existing 1D view, and prune rows older than 24h (the daily snapshot remains each day's permanent record).

**Architecture:** A new `intraday_snapshots` table (timestamp-keyed, totals-only) is written each hour by a new `take-intraday-snapshots` edge function, chained from `fetch-prices` (forced refresh) by a new hourly `pg_cron`. The per-user valuation loop is extracted from `take-snapshots` into `_shared/valuation.ts` so the new function adds no duplicate logic. The client reads the last 24h via `SnapshotsContext` and, for `timeRange === "1D"`, builds the hero chart from intraday points on a time-of-day axis with the index overlay suppressed.

**Tech Stack:** Supabase (Postgres + RLS, pg_cron, pg_net, Vault), Deno edge functions, React 19 + Vite + TypeScript, Recharts, Vitest (client-only test runner).

> **Testing note:** There is no Deno test harness in this repo — edge functions and SQL are verified by `deno check` (where available) plus deploy-and-smoke on prod (the repo's commit→push→test-on-prod workflow). Only the pure client-side intraday series builder (Task 8) is unit-tested with Vitest. Do **not** add a Deno test runner — out of scope.

> **Deploy note:** Per project convention, do **not** run `vercel --prod`, `supabase db push`, or `supabase functions deploy` yourself. The final task hands the user the exact commands to run.

---

## File Structure

**Server (Deno / SQL):**
- Create `supabase/migrations/20260615000000_intraday_snapshots.sql` — table, index, RLS.
- Create `supabase/functions/_shared/valuation.ts` — extracted `valueHoldings()` + shared types.
- Modify `supabase/functions/_shared/constants.ts` — move `STALE_PRICE_MS` here.
- Modify `supabase/functions/take-snapshots/index.ts` — call `valueHoldings()` (behavior-preserving).
- Create `supabase/functions/take-intraday-snapshots/index.ts` — hourly writer + prune.
- Modify `supabase/config.toml` — register `take-intraday-snapshots`.
- Modify `supabase/functions/fetch-prices/index.ts` — generalize trigger + `intraday` flag.
- Create `supabase/migrations/20260615000100_schedule_intraday_snapshot_cron.sql` — hourly cron.

**Client (TypeScript):**
- Modify `src/types/database.ts` — `IntradaySnapshot` interface.
- Modify `src/lib/queries/snapshots.ts` — `fetchIntradaySnapshots()`.
- Modify `src/contexts/SnapshotsContext.tsx` — load + expose `intradaySnapshots`.
- Create `src/lib/dashboard/intraday.ts` — pure `buildIntradaySeries()`.
- Create `src/lib/dashboard/intraday.test.ts` — Vitest tests.
- Modify `src/hooks/useDashboardHero.ts` — `intradaySnapshots` arg + `timeRange === "1D"` branch.
- Modify `src/components/dashboard/DashboardHero.tsx` — pass intraday in; suppress index overlay + chip in 1D; HH:mm tooltip.

**Docs:**
- Modify `docs/components/10-snapshots-performance.md`, `docs/components/technical/10-snapshots-performance.md`, `docs/components/07-dashboard.md`, `docs/components/technical/07-dashboard.md`, `docs/components/GLOSSARY.md`.

---

## Task 1: `intraday_snapshots` table migration

**Files:**
- Create: `supabase/migrations/20260615000000_intraday_snapshots.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Intraday (hourly) snapshots — a rolling ~24h window of totals-only points.
--
-- Separate from `snapshots` (which is UNIQUE(user_id, snapshot_date) on a DATE
-- column — one row per day, the permanent record). This table is timestamp-keyed
-- and append-only; the hourly writer (take-intraday-snapshots) prunes rows older
-- than 24h every run, so it never grows beyond ~24 rows per user. Totals only —
-- no breakdown jsonb; allocation doesn't move intraday and the 1D chart needs
-- only totals. The daily 23:55 snapshot stays the authoritative per-day value.

CREATE TABLE public.intraday_snapshots (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  captured_at timestamptz NOT NULL DEFAULT now(),
  total_usd   numeric,
  total_try   numeric
);

CREATE INDEX idx_intraday_user_captured
  ON public.intraday_snapshots(user_id, captured_at);

ALTER TABLE public.intraday_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY intraday_snapshots_select ON public.intraday_snapshots FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY intraday_snapshots_insert ON public.intraday_snapshots FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY intraday_snapshots_update ON public.intraday_snapshots FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY intraday_snapshots_delete ON public.intraday_snapshots FOR DELETE USING (auth.uid() = user_id);
```

- [ ] **Step 2: Verify SQL parses locally (if Supabase CLI is installed)**

Run: `supabase db lint --schema public` (or skip if CLI not installed — it's applied on deploy in Task 12).
Expected: no syntax errors. If the CLI isn't available, visually confirm the statements mirror the `snapshots` table/policies in `20260520000000_init.sql`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260615000000_intraday_snapshots.sql
git commit -m "feat(db): intraday_snapshots table (rolling 24h, totals-only)"
```

---

## Task 2: Extract `valueHoldings()` into `_shared/valuation.ts`

This is a **behavior-preserving** refactor. `take-snapshots` must produce byte-identical snapshot rows after this task.

**Files:**
- Modify: `supabase/functions/_shared/constants.ts`
- Create: `supabase/functions/_shared/valuation.ts`
- Modify: `supabase/functions/take-snapshots/index.ts:5-67` (types + `STALE_PRICE_MS`) and `:174-289` (per-user loop)

- [ ] **Step 1: Move `STALE_PRICE_MS` into `_shared/constants.ts`**

Append to `supabase/functions/_shared/constants.ts`:

```ts
/**
 * A `price_cache` row older than this is treated as MISSING. price_cache is
 * upserted in place (keyed on ticker) and never expires, so a multi-day
 * upstream outage would otherwise leave yesterday's price masquerading as
 * today's net worth. 36h tolerates a normal daily refresh cycle (incl.
 * weekends, since updated_at tracks the last fetch, not the last market move)
 * while still catching a real outage. Shared by take-snapshots and
 * take-intraday-snapshots via _shared/valuation.ts.
 */
export const STALE_PRICE_MS = 36 * 60 * 60 * 1000
```

- [ ] **Step 2: Create `supabase/functions/_shared/valuation.ts`**

```ts
import { STALE_PRICE_MS } from "./constants.ts"

export interface HoldingRow {
  user_id: string
  balance: number
  assets: {
    ticker: string
    price_id: string | null
    name: string
    category: string
    tags: string[] | null
    is_active: boolean
  } | null
  platforms: { name: string; color: string } | null
}

export interface PriceRow {
  ticker: string
  price_usd: number | null
  price_try: number | null
  updated_at: string | null
}

export interface Rates {
  usdTry: number
  eurTry: number
  goldGramTry: number
}

export interface AssetEntry {
  ticker: string
  name: string
  platform: string
  amount: number
  price_usd: number
  value_usd: number
  value_try: number
  /** True when the price_cache row existed but was older than STALE_PRICE_MS,
   *  so it was treated as unpriced. Used only to label the skip message. */
  stale: boolean
}

export interface ValuationResult {
  totalUsd: number
  totalTry: number
  byAsset: AssetEntry[]
  byCategory: Record<string, { usd: number; try: number; pct: number }>
  byPlatform: Record<string, { usd: number; try: number; color: string; pct: number }>
  byTag: Record<string, { usd: number; try: number; pct: number }>
  /** Held assets (amount > 0) with a non-positive/stale price. Callers decide
   *  whether to skip the whole snapshot (daily) or just this hour (intraday). */
  unpriced: AssetEntry[]
}

/**
 * Value one user's holdings against the current prices/rates. Pure (no IO).
 * Shared by take-snapshots (uses the full breakdown) and take-intraday-snapshots
 * (uses only the totals) so the per-user aggregation lives in exactly one place.
 * A stale price_cache row (older than STALE_PRICE_MS) is zeroed so it trips the
 * `unpriced` filter rather than booking an old price as today's value.
 */
export function valueHoldings(
  userHoldings: HoldingRow[],
  prices: Record<string, PriceRow>,
  rates: Rates,
  nowMs: number,
): ValuationResult {
  const byAsset: AssetEntry[] = []
  const categoryTotals: Record<string, { usd: number; try_val: number }> = {}
  const platformTotals: Record<string, { usd: number; try_val: number; color: string }> = {}
  const tagTotals: Record<string, { usd: number; try_val: number }> = {}
  let totalUsd = 0
  let totalTry = 0

  for (const h of userHoldings) {
    const asset = h.assets!
    const platform = h.platforms!
    // price_cache is keyed by price_id (the fetch key); fall back to ticker
    // until rows are backfilled.
    const price = prices[asset.price_id ?? asset.ticker]
    const updatedAt = price?.updated_at
    const stale =
      updatedAt != null && nowMs - new Date(updatedAt).getTime() > STALE_PRICE_MS
    const priceUsd = stale ? 0 : price?.price_usd ?? 0
    const priceTry = stale ? 0 : price?.price_try ?? priceUsd * rates.usdTry

    const valueUsd = h.balance * priceUsd
    const valueTry = h.balance * priceTry

    totalUsd += valueUsd
    totalTry += valueTry

    byAsset.push({
      ticker: asset.ticker,
      name: asset.name,
      platform: platform.name,
      amount: h.balance,
      price_usd: priceUsd,
      value_usd: valueUsd,
      value_try: valueTry,
      stale,
    })

    const cat = asset.category
    if (!categoryTotals[cat]) categoryTotals[cat] = { usd: 0, try_val: 0 }
    categoryTotals[cat].usd += valueUsd
    categoryTotals[cat].try_val += valueTry

    const plat = platform.name
    if (!platformTotals[plat]) {
      platformTotals[plat] = { usd: 0, try_val: 0, color: platform.color }
    }
    platformTotals[plat].usd += valueUsd
    platformTotals[plat].try_val += valueTry

    for (const tag of asset.tags ?? []) {
      if (!tagTotals[tag]) tagTotals[tag] = { usd: 0, try_val: 0 }
      tagTotals[tag].usd += valueUsd
      tagTotals[tag].try_val += valueTry
    }
  }

  const safeDiv = (n: number) => (totalUsd > 0 ? (n / totalUsd) * 100 : 0)

  const byCategory: Record<string, { usd: number; try: number; pct: number }> = {}
  for (const [k, v] of Object.entries(categoryTotals)) {
    byCategory[k] = { usd: v.usd, try: v.try_val, pct: safeDiv(v.usd) }
  }
  const byPlatform: Record<string, { usd: number; try: number; color: string; pct: number }> = {}
  for (const [k, v] of Object.entries(platformTotals)) {
    byPlatform[k] = { usd: v.usd, try: v.try_val, color: v.color, pct: safeDiv(v.usd) }
  }
  const byTag: Record<string, { usd: number; try: number; pct: number }> = {}
  for (const [k, v] of Object.entries(tagTotals)) {
    byTag[k] = { usd: v.usd, try: v.try_val, pct: safeDiv(v.usd) }
  }

  const unpriced = byAsset.filter((a) => a.amount > 0 && a.price_usd <= 0)

  return { totalUsd, totalTry, byAsset, byCategory, byPlatform, byTag, unpriced }
}
```

- [ ] **Step 3: Refactor `take-snapshots/index.ts` to use the helper**

In `supabase/functions/take-snapshots/index.ts`:

1. Replace the imports block (lines 1-3) with:

```ts
import { getServiceClient } from "../_shared/client.ts"
import { corsHeaders } from "../_shared/cors.ts"
import { HOME_TIMEZONE, STALE_PRICE_MS } from "../_shared/constants.ts"
import { valueHoldings, type HoldingRow, type PriceRow } from "../_shared/valuation.ts"
```

2. Delete the now-shared local declarations: the `HoldingRow`, `PriceRow`, `CategoryAgg`, `PlatformAgg`, `TagAgg`, `AssetEntry` interfaces (lines 5-59) and the local `const STALE_PRICE_MS = ...` (lines 61-67). Keep the local `RateRow` interface (it's the DB row shape used only here).

3. Replace the per-user loop body (lines 174-289, from `for (const [userId, userHoldings] of byUser) {` through the matching closing `}` that ends with `usersProcessed++`) with:

```ts
  for (const [userId, userHoldings] of byUser) {
    const v = valueHoldings(
      userHoldings,
      prices,
      { usdTry, eurTry, goldGramTry },
      nowMs,
    )

    // Skip the snapshot if any held asset is unpriced OR stale. The cron writes
    // once per day; a missing/stale entry would silently encode a wrong total
    // the dashboard then trusts indefinitely (the 2026-04-09 orphan). Honest
    // answer: skip the whole date.
    if (v.unpriced.length > 0) {
      errors.push(
        `user ${userId}: skipped — ${v.unpriced.length} unpriced/stale holding(s): ${v.unpriced
          .map((a) => (a.stale ? `${a.ticker} (stale)` : a.ticker))
          .join(", ")}`,
      )
      continue
    }

    snapshotInserts.push({
      user_id: userId,
      snapshot_date: today,
      total_usd: v.totalUsd,
      total_try: v.totalTry,
      breakdown: {
        rates: { usd_try: usdTry, eur_try: eurTry, gold_gram_try: goldGramTry },
        by_category: v.byCategory,
        by_platform: v.byPlatform,
        by_tag: v.byTag,
        by_asset: v.byAsset,
      },
    })
    usersProcessed++
  }
```

Note: `prices` is already built as `Record<string, PriceRow>` above (the local `PriceRow` is now the imported one — identical shape). `nowMs`, `usdTry`, `eurTry`, `goldGramTry`, `today`, `snapshotInserts`, `errors`, `usersProcessed` are all already in scope. `STALE_PRICE_MS` is imported only so the `price_cache` select keeps its `updated_at` column (no other direct use remains — if `deno check` flags it as unused, drop it from the import).

- [ ] **Step 4: Typecheck the edge functions (if `deno` is installed)**

Run: `deno check supabase/functions/take-snapshots/index.ts supabase/functions/_shared/valuation.ts`
Expected: no type errors. (If `deno` is not installed, skip — it's checked on deploy. Visually confirm the loop body uses only `v.*` fields and in-scope vars.)

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/constants.ts supabase/functions/_shared/valuation.ts supabase/functions/take-snapshots/index.ts
git commit -m "refactor(snapshots): extract valueHoldings to _shared/valuation (behavior-preserving)"
```

---

## Task 3: `take-intraday-snapshots` edge function

**Files:**
- Create: `supabase/functions/take-intraday-snapshots/index.ts`
- Modify: `supabase/config.toml` (after the `[functions.fetch-prices]` block, ~line 400)

- [ ] **Step 1: Create the function**

```ts
import { getServiceClient } from "../_shared/client.ts"
import { corsHeaders } from "../_shared/cors.ts"
import { valueHoldings, type HoldingRow, type PriceRow } from "../_shared/valuation.ts"

const WINDOW_MS = 24 * 60 * 60 * 1000

Deno.serve(async (req) => {
  const origin = req.headers.get("origin")

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(origin) })
  }

  const expectedToken = Deno.env.get("CRON_TOKEN")
  const providedToken = req.headers.get("X-Cron-Token")
  if (!expectedToken || providedToken !== expectedToken) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    })
  }

  const supabase = getServiceClient()
  const nowMs = Date.now()
  const capturedAt = new Date(nowMs).toISOString()
  const errors: string[] = []

  // ── Load shared data once ──────────────────────────────────────────
  const { data: priceRows, error: priceErr } = await supabase
    .from("price_cache")
    .select("ticker, price_usd, price_try, updated_at")
  if (priceErr) {
    return new Response(
      JSON.stringify({ error: `price_cache: ${priceErr.message}` }),
      { status: 500, headers: { ...corsHeaders(origin), "Content-Type": "application/json" } },
    )
  }
  const prices: Record<string, PriceRow> = {}
  for (const p of (priceRows ?? []) as PriceRow[]) prices[p.ticker] = p

  const { data: rateRow } = await supabase
    .from("exchange_rates")
    .select("usd_try, eur_try, gold_gram_try")
    .order("date", { ascending: false })
    .limit(1)
    .maybeSingle()
  const r = (rateRow as { usd_try: number | null; eur_try: number | null; gold_gram_try: number | null } | null)
  const rates = {
    usdTry: r?.usd_try ?? 1,
    eurTry: r?.eur_try ?? 0,
    goldGramTry: r?.gold_gram_try ?? 0,
  }

  const { data: holdingRows, error: holdingsErr } = await supabase
    .from("holdings")
    .select(
      "user_id, balance, assets(ticker, price_id, name, category, tags, is_active), platforms(name, color)",
    )
    .neq("balance", 0)
  if (holdingsErr) {
    return new Response(
      JSON.stringify({ error: `holdings: ${holdingsErr.message}` }),
      { status: 500, headers: { ...corsHeaders(origin), "Content-Type": "application/json" } },
    )
  }

  const holdings = (holdingRows ?? []) as unknown as HoldingRow[]
  const byUser = new Map<string, HoldingRow[]>()
  for (const h of holdings) {
    if (!h.assets || !h.platforms) continue
    if (!h.assets.is_active) continue
    if (h.balance <= 0) continue
    const arr = byUser.get(h.user_id) ?? []
    arr.push(h)
    byUser.set(h.user_id, arr)
  }

  // ── Value each user, totals only ───────────────────────────────────
  const inserts: Array<{
    user_id: string
    captured_at: string
    total_usd: number
    total_try: number
  }> = []
  for (const [userId, userHoldings] of byUser) {
    const v = valueHoldings(userHoldings, prices, rates, nowMs)
    // Softer than the daily writer: skip just THIS hour's row, never a date.
    // A missing intraday point is harmless for a 24h sparkline.
    if (v.unpriced.length > 0) {
      errors.push(
        `user ${userId}: skipped hour — unpriced/stale: ${v.unpriced
          .map((a) => a.ticker)
          .join(", ")}`,
      )
      continue
    }
    inserts.push({
      user_id: userId,
      captured_at: capturedAt,
      total_usd: v.totalUsd,
      total_try: v.totalTry,
    })
  }

  let written = 0
  if (inserts.length > 0) {
    const { data, error: insertErr } = await supabase
      .from("intraday_snapshots")
      .insert(inserts)
      .select("id")
    if (insertErr) errors.push(`intraday insert: ${insertErr.message}`)
    else written = data?.length ?? 0
  }

  // ── Prune the rolling 24h window ───────────────────────────────────
  const cutoff = new Date(nowMs - WINDOW_MS).toISOString()
  let pruned = 0
  const { error: pruneErr, count } = await supabase
    .from("intraday_snapshots")
    .delete({ count: "exact" })
    .lt("captured_at", cutoff)
  if (pruneErr) errors.push(`intraday prune: ${pruneErr.message}`)
  else pruned = count ?? 0

  return new Response(
    JSON.stringify({
      captured_at: capturedAt,
      written,
      pruned,
      errors: errors.length > 0 ? errors : undefined,
      timestamp: new Date().toISOString(),
    }),
    { headers: { ...corsHeaders(origin), "Content-Type": "application/json" } },
  )
})
```

- [ ] **Step 2: Register the function in `supabase/config.toml`**

Add after the `[functions.fetch-prices]` block (the `verify_jwt = false` line, ~line 400):

```toml
# Hourly intraday snapshot. Same server-only pattern as take-snapshots:
# authorized by X-Cron-Token, writes totals-only rows via the service role,
# callers cannot inject data. Chained from fetch-prices on the hourly cron.
[functions.take-intraday-snapshots]
verify_jwt = false
```

- [ ] **Step 3: Typecheck (if `deno` is installed)**

Run: `deno check supabase/functions/take-intraday-snapshots/index.ts`
Expected: no type errors. (Skip if `deno` not installed — verified on deploy in Task 12.)

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/take-intraday-snapshots/index.ts supabase/config.toml
git commit -m "feat(snapshots): take-intraday-snapshots edge function (hourly write + 24h prune)"
```

---

## Task 4: `fetch-prices` — generalize trigger + `intraday` flag

**Files:**
- Modify: `supabase/functions/fetch-prices/index.ts:424-442` (trigger fn), `:461` (body type), `:468` (flag), `:520-528` (chain step)

- [ ] **Step 1: Generalize the trigger helper**

Replace `triggerSnapshot` (lines 424-442) with:

```ts
/** Step 3 (cron only) — chain a server-side snapshot function now that prices
 *  are fresh. Fire-and-forget. Must forward X-Cron-Token: the chained function
 *  authorizes on that, not the JWT. */
function triggerChainedFunction(fnName: string, cronToken: string): void {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  fetch(`${supabaseUrl}/functions/v1/${fnName}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
      "X-Cron-Token": cronToken,
    },
    body: "{}",
  }).catch((err) => {
    console.error(`${fnName} invoke failed:`, err)
  })
}
```

- [ ] **Step 2: Add the `intraday` flag to the body type + parse**

Replace line 461:

```ts
  let body: { force?: boolean; snapshot?: boolean; intraday?: boolean } = {}
```

After line 468 (`const doSnapshot = isCron && body.snapshot === true`) add:

```ts
  const doIntraday = isCron && body.intraday === true
```

- [ ] **Step 3: Update the chain step**

Replace the Step 3 block (lines 520-528) with:

```ts
  // Step 3 — daily EOD snapshot (cron only).
  if (doSnapshot) {
    try {
      triggerChainedFunction("take-snapshots", cronToken!)
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown snapshot error"
      errors.push(`take-snapshots: ${msg}`)
    }
  }

  // Step 3.5 — hourly intraday snapshot (cron only).
  if (doIntraday) {
    try {
      triggerChainedFunction("take-intraday-snapshots", cronToken!)
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown intraday error"
      errors.push(`take-intraday-snapshots: ${msg}`)
    }
  }
```

- [ ] **Step 4: Typecheck (if `deno` is installed)**

Run: `deno check supabase/functions/fetch-prices/index.ts`
Expected: no type errors. (Skip if `deno` not installed.)

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/fetch-prices/index.ts
git commit -m "feat(prices): chain take-intraday-snapshots via fetch-prices intraday flag"
```

---

## Task 5: Hourly cron migration

**Files:**
- Create: `supabase/migrations/20260615000100_schedule_intraday_snapshot_cron.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Hourly intraday snapshot cron.
--
-- Mirrors the daily snapshot job (20260602000000): POST fetch-prices with
-- force=true (refetch everything, bypassing the demand-driven cadence/guard so
-- coverage doesn't depend on a user being present) and intraday=true (chain
-- take-intraday-snapshots once prices are fresh). The X-Cron-Token unlocks force
-- and authorizes the chained call. Vault secrets (functions_url, cron_token) are
-- unchanged from the init migration. Runs every hour on the hour, 24/7 — crypto
-- moves overnight; equities simply sit flat outside market hours.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'hourly-intraday-snapshot') THEN
    PERFORM cron.unschedule('hourly-intraday-snapshot');
  END IF;
END $$;

SELECT cron.schedule(
  'hourly-intraday-snapshot',
  '0 * * * *',
  $cron$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'functions_url') || '/fetch-prices',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Cron-Token', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_token')
    ),
    body := '{"force": true, "intraday": true}'::jsonb,
    timeout_milliseconds := 60000
  );
  $cron$
);
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260615000100_schedule_intraday_snapshot_cron.sql
git commit -m "feat(db): schedule hourly-intraday-snapshot cron"
```

---

## Task 6: Client `IntradaySnapshot` type + query

**Files:**
- Modify: `src/types/database.ts` (after the `Snapshot` interface, ~line 97)
- Modify: `src/lib/queries/snapshots.ts` (imports + new `fetchIntradaySnapshots`)

- [ ] **Step 1: Add the type to `src/types/database.ts`**

After the `Snapshot` interface (line 97), add:

```ts
/** A totals-only intraday point. The hourly cron writes one per hour and prunes
 *  rows older than 24h, so the client only ever sees a rolling ~24h window.
 *  Distinct from `Snapshot`: timestamp-keyed (`captured_at`), no breakdown. */
export interface IntradaySnapshot {
  id: string;
  user_id: string;
  captured_at: string;
  total_usd: number | null;
  total_try: number | null;
}
```

- [ ] **Step 2: Add `fetchIntradaySnapshots` to `src/lib/queries/snapshots.ts`**

Add `IntradaySnapshot` to the type import block (lines 4-11):

```ts
import type {
  Snapshot,
  IntradaySnapshot,
  SnapshotInsert,
  SnapshotBreakdown,
  Holding,
  PriceCache,
  ExchangeRate,
} from "@/types/database"
```

After `fetchSnapshots` (line 22), add:

```ts
const INTRADAY_WINDOW_MS = 24 * 60 * 60 * 1000

/** The rolling 24h of intraday (hourly) totals for the 1D hero view. The cron
 *  prunes server-side; this `gte` is a belt-and-suspenders bound so a late prune
 *  never leaks an older row into the chart. */
export async function fetchIntradaySnapshots(
  userId: string,
): Promise<IntradaySnapshot[]> {
  const since = new Date(Date.now() - INTRADAY_WINDOW_MS).toISOString()
  const { data, error } = await supabase
    .from("intraday_snapshots")
    .select("*")
    .eq("user_id", userId)
    .gte("captured_at", since)
    .order("captured_at", { ascending: true })

  if (error) throw error
  return data ?? []
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run build`
Expected: PASS (no type errors). The new exports compile even though nothing consumes them yet.

- [ ] **Step 4: Commit**

```bash
git add src/types/database.ts src/lib/queries/snapshots.ts
git commit -m "feat(snapshots): IntradaySnapshot type + fetchIntradaySnapshots query"
```

---

## Task 7: Load intraday snapshots in `SnapshotsContext`

**Files:**
- Modify: `src/contexts/SnapshotsContext.tsx`

- [ ] **Step 1: Import the query + type**

Add `fetchIntradaySnapshots` to the import from `@/lib/queries/snapshots` (lines 15-21):

```ts
import {
  fetchSnapshots,
  fetchIntradaySnapshots,
  createSnapshot,
  buildSnapshotInsert,
  persistSnapshot,
  deleteSnapshot,
} from "@/lib/queries/snapshots"
```

Add `IntradaySnapshot` to the type import (line 22):

```ts
import type { Snapshot, IntradaySnapshot, PriceCache, ExchangeRate } from "@/types/database"
```

- [ ] **Step 2: Add state + expose it on the context type**

In `SnapshotsContextValue` (lines 42-52), add after `snapshots: Snapshot[]`:

```ts
  intradaySnapshots: IntradaySnapshot[]
```

In `SnapshotsProvider`, after the `snapshots` state (line 61), add:

```ts
  const [intradaySnapshots, setIntradaySnapshots] = useState<IntradaySnapshot[]>([])
```

- [ ] **Step 3: Fetch it in `load()`**

Replace the `try` block inside `load` (lines 73-78) with:

```ts
    try {
      const [data, intraday] = await Promise.all([
        fetchSnapshots(user.id),
        fetchIntradaySnapshots(user.id),
      ])
      setSnapshots(data)
      setIntradaySnapshots(intraday)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load snapshots")
    } finally {
```

Also clear it when there's no user — replace the `if (!user)` block (lines 66-70):

```ts
    if (!user) {
      setSnapshots([])
      setIntradaySnapshots([])
      setLoading(false)
      return
    }
```

- [ ] **Step 4: Provide it in the context value**

In the `<SnapshotsContext.Provider value={{ ... }}>` object (lines 215-222), add after `snapshots,`:

```ts
        intradaySnapshots,
```

- [ ] **Step 5: Typecheck**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/contexts/SnapshotsContext.tsx
git commit -m "feat(snapshots): load intradaySnapshots in SnapshotsContext"
```

---

## Task 8: Pure `buildIntradaySeries()` + Vitest tests (TDD)

**Files:**
- Create: `src/lib/dashboard/intraday.ts`
- Test: `src/lib/dashboard/intraday.test.ts`

- [ ] **Step 1: Write the failing test**

`src/lib/dashboard/intraday.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { buildIntradaySeries } from "./intraday"
import type { IntradaySnapshot } from "@/types/database"

function snap(captured_at: string, total_usd: number, total_try: number): IntradaySnapshot {
  return { id: captured_at, user_id: "u", captured_at, total_usd, total_try }
}

describe("buildIntradaySeries", () => {
  it("positions points by captured_at epoch ms and appends the live now point", () => {
    const intraday = [
      snap("2026-06-15T07:00:00Z", 1000, 34000),
      snap("2026-06-15T08:00:00Z", 1010, 34340),
    ]
    const nowMs = new Date("2026-06-15T08:30:00Z").getTime()
    const r = buildIntradaySeries({ intraday, nowUsd: 1020, nowTry: 34680, nowMs })

    expect(r.points).toHaveLength(3)
    expect(r.points[0].dateMs).toBe(new Date("2026-06-15T07:00:00Z").getTime())
    expect(r.points[2].dateMs).toBe(nowMs)
    expect(r.points[2].label).toBe("Şimdi")
    expect(r.points[2].valueUsd).toBe(1020)
  })

  it("computes twrPct as cumulative % change from the first point", () => {
    const intraday = [
      snap("2026-06-15T07:00:00Z", 1000, 34000),
      snap("2026-06-15T08:00:00Z", 1100, 37400),
    ]
    const nowMs = new Date("2026-06-15T08:00:00Z").getTime()
    const r = buildIntradaySeries({ intraday, nowUsd: 1100, nowTry: 37400, nowMs })

    expect(r.points[0].twrPct).toBeCloseTo(0, 6)
    // last historical point is +10% from start; now coincides so dedupes
    expect(r.points[r.points.length - 1].twrPct).toBeCloseTo(10, 6)
    expect(r.twrEnd).toBeCloseTo(10, 6)
    expect(r.deltaUsd).toBeCloseTo(100, 6)
    expect(r.deltaPct).toBeCloseTo(10, 6)
  })

  it("dedupes the now point when it coincides with the last captured point", () => {
    const intraday = [snap("2026-06-15T08:00:00Z", 1000, 34000)]
    const nowMs = new Date("2026-06-15T08:00:00Z").getTime()
    const r = buildIntradaySeries({ intraday, nowUsd: 1000, nowTry: 34000, nowMs })
    // one historical + now at same ms → collapse to a single labelled "Şimdi"
    expect(r.points).toHaveLength(1)
    expect(r.points[0].label).toBe("Şimdi")
  })

  it("returns just the now point when there is no intraday history", () => {
    const nowMs = new Date("2026-06-15T08:00:00Z").getTime()
    const r = buildIntradaySeries({ intraday: [], nowUsd: 500, nowTry: 17000, nowMs })
    expect(r.points).toHaveLength(1)
    expect(r.points[0].valueUsd).toBe(500)
    expect(r.twrEnd).toBe(0)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/dashboard/intraday.test.ts`
Expected: FAIL — `buildIntradaySeries` is not defined / module not found.

- [ ] **Step 3: Implement `src/lib/dashboard/intraday.ts`**

```ts
import { HOME_TIMEZONE } from "@/lib/config"
import type { IntradaySnapshot } from "@/types/database"

/** A single 1D-view chart point. Mirrors the fields the hero chart reads off
 *  HeroPoint, but is computed purely (no React) so it can be unit-tested. */
export interface IntradayHeroPoint {
  /** captured_at ISO (or the now timestamp for the live anchor). */
  date: string
  /** Epoch ms — the chart's numeric/time X value. */
  dateMs: number
  /** "HH:mm" in the home timezone; the final point is "Şimdi". */
  label: string
  valueUsd: number
  valueTry: number
  /** Cumulative % change from the window's first point (the P&L-mode line). */
  twrPct: number
}

export interface IntradayHeroResult {
  points: IntradayHeroPoint[]
  /** One tick per point (the window is small — ≤25 points). */
  xTicks: number[]
  twrEnd: number
  deltaUsd: number
  deltaTry: number
  deltaPct: number
}

interface BuildArgs {
  /** Ascending by captured_at, already bounded to the last 24h. */
  intraday: IntradaySnapshot[]
  /** Live current value (the right-edge "now" anchor). */
  nowUsd: number
  nowTry: number
  /** "now" epoch ms — passed in so the function stays pure/testable. */
  nowMs: number
}

const timeFmt = new Intl.DateTimeFormat("tr-TR", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: HOME_TIMEZONE,
})

/**
 * Build the dashboard hero's 1D series from intraday (hourly) totals plus the
 * live "now" anchor. Points are positioned by their real capture timestamp
 * (time-of-day axis), and `twrPct` is the cumulative % change from the window's
 * first point — a simple intraday "today's change" line (intraday cash flows are
 * rare and not modelled here; daily+ ranges handle flows via computeTWRSeries).
 */
export function buildIntradaySeries({
  intraday,
  nowUsd,
  nowTry,
  nowMs,
}: BuildArgs): IntradayHeroResult {
  const raw: Array<{ date: string; dateMs: number; valueUsd: number; valueTry: number }> =
    intraday.map((s) => ({
      date: s.captured_at,
      dateMs: new Date(s.captured_at).getTime(),
      valueUsd: s.total_usd ?? 0,
      valueTry: s.total_try ?? 0,
    }))

  // Append the live "now" anchor; drop the last historical point if it lands on
  // the same instant (avoids a duplicate X position).
  if (raw.length > 0 && raw[raw.length - 1].dateMs === nowMs) {
    raw.pop()
  }
  raw.push({ date: "now", dateMs: nowMs, valueUsd: nowUsd, valueTry: nowTry })

  const startUsd = raw[0]?.valueUsd ?? 0

  const points: IntradayHeroPoint[] = raw.map((p, i) => ({
    date: p.date,
    dateMs: p.dateMs,
    label: i === raw.length - 1 ? "Şimdi" : timeFmt.format(new Date(p.dateMs)),
    valueUsd: p.valueUsd,
    valueTry: p.valueTry,
    twrPct: startUsd > 0 ? (p.valueUsd / startUsd - 1) * 100 : 0,
  }))

  const xTicks = points.map((p) => p.dateMs)

  const endUsd = points[points.length - 1]?.valueUsd ?? 0
  const endTry = points[points.length - 1]?.valueTry ?? 0
  const startTry = points[0]?.valueTry ?? 0
  const deltaUsd = endUsd - startUsd
  const deltaTry = endTry - startTry
  const deltaPct = startUsd > 0 ? (deltaUsd / startUsd) * 100 : 0
  const twrEnd = points[points.length - 1]?.twrPct ?? 0

  return { points, xTicks, twrEnd, deltaUsd, deltaTry, deltaPct }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/dashboard/intraday.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/dashboard/intraday.ts src/lib/dashboard/intraday.test.ts
git commit -m "feat(dashboard): pure buildIntradaySeries for the 1D hero view"
```

---

## Task 9: `useDashboardHero` — `intradaySnapshots` arg + 1D branch

**Files:**
- Modify: `src/hooks/useDashboardHero.ts`

- [ ] **Step 1: Import the builder + extend the args**

Add to the imports at the top:

```ts
import { buildIntradaySeries } from "@/lib/dashboard/intraday"
import { computeCurrentInvestedUsd } from "@/lib/performance"
```

(`computeCurrentInvestedUsd` is already imported at line 6 — only add `buildIntradaySeries`; skip the duplicate import.)

Add to `UseDashboardHeroArgs` (after `snapshots: Snapshot[]`, line 74):

```ts
  intradaySnapshots: IntradaySnapshot[]
```

Add the import for the type (line 12):

```ts
import type { BenchmarkPrice, Snapshot, IntradaySnapshot } from "@/types/database"
```

Destructure it in the function signature (after `snapshots,`, line 148):

```ts
  intradaySnapshots,
```

- [ ] **Step 2: Add the 1D branch at the top of the `useMemo`**

Immediately after the empty-state early-return block (after line 185's closing `}`), and before `const pnlSeries = ...` (line 189), insert:

```ts
    // ── 1D: intraday (hourly) view ───────────────────────────────────
    // Built from the rolling-24h intraday totals (time-of-day axis) plus the
    // live "now" anchor — not the daily snapshots. The index/benchmark overlay
    // is suppressed for 1D (one daily close can't draw an intraday line).
    if (timeRange === "1D") {
      const nowMs = Date.now()
      const investedNow = computeCurrentInvestedUsd(transactions, rates)
      const series = buildIntradaySeries({
        intraday: intradaySnapshots,
        nowUsd: currentValueUsd,
        nowTry: currentValueTry,
        nowMs,
      })
      const chartData: HeroPoint[] = series.points.map((p) => {
        const ratio = p.valueUsd > 0 ? p.valueTry / p.valueUsd : usdTry
        const pnlUsd = p.valueUsd - investedNow
        return {
          date: p.date,
          dateMs: p.dateMs,
          label: p.label,
          // Value mode reads valueUsd/valueTry; P&L mode reads twrPct (intraday
          // % change) and the secondary line stays flat at 0 (overlay hidden).
          valueUsd: viewMode === "pnl" ? pnlUsd : p.valueUsd,
          valueTry: viewMode === "pnl" ? pnlUsd * ratio : p.valueTry,
          compareUsd: viewMode === "pnl" ? p.valueUsd : investedNow,
          compareTry: viewMode === "pnl" ? p.valueTry : investedNow * ratio,
          benchmarkPct: 0,
          twrPct: viewMode === "pnl" ? p.twrPct : 0,
        }
      })
      const startUsd = chartData[0]?.valueUsd ?? 0
      const startTry = chartData[0]?.valueTry ?? 0
      const endUsd = chartData[chartData.length - 1]?.valueUsd ?? 0
      const endTry = chartData[chartData.length - 1]?.valueTry ?? 0
      const pnlDenom =
        viewMode === "pnl" && chartData.length > 0
          ? { usd: chartData[0].compareUsd, try: chartData[0].compareTry }
          : { usd: 0, try: 0 }
      return {
        chartData,
        xTicks: series.xTicks,
        current: { usd: endUsd, try: endTry },
        compareNow:
          viewMode === "pnl"
            ? { usd: 0, try: 0, pct: 0 }
            : {
                usd: chartData[chartData.length - 1]?.compareUsd ?? 0,
                try: chartData[chartData.length - 1]?.compareTry ?? 0,
                pct: 0,
              },
        compareKind: viewMode === "pnl" ? "percent" : "currency",
        rangeStart: { usd: startUsd, try: startTry, date: chartData[0]?.date ?? null },
        delta: {
          usd: series.deltaUsd,
          try: series.deltaTry,
          pct: series.deltaPct,
        },
        pnlDenom,
        twrEnd: viewMode === "pnl" ? series.twrEnd : 0,
        benchmarkEnd: 0,
        gapPts: 0,
        approximate: false,
        loading: pnlLoading,
      }
    }
```

- [ ] **Step 3: Add `intradaySnapshots` + `viewMode` to the `useMemo` dep array**

In the dependency array (lines 475-489), add `intradaySnapshots,` (and confirm `viewMode`, `transactions`, `rates`, `usdTry`, `currentValueUsd`, `currentValueTry`, `timeRange` are already present — they are).

- [ ] **Step 4: Typecheck**

Run: `npm run build`
Expected: PASS. (If it complains `computeCurrentInvestedUsd` is imported twice, remove the duplicate line added in Step 1.)

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useDashboardHero.ts
git commit -m "feat(dashboard): 1D hero view builds from intraday snapshots"
```

---

## Task 10: `DashboardHero` — pass intraday in, suppress index overlay in 1D

**Files:**
- Modify: `src/components/dashboard/DashboardHero.tsx`

- [ ] **Step 1: Read `intradaySnapshots` from the snapshots hook and pass it to the hook**

Find where `snapshots` is obtained (it's a prop or from `useSnapshots()` — check the component header around line 145). If the component receives `snapshots` via `useSnapshots()`, also pull `intradaySnapshots`:

```ts
  const { snapshots, intradaySnapshots } = useSnapshots()
```

If `snapshots` arrives as a prop, instead add a `useSnapshots()` call for the intraday slice near the other hooks (line ~157):

```ts
  const { intradaySnapshots } = useSnapshots()
```

Then add `intradaySnapshots` to the `useDashboardHero({ ... })` argument object (after `snapshots,`, line 192):

```ts
    snapshots,
    intradaySnapshots,
```

- [ ] **Step 2: Suppress the benchmark Area in 1D**

In the P&L-mode chart branch (lines 622-650), wrap the benchmark `<Area dataKey="benchmarkPct">` so it only renders outside 1D. Replace the benchmark `<Area .../>` (lines 636-649) with:

```tsx
                    {timeRange !== "1D" && (
                      <Area
                        yAxisId="compare"
                        type="monotone"
                        dataKey="benchmarkPct"
                        name="compare"
                        stroke="var(--muted-foreground)"
                        fill="transparent"
                        strokeWidth={1}
                        strokeOpacity={0.45}
                        isAnimationActive={false}
                      />
                    )}
```

- [ ] **Step 3: Hide the "vs index" dropdown chip in 1D**

The P&L subtitle's benchmark dropdown (lines 477-504) compares vs the index. In 1D there is no index line, so hide it. Wrap the `<span className="text-muted-foreground">·</span>` + `<DropdownMenu>...</DropdownMenu>` (lines 477-503) in a `{timeRange !== "1D" && ( ... )}` guard:

```tsx
              {timeRange !== "1D" && (
                <>
                  <span className="text-muted-foreground">·</span>
                  <DropdownMenu>
                    <DropdownMenuTrigger className="inline-flex items-center gap-1 rounded-md text-muted-foreground hover:text-foreground">
                      <span>
                        {activeBenchmark.label}{" "}
                        <span className="font-medium text-foreground">
                          {formatSignedPercent(benchmarkEnd, 2)}
                        </span>{" "}
                        <span className={cn("font-medium", gapColor)}>
                          ({formatSignedPercent(gapPts, 1).replace("%", "")} pts)
                        </span>
                      </span>
                      <ChevronDown className="size-3" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      {BENCHMARKS.map((b) => (
                        <DropdownMenuItem key={b.id} onClick={() => setBenchmarkId(b.id)}>
                          {b.fullName}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>
              )}
```

- [ ] **Step 4: Show HH:mm in the tooltip + axis labels for 1D**

The X-axis `tickFormatter` already reads `chartData.find(p => p.dateMs === ms)?.label`, and `buildIntradaySeries` set those labels to `HH:mm` — so axis ticks are correct with no change.

For the P&L tooltip date line, update `renderPnlTooltip` (lines 328-339): when `timeRange === "1D"` and the point isn't "Şimdi", show the point's `label` (HH:mm) instead of the full date. Replace the `else` branch (lines 331-339):

```ts
    } else if (timeRange === "1D") {
      dateLabel = point.label
    } else {
      const d = new Date(point.dateMs)
      dateLabel = d.toLocaleDateString("tr-TR", {
        day: "2-digit",
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      })
    }
```

And the value-mode `<Tooltip labelFormatter>` (lines 599-611): when `timeRange === "1D"`, show the matched point's label. Replace the body (lines 600-610) with:

```ts
                    const ms = Number(label)
                    if (Number.isNaN(ms)) return ""
                    const point = chartData.find((p) => p.dateMs === ms)
                    if (point?.label === "Şimdi") return "Şimdi"
                    if (timeRange === "1D") return point?.label ?? ""
                    const d = new Date(ms)
                    return d.toLocaleDateString("tr-TR", {
                      day: "2-digit",
                      month: "long",
                      year: "numeric",
                      timeZone: "UTC",
                    })
```

- [ ] **Step 5: Typecheck + full test run**

Run: `npm run build && npx vitest run`
Expected: PASS (build clean; all existing tests + the new intraday tests pass).

- [ ] **Step 6: Commit**

```bash
git add src/components/dashboard/DashboardHero.tsx
git commit -m "feat(dashboard): render intraday 1D view, hide index overlay/chip in 1D"
```

---

## Task 11: Documentation

**Files:**
- Modify: `docs/components/10-snapshots-performance.md`
- Modify: `docs/components/technical/10-snapshots-performance.md`
- Modify: `docs/components/07-dashboard.md` + `docs/components/technical/07-dashboard.md`
- Modify: `docs/components/GLOSSARY.md`

- [ ] **Step 1: Behavioral spec — `docs/components/10-snapshots-performance.md`**

Under "When snapshots are written", add a 5th item:

```markdown
5. **Hourly intraday (rolling 24h)** — a scheduled job captures the portfolio's
   **total value** every hour into a separate intraday store, keeping only the
   last ~24 hours; older hourly points are pruned automatically. These points are
   totals-only (no breakdown) and exist solely to render intraday detail in the
   1-day view. The permanent record of each day remains the daily snapshot — the
   intraday store is never an authoritative history.
```

Under "Computed performance values" → after "Portfolio value over time", add:

```markdown
- **Intraday value (1-day view)** — the last ~24 hours of hourly totals plotted on
  a time-of-day axis, with the live current value as the right-edge "now" point.
  In P&L mode the line shows the cumulative % change since the window's first
  point; the market-index comparison is **not** shown for the 1-day view (a single
  daily index close can't draw an intraday line).
```

- [ ] **Step 2: Technical doc — `docs/components/technical/10-snapshots-performance.md`**

In the "Data layer" section, after the `snapshots` table subsection, add:

```markdown
### `intraday_snapshots` table (`supabase/migrations/20260615000000_intraday_snapshots.sql`)

- Columns: `id`, `user_id`, `captured_at timestamptz`, `total_usd numeric`, `total_try numeric`; index `idx_intraday_user_captured(user_id, captured_at)`. RLS: per-user CRUD on `auth.uid()`. **No breakdown, no unique constraint** — append-only, bounded by the hourly prune.
- Written only by `take-intraday-snapshots`; read by the client for the 1D hero view.
```

In the Edge Functions table, add a row:

```markdown
| `supabase/functions/take-intraday-snapshots/index.ts` | Hourly totals-only writer for **all users**. Loads `price_cache` + latest `exchange_rates` + non-zero `holdings`, values each user via the shared `valueHoldings()`, inserts one `{ user_id, captured_at, total_usd, total_try }` row, then prunes `captured_at < now()-24h`. Unpriced guard skips just that user's **hour** (not a date). Auth: `X-Cron-Token`. |
```

Add a note about the shared extraction and the new cron:

```markdown
- **Shared valuation core (`_shared/valuation.ts`).** `valueHoldings()` is the single per-user `holdings × prices → totals + breakdown + unpriced` aggregation, used by **both** `take-snapshots` (full breakdown) and `take-intraday-snapshots` (totals only). `STALE_PRICE_MS` lives in `_shared/constants.ts`. The browser's `buildSnapshotInsert` is a separate BigNumber copy (different runtime) — intentionally not unified.
- **The hourly cron (`supabase/migrations/20260615000100_schedule_intraday_snapshot_cron.sql`).** pg_cron job `hourly-intraday-snapshot`, `0 * * * *`. POSTs `fetch-prices` with `{"force": true, "intraday": true}` — force-refreshes prices, and `intraday=true` chains `take-intraday-snapshots`. Same Vault secrets as the daily job. `fetch-prices`' `triggerSnapshot` was generalized to `triggerChainedFunction(fnName, cronToken)`.
```

In the hooks/context section, note the `SnapshotsContext` now also exposes `intradaySnapshots` (last 24h) and `useDashboardHero` builds the 1D view from it via `src/lib/dashboard/intraday.ts` (`buildIntradaySeries`).

- [ ] **Step 3: Dashboard docs — `07-dashboard.md` (+ technical)**

In the behavioral spec, in the hero/time-range description, note: "The 1-day range shows intraday (hourly) detail on a time-of-day axis; longer ranges use daily snapshots. The index comparison is hidden in the 1-day range."

In the technical doc, note `DashboardHero` passes `intradaySnapshots` into `useDashboardHero`, and the benchmark `Area` + the "vs index" chip are gated behind `timeRange !== "1D"`.

- [ ] **Step 4: GLOSSARY — `docs/components/GLOSSARY.md`**

In the `#snapshot` entry, append a paragraph:

```markdown
There are two snapshot stores. The **daily snapshot** (one per calendar day,
full breakdown) is the authoritative record of a day's value. **Intraday
snapshots** are a transient, totals-only rolling 24-hour window (one per hour,
pruned after a day) used only to draw the 1-day intraday view; they never serve
as authoritative history.
```

- [ ] **Step 5: Commit**

```bash
git add docs/components/10-snapshots-performance.md docs/components/technical/10-snapshots-performance.md docs/components/07-dashboard.md docs/components/technical/07-dashboard.md docs/components/GLOSSARY.md
git commit -m "docs: intraday hourly snapshots + 1D view"
```

---

## Task 12: Final build gate + deploy handoff

**Files:** none (verification + handoff)

- [ ] **Step 1: Full local verification**

Run: `npm run build && npx vitest run`
Expected: build clean (tsc -b passes — catches `noUnusedLocals` etc.); all tests pass.

- [ ] **Step 2: Hand the user the deploy commands**

Do **not** run these — present them to the user (per deploy-handoff convention). The user runs, one step at a time:

```bash
# 1. Apply the two new migrations (table + cron) to prod:
supabase db push

# 2. Deploy the new + changed edge functions:
supabase functions deploy take-intraday-snapshots
supabase functions deploy take-snapshots
supabase functions deploy fetch-prices

# 3. Deploy the client (the user's normal Vercel command):
vercel --prod
```

- [ ] **Step 3: Post-deploy smoke checks (with the user)**

1. Manually invoke the chain once instead of waiting for the top of the hour:
   ```bash
   curl -X POST "$FUNCTIONS_URL/fetch-prices" \
     -H "Content-Type: application/json" \
     -H "X-Cron-Token: $CRON_TOKEN" \
     -d '{"force": true, "intraday": true}'
   ```
2. Confirm a row landed: `select count(*), max(captured_at) from intraday_snapshots;` (Supabase SQL editor).
3. Confirm the daily snapshot is unchanged: trigger `{"force": true, "snapshot": true}` and verify today's `snapshots` row total matches the pre-refactor value (the Task 2 behavior-preserving guarantee).
4. In the app, open the dashboard hero, click **1D** — confirm the intraday line renders on a time-of-day axis and the index overlay/chip is gone; switch to **1M** and confirm the index overlay returns.
5. Confirm `select * from cron.job where jobname = 'hourly-intraday-snapshot';` shows the schedule.

- [ ] **Step 4: Final commit (if any doc tweaks came out of smoke testing)**

```bash
git add -A && git commit -m "chore: intraday snapshots post-deploy tweaks"
```

---

## Self-Review

**Spec coverage:**
- Capture (hourly cron, forced refresh, chain) → Tasks 3, 4, 5. ✓
- Totals-only `intraday_snapshots` table → Task 1. ✓
- 24h rolling retention / prune → Task 3 (prune step). ✓
- Daily snapshot stays the permanent record → unchanged; verified Task 12 smoke. ✓
- No-duplication (shared `valueHoldings`) → Task 2. ✓
- Read path via context (no per-call-site fetch) → Tasks 6, 7. ✓
- 1D view at intraday resolution, time-of-day axis → Tasks 8, 9, 10. ✓
- Index/TWR overlay suppressed in 1D; portfolio line still moves (intraday %) → Tasks 9 (twrPct), 10 (hide Area/chip). ✓
- Unpriced hour skipped (not the date); empty portfolio → now-anchor covers it → Task 3. ✓
- Docs (10, 07, GLOSSARY) → Task 11. ✓

**Type consistency:** `valueHoldings()` / `ValuationResult` (Task 2) consumed identically in Tasks 2 & 3. `IntradaySnapshot` (Task 6) used in Tasks 7, 8, 9. `buildIntradaySeries` signature (Task 8) matches its call site (Task 9). `triggerChainedFunction(fnName, cronToken)` (Task 4) called with both function names. `intradaySnapshots` threads prop → context (7) → hook arg (9) → component (10).

**Placeholder scan:** none — every code step contains the full content.
