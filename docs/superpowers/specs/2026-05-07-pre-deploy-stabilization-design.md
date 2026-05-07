# Pre-deploy Stabilization — Design

**Date:** 2026-05-07
**Status:** Approved (pending implementation plan)
**Scope:** Security hardening (Audit A) + Code cleanup (Project review B). Deploy (C) is a separate spec.

---

## 1. Overview

### Problem

The codebase has accumulated two parking-lot documents:
- `docs/security-audit-2026-05-04.md` — 2 HIGH, 4 MEDIUM, 4 LOW findings, all still open as of 2026-05-07.
- `docs/project-review-2026-05-04.md` — 7 actionable code-quality items.

We want to deploy the app for free (Supabase Cloud + a static frontend host) for use by exactly two users (the developer and his spouse). Before deploying, we need to:
1. Close the security findings that matter at this exposure level.
2. Clean the code so deploy isn't shipping known regressions.

### Goal

Single bundled branch `chore/pre-deploy-stabilization` containing 11 fixes, mantıksal commits, manual smoke-tested, merged to `main` as one PR. After this lands, the project is in a state where deploy can begin.

### In scope (11 items)

**Security (Audit):**
- **H1** — `seed_user_data` RLS bypass guard
- **H2** — `backfill-snapshots` requires JWT
- **M1** — `take-snapshots` shared-secret header (cron stays public-able)
- **M2** — CORS allowlist on all 7 Edge Functions
- **M3** — Auth defaults: password length 10+, signup remains open until two accounts exist

**Cleanup (Project review):**
- **B1** — `BigNumber.toNumber()` → `.toFixed()` strings for Postgres `numeric` writes
- **B2** — Bundle size: route-level `React.lazy()` + lazy recharts
- **B4** — `TransactionDataContext` SoT, eliminate 3-4× duplicate fetches
- **B5** — `useDashboard` single-pass accumulator
- **B6** — Settings page Turkish (consistency); delete `ManualPriceEntry`
- **B7** — FIFO fee handling docstring

### Explicitly out of scope

- **M4** (input validation), **L1-L4** (audit low/info) — kept open in audit doc, deferred.
- **B3** (public Edge Functions) — covered by H2/M1 in this spec.
- **Deploy** (C) — separate brainstorm, separate spec.
- **PRD updates** (monthly→daily snapshots etc.) — small docs commit after deploy.
- **Budget feature** — separate spec already exists.

### Exposure model assumption

The deployed app is for two users (dev + spouse). After both accounts are created, signup will be disabled. Email confirmation stays off (avoid forcing spouse into a managed mailbox). This determines which audit items need real fixes vs. can stay deferred.

---

## 2. Architecture

### Affected surfaces

| Layer | Change | New file? |
|---|---|---|
| `supabase/migrations/` | New: `seed_user_data` guard (H1) | +1 |
| `supabase/migrations/` | New: cron schedule with `X-Cron-Token` header (M1) | +1 |
| `supabase/config.toml` | `verify_jwt`, password length (H2, M3) | edit |
| `supabase/functions/take-snapshots/index.ts` | Token check (M1) | edit |
| `supabase/functions/_shared/cors.ts` | New shared CORS util (M2) | +1 |
| `supabase/functions/*/index.ts` (7 functions) | Use shared CORS util (M2) | edit |
| `src/lib/balance.ts`, `src/lib/queries/snapshots.ts` | `.toFixed(decimals)` strings (B1) | edit |
| `src/App.tsx` | Route-level `React.lazy()` (B2) | edit |
| `src/components/layout/RouteSkeleton.tsx` | New Suspense fallback (B2) | +1 |
| `src/components/charts/LazyChart.tsx` | New lazy chart wrappers (B2) | +1 |
| `src/contexts/TransactionDataContext.tsx` | New: tx + rates SoT (B4) | +1 |
| `src/hooks/useDashboardHero.ts`, `usePnL.ts`, `useCostBasis.ts`, `useTransactionLog.ts` | Read from context (B4) | edit |
| `src/hooks/useDashboard.ts` | Single-pass accumulator (B5) | edit |
| `src/pages/SettingsPage.tsx` and subcomponents | TR strings (B6) | edit |
| `src/components/prices/ManualPriceEntry.tsx` | Delete (B6) | delete |
| `src/lib/fifo.ts` | Single comment (B7) | edit |

### Surfaces left intentionally untouched

- `src/lib/queries/pnl.ts` — function signatures stay; only callers move.
- Existing `src/contexts/TransactionContext.tsx` (modal state) — unchanged; new `TransactionDataContext` is a separate provider.
- Database schema (tables, RLS policies) — only `seed_user_data` function body changes.
- `useAuth`, `usePrices`, `usePlatforms`, `useAssets` — unaffected.

### Branch & commit strategy

- Single branch: `chore/pre-deploy-stabilization`.
- Commits grouped logically per fix (`security/H1`, `security/H2`, `cleanup/B1`, …) so review can proceed commit-by-commit.
- Merge with a merge commit (not squash) — preserves logical separation in history.

### Migration ordering

1. `seed_user_data` guard migration first — backwards compatible (calling with own UUID still works).
2. Cron schedule migration second — drops old schedule, recreates with `X-Cron-Token`.
3. `config.toml` changes ship together with `supabase functions deploy` (deploy phase).

---

## 3. Security fixes

### H1. `seed_user_data` guard

**File:** `supabase/migrations/20260507100000_seed_function_guard.sql`

```sql
CREATE OR REPLACE FUNCTION public.seed_user_data(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'cannot seed for another user';
  END IF;
  -- Existing body copied verbatim from 20260402100010_seed_function.sql
END;
$$;

REVOKE EXECUTE ON FUNCTION public.seed_user_data(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.seed_user_data(uuid) TO authenticated;
```

**Decisions:**
- Keep the `p_user_id` parameter (backwards compat with existing client call) but lock it via guard.
- Add `SET search_path = public` (defense against search-path injection — small but free).

**Down migration** (`20260507100000_seed_function_guard.down.sql`): restore body without guard. Held in repo, never run on remote unless rolling back.

### H2. `backfill-snapshots` requires JWT

**File:** `supabase/config.toml:381`

```diff
 [functions.backfill-snapshots]
-verify_jwt = false
+verify_jwt = true
```

**Client side:** `supabase.functions.invoke("backfill-snapshots", ...)` already attaches the session JWT — no code change. Verify with `grep -rn 'backfill-snapshots' src/` that all call sites use `invoke` (not raw `fetch`).

### M1. `take-snapshots` shared-secret

**File:** `supabase/functions/take-snapshots/index.ts` — top of handler:

```ts
const expectedToken = Deno.env.get("CRON_TOKEN")
const providedToken = req.headers.get("X-Cron-Token")

if (!expectedToken || providedToken !== expectedToken) {
  return new Response(JSON.stringify({ error: "unauthorized" }), {
    status: 401,
    headers: corsHeaders(req.headers.get("origin")),
  })
}
```

**Cron migration:** `supabase/migrations/20260507100100_cron_take_snapshots_token.sql`
- `SELECT cron.unschedule('<old-job-name>');`
- Reschedule via `pg_net.http_post` with `Authorization: Bearer <anon>` and `X-Cron-Token: <secret>` headers.
- Token source: `vault.secrets` (preferred — managed secret) or `private.cron_token` table fallback if vault not enabled.

**Env vars:**
- Local: `supabase/.env.local` → `CRON_TOKEN=<32-char random>`
- Prod: `supabase secrets set CRON_TOKEN=<random>` — done in deploy phase (C).

**`config.toml:375` (`take-snapshots` `verify_jwt = false`) stays.** Auth is via shared secret, not JWT — so JWT verification stays off.

### M2. CORS allowlist

**File:** `supabase/functions/_shared/cors.ts`

```ts
const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean)

export function corsHeaders(origin: string | null): HeadersInit {
  const allowed =
    origin && (ALLOWED_ORIGINS.includes(origin) || ALLOWED_ORIGINS.includes("*"))
      ? origin
      : ALLOWED_ORIGINS[0] ?? "null"
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-cron-token",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  }
}
```

**All 7 Edge Functions** (`backfill-snapshots`, `fetch-coingecko`, `fetch-historical-rate`, `fetch-prices`, `fetch-tcmb`, `fetch-yahoo`, `take-snapshots`) replace inline `corsHeaders` const with this util.

**Local env:** `ALLOWED_ORIGINS=http://localhost:5173`
**Pre-deploy temporary:** `ALLOWED_ORIGINS=*` until deploy phase, then narrow to real domain.

### M3. Auth defaults

**File:** `supabase/config.toml`

```diff
-minimum_password_length = 6
+minimum_password_length = 10
```

`enable_signup = true` **stays** in this spec — needed for the dev to create both accounts locally and on prod after deploy.

`enable_confirmations = false` **stays** — explicit decision to avoid forcing the spouse into a managed mailbox.

**Deferred to deploy phase (C):** flipping `enable_signup = false` after both accounts exist on prod.

### Items deferred (audit reference preserved)

- **M4** input validation — `docs/security-audit-2026-05-04.md` keeps the entry open.
- **L1-L4** — same.

---

## 4. Cleanup

### B1. BigNumber → Postgres `numeric` strings

**Files:**
- `src/lib/balance.ts:37`
- `src/lib/queries/snapshots.ts:86, 87, 111, 112, 121, 122, 132, 133, 141, 142, 143`

**Pattern:**
```ts
// Quantity (asset-aware decimals):
balance: bn(...).toFixed(asset.decimals ?? 8)

// USD/TRY (fiat-style):
usd: vals.usd.toFixed(8)
try: vals.try_val.toFixed(8)

// Percentages (display only, lower precision OK):
pct: ratio.toFixed(4)
```

Postgres `numeric` columns accept strings; BigNumber's `.toFixed()` returns a non-exponential string. Precision preserved end-to-end.

**Optional helper:** `src/lib/bn.ts::toDbString(bn, decimals)` — added if `bn.ts` exists and is small. Otherwise inline.

### B2. Bundle size — lazy routes + lazy recharts

**Routes (`src/App.tsx`):**

```ts
import { lazy, Suspense } from "react"
const PortfolioPage = lazy(() => import("@/pages/PortfolioPage"))
const TransactionsPage = lazy(() => import("@/pages/TransactionsPage"))
const PerformancePage = lazy(() => import("@/pages/PerformancePage"))
const SettingsPage = lazy(() => import("@/pages/SettingsPage"))
// DashboardPage stays eager (it's the index route).
```

`<Suspense fallback={<RouteSkeleton />}>` wraps the route outlet inside `AppLayout`. `RouteSkeleton` is a minimal shimmer (`src/components/layout/RouteSkeleton.tsx`).

**Charts (`src/components/charts/LazyChart.tsx`):**

```ts
import { lazy } from "react"
export const PerformanceChart = lazy(() => import("./PerformanceChart"))
export const HeroSparkline = lazy(() => import("./HeroSparkline"))
```

Pages import `PerformanceChart` from `LazyChart` and wrap in `<Suspense fallback={<ChartSkeleton />}>`. Recharts ends up in chart-page chunks, not the main bundle.

**Target:** Initial JS gzip `<200kB` (currently ~400kB). Recharts chunk should appear in network tab only when navigating to a chart page.

### B4. TransactionDataContext

**File:** `src/contexts/TransactionDataContext.tsx`

```ts
interface TransactionDataValue {
  transactions: Transaction[]
  rates: ExchangeRate[]
  loading: boolean
  refresh: () => Promise<void>
}
```

- Mounted in `main.tsx` outside the existing `TransactionProvider` (modal).
- On mount: `Promise.all([fetchTransactionsForAllAssets(user.id), fetchAllExchangeRates()])` once.
- `useTransactions().addTransaction / editTransaction / removeTransaction` call `refresh()` after mutation success.

**Migrated consumers:**

| Hook | Before | After |
|---|---|---|
| `useDashboardHero` | own fetch | `useTransactionData()` |
| `usePnL` | own fetch | `useTransactionData()` |
| `useTransactionLog` | own `fetchAllExchangeRates` | `useTransactionData().rates` |
| `useCostBasis` | per-pair `fetchTransactionsForPnL(assetId, platformId)` | client-side filter on `transactions` |

**`useCostBasis` filter contract:**

```ts
const txForPair = useMemo(
  () =>
    transactions
      .filter((t) => t.asset_id === assetId && t.platform_id === platformId)
      .sort((a, b) => a.date.localeCompare(b.date) || a.created_at.localeCompare(b.created_at)),
  [transactions, assetId, platformId]
)
```

The original `fetchTransactionsForPnL` orders by `(date, created_at)`. After filtering the master array (ordered by `asset_id, platform_id, date, created_at`), an explicit re-sort guarantees FIFO inputs are stable. Both queries share `select("*")` so columns are identical — no shape divergence risk.

**`fetchTransactionsForPnL` is not deleted yet** — leave for now; remove in a follow-up cleanup if no consumers remain.

### B5. `useDashboard` single-pass

**File:** `src/hooks/useDashboard.ts`

Replace 4 separate loops with a single `for` loop computing `value = computeHoldingValue(h, prices)` once and updating four accumulators (totalUsd, byCategory Map, byPlatform Map, byTag Map). Pure mechanical refactor — outputs identical.

### B6. Turkish standardization + delete `ManualPriceEntry`

**Files:**
- `src/pages/SettingsPage.tsx` and direct subcomponents: replace English strings with Turkish.
- Toast messages, empty states, button labels checked.
- **Delete** `src/components/prices/ManualPriceEntry.tsx` (not mounted anywhere — confirmed by project review).

No centralized i18n — strings inline.

### B7. FIFO fee handling comment

**File:** `src/lib/fifo.ts`, above the fee-handling block (around line 104):

```ts
// Fees consume cost-basis lots and are also recorded as -feeCostUsd in
// realized P&L. When cost basis ≠ market value at fee time, this creates
// a small intentional double-count (conservative side).
```

---

## 5. Verification

### Automated (every commit)

```bash
npm run build       # tsc -b + vite build, zero errors
npm run lint        # eslint, zero warnings
```

Baseline — no commit lands if these fail.

### Bundle-size verify (B2)

```bash
npm run build
ls -lh dist/assets/*.js
gzip -c dist/assets/index-*.js | wc -c   # initial bundle gzipped
```

**Before snapshot** (capture before any B2 commit lands; record in PR description):
- Initial bundle (gzip): _to be filled_
- Recharts location: in main bundle vs separate chunk: _to be filled_

**Target after:** `<200kB` initial gzip; recharts in a separate chunk loaded only on `/performance` (and dashboard hero).

### Security verify (manual)

| ID | Test | Expected |
|---|---|---|
| H1 | Browser console: `await supabase.rpc("seed_user_data", { p_user_id: crypto.randomUUID() })` | Throws `cannot seed for another user` |
| H1 | Same with `(await supabase.auth.getUser()).data.user.id` | Resolves OK (idempotent) |
| H2 | `curl -X POST <project>/functions/v1/backfill-snapshots` | 401 |
| H2 | UI Backfill button | Works (session JWT attached) |
| M1 | `curl -X POST <project>/functions/v1/take-snapshots -d '{}'` | 401 |
| M1 | Supabase logs after next cron tick | 200 |
| M2 | `fetch("<func-url>", ...)` from a non-allowlisted origin | CORS error |
| M3 | Signup with 6-char password | Rejected |

### Cleanup verify

| ID | Test | Expected |
|---|---|---|
| B1 | `select balance::text from holdings limit 5` | All decimals preserved (e.g. `1.00000001`) |
| B1 | `select usd::text from snapshots order by date desc limit 1` | 8 decimal places visible |
| B4 | Dashboard mount, network tab `transactions` queries | 1× (was 3-4×) |
| B4 | Add new transaction | Dashboard refreshes |
| B5 | Dashboard numbers (visual) | Identical pre/post refactor |
| B6 | Settings page | Fully Turkish |
| B6 | `grep -rn "Settings\|Manage your" src/pages/SettingsPage.tsx` | Zero matches |
| B7 | `src/lib/fifo.ts` | Comment present |

### Smoke flow (~10 min, before merge)

1. Login → Dashboard loads.
2. Add a buy transaction → Portfolio + Dashboard update.
3. Edit it → Numbers update.
4. Delete it → Portfolio updates.
5. Navigate to Performance → Chart loads (recharts chunk arrives in network tab now).
6. Settings → all tabs Turkish, working.
7. Logout → Login → state clean.

---

## 6. Risks & rollback

### Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| B4 context refactor introduces wrong filter → missing tx | Medium | High | Compare Dashboard numbers to pre-refactor screenshot; uçtan uca smoke. |
| B1 `toFixed(asset.decimals)` when `decimals` undefined → RangeError | Low | Medium | Fallback `?? 8`; raw SQL verify after first holdings write. |
| B2 Suspense fallback flashes on slow network | Low | Low | Minimal skeleton + 100ms fade; visual smoke. |
| M1 cron token misconfigured → snapshots silently fail | Medium | Medium | Weekly check of Edge Function logs (operational note). |
| H2 `verify_jwt = true` accidentally applied to `take-snapshots` → cron breaks | Low | High | Only the `backfill-snapshots` block edited; diff-review catches. |
| TR translation typos | Low | Low | Visual smoke. |
| Large PR review fatigue | High | Low | Logical commits per fix; review commit-by-commit. |

### Rollback playbook

**Migration breakage (H1, M1):**
- Down migration files included in repo.
- Local: `supabase db reset`.
- Prod: write a new forward migration (Supabase doesn't auto-run downs).

**Production regression after deploy:**
- Each fix is its own commit. `git revert <hash>` → push as new PR.

**B2 bundle issues:**
- Replace `lazy()` with eager `import` per page; mechanical revert.

### Operational notes (post-merge)

- Weekly: glance at Supabase Edge Function logs to confirm cron is hitting `take-snapshots` with status 200 (catches M1 token drift).
- After deploy phase (C): update `ALLOWED_ORIGINS` to real domain; flip `enable_signup = false` once both accounts exist; mark audit items as fixed-in-`<commit>`.

---

## 7. Done definition

This spec is "done" when:

- [ ] 11 fixes implemented with logical commits on `chore/pre-deploy-stabilization`
- [ ] `npm run build` and `npm run lint` exit zero
- [ ] All verify checks above pass
- [ ] Smoke flow successful
- [ ] PR opened, self-reviewed, merged
- [ ] `docs/security-audit-2026-05-04.md` updated: H1/H2/M1/M2/M3 marked `Fixed in <commit>`
- [ ] `docs/project-review-2026-05-04.md` updated: items 1, 2, 4, 5, 6, 7 marked `Fixed`

After merge, the project is ready for the deploy (C) brainstorm.

---

## 8. Open follow-ups (not in this spec)

- **C — Free deploy:** host selection (Vercel / Netlify / CF Pages), custom domain, Supabase Cloud project provisioning, env var management, prod migration push, `enable_signup = false` flip after both accounts created, `ALLOWED_ORIGINS` real-domain narrowing, `CRON_TOKEN` rotation policy.
- **M4** input validation, **L1-L4** — remain open in audit doc.
- **PRD updates** — §8.1, §16, §9.5 small edits to reflect daily snapshots and current Settings state. Post-deploy.
- **Budget feature** — separate spec already exists (`docs/budget-feature-plan.md`).
