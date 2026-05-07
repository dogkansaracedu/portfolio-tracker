# Pre-deploy Stabilization — Design

**Date:** 2026-05-07
**Status:** Approved (pending implementation plan)
**Scope:** Security hardening (Audit A) + remaining code cleanup (Project review B). Deploy (C) is a separate spec.

> **Update note (2026-05-07):** Initial spec planned 11 items. Verification during the writing-plans phase showed that commit `62b8c98 chore: apply 2026-05-04 project review` (3 days before this spec was written) already closed B1, B5, B6 (delete + language sweep — direction was English, not Turkish), and B7. Final spec covers **7 items**: 5 security + 2 cleanup.

---

## 1. Overview

### Problem

`docs/security-audit-2026-05-04.md` lists 2 HIGH and 4 MEDIUM findings, all still open as of 2026-05-07. We want to deploy the app for free (Supabase Cloud + a static frontend host) for use by exactly two users (the developer and his spouse). Before deploying, we close the security findings that matter at this exposure level and the remaining code-quality items that affect deploy.

### Goal

Single bundled branch `chore/pre-deploy-stabilization` containing 7 fixes, logical commits, manual smoke-tested, merged to `main` as one PR. After this lands, the project is in a state where deploy can begin.

### In scope (7 items)

**Security (Audit):**
- **H1** — `seed_user_data` RLS bypass guard
- **H2** — `backfill-snapshots` requires JWT
- **M1** — `take-snapshots` shared-secret header (cron stays public-able)
- **M2** — CORS allowlist on all 7 Edge Functions
- **M3** — Auth defaults: password length 10+; signup will be flipped off in deploy phase (C)

**Cleanup (remaining):**
- **B2** — Bundle size: route-level `React.lazy()` + lazy recharts
- **B4** — `TransactionDataContext` SoT, eliminate 3-4× duplicate fetches in dashboard hooks

### Already closed (verified, not in scope)

- **B1** `BigNumber.toFixed` strings — closed in `62b8c98` (`balance.ts:40-47` writes string; `snapshots.ts` top-level numeric columns write strings; jsonb breakdown values intentionally stay as `number` per inline comment).
- **B5** `useDashboard` single-pass — closed in `62b8c98`.
- **B6** Language sweep — closed in `62b8c98` with **English as default** (opposite direction from earlier discussion; no further translation work).
- **B6** `ManualPriceEntry` deletion — closed in `62b8c98`.
- **B7** FIFO fee comment — closed in `62b8c98`.

### Explicitly out of scope

- **M4** (input validation), **L1-L4** (audit low/info) — kept open in audit doc, deferred.
- **B3** (public Edge Functions) — covered by H2/M1 in this spec.
- **Deploy** (C) — separate brainstorm, separate spec.
- **Budget feature** — separate spec already exists.

### Exposure model assumption

The deployed app is for two users. After both accounts are created (during deploy phase), signup is disabled. Email confirmation stays off (avoid forcing the spouse into a managed mailbox). This determines which audit items need real fixes vs. can stay deferred.

---

## 2. Architecture

### Affected surfaces

| Layer | Change | New file? |
|---|---|---|
| `supabase/migrations/` | New: `seed_user_data` guard (H1) | +1 |
| `supabase/migrations/` | New: cron schedule with `X-Cron-Token` header (M1) | +1 |
| `supabase/config.toml` | `verify_jwt` (H2), password length (M3) | edit |
| `supabase/functions/take-snapshots/index.ts` | Token check (M1) | edit |
| `supabase/functions/_shared/cors.ts` | New shared CORS util (M2) | +1 |
| `supabase/functions/*/index.ts` (7 functions) | Use shared CORS util (M2) | edit |
| `src/App.tsx` | Route-level `React.lazy()` (B2) | edit |
| `src/components/layout/RouteSkeleton.tsx` | New Suspense fallback (B2) | +1 |
| `src/components/charts/LazyChart.tsx` | New lazy chart wrappers (B2) | +1 |
| `src/contexts/TransactionDataContext.tsx` | New: tx + rates SoT (B4) | +1 |
| `src/main.tsx` | Wrap with `TransactionDataProvider` (B4) | edit |
| `src/hooks/useDashboardHero.ts`, `usePnL.ts`, `useCostBasis.ts`, `useTransactionLog.ts` | Read from context (B4) | edit |
| `src/hooks/useTransactions.ts` | Mutations call `refresh()` (B4) | edit |

### Surfaces left intentionally untouched

- `src/lib/queries/pnl.ts` — function signatures stay; only callers move.
- Existing `src/contexts/TransactionContext.tsx` (modal state) — unchanged; new `TransactionDataContext` is a separate provider.
- Database schema (tables, RLS policies) — only `seed_user_data` function body changes.
- `useAuth`, `usePrices`, `usePlatforms`, `useAssets` — unaffected.
- Strings / language — left as-is (English default per `62b8c98`).

### Branch & commit strategy

- Single branch: `chore/pre-deploy-stabilization`.
- Commits grouped logically per fix (`security/H1`, `security/H2`, `cleanup/B2`, …) so review can proceed commit-by-commit.
- Merge with a merge commit (not squash) — preserves logical separation in history.

### Migration ordering

1. `seed_user_data` guard migration first — backwards compatible (calling with own UUID still works).
2. Cron schedule migration second — drops old `daily-portfolio-snapshot` schedule, recreates with `X-Cron-Token`.
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
- Add `SET search_path = public` (defense against search-path injection).

### H2. `backfill-snapshots` requires JWT

**File:** `supabase/config.toml:381`

```diff
 [functions.backfill-snapshots]
-verify_jwt = false
+verify_jwt = true
```

**Client side:** `supabase.functions.invoke("backfill-snapshots", ...)` already attaches the session JWT — no code change. Verify with `grep -rn 'backfill-snapshots' src/` that all call sites use `invoke` (not raw `fetch`).

### M1. `take-snapshots` shared-secret

**File:** `supabase/functions/take-snapshots/index.ts` — top of handler (after OPTIONS preflight, before any DB or external call):

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

The existing job is `daily-portfolio-snapshot` (`20260502120100_daily_snapshot_cron.sql:14`). The new migration:
1. Drops the old schedule (`cron.unschedule('daily-portfolio-snapshot')`).
2. Recreates it with the `X-Cron-Token` header pulled from a Postgres GUC `app.cron_token`.
3. Token GUC is set per environment via `ALTER DATABASE postgres SET app.cron_token = '<token>'` (documented in migration comment).

```sql
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'daily-portfolio-snapshot') THEN
    PERFORM cron.unschedule('daily-portfolio-snapshot');
  END IF;
END $$;

SELECT cron.schedule(
  'daily-portfolio-snapshot',
  '55 23 * * *',
  $cron$
  SELECT net.http_post(
    url := 'http://kong:8000/functions/v1/take-snapshots',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Cron-Token', current_setting('app.cron_token', true)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $cron$
);

-- Required GUC (set per environment, not in migration):
-- ALTER DATABASE postgres SET app.cron_token = '<32-hex>';
```

**Env vars:**
- Local: `supabase/.env.local` → `CRON_TOKEN=<32-char random>` (Edge Function side).
- Local Postgres GUC: `ALTER DATABASE postgres SET app.cron_token = '<same-token>';` (cron side).
- Prod: `supabase secrets set CRON_TOKEN=<random>` for the function; same `ALTER DATABASE` SQL run via dashboard.

**`config.toml:375` (`take-snapshots` `verify_jwt = false`) stays.** Auth is via shared secret, not JWT.

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

**All 7 Edge Functions** (`backfill-snapshots`, `fetch-coingecko`, `fetch-historical-rate`, `fetch-prices`, `fetch-tcmb`, `fetch-yahoo`, `take-snapshots`) replace inline `corsHeaders` const with this util. Calls switch from `corsHeaders` (constant) to `corsHeaders(req.headers.get("origin"))` (function call).

**Local env (`supabase/.env.local`):** `ALLOWED_ORIGINS=http://localhost:5173`
**Pre-deploy temporary:** keep `ALLOWED_ORIGINS=*` in spec; narrow to real domain in deploy phase.

### M3. Auth defaults

**File:** `supabase/config.toml:175`

```diff
-minimum_password_length = 6
+minimum_password_length = 10
```

`enable_signup = true` **stays** in this spec — needed for the dev to create both accounts on prod after deploy.
`enable_confirmations = false` **stays** — explicit decision.

**Deferred to deploy phase (C):** flipping `enable_signup = false` after both accounts exist.

### Items deferred (audit reference preserved)

- **M4** input validation — `docs/security-audit-2026-05-04.md` keeps the entry open.
- **L1-L4** — same.

---

## 4. Cleanup

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

`<Suspense fallback={<RouteSkeleton />}>` wraps each lazy route element. `RouteSkeleton` is a minimal shimmer (`src/components/layout/RouteSkeleton.tsx`).

**Charts (`src/components/charts/LazyChart.tsx`):**

```ts
import { lazy } from "react"
export const PerformanceChart = lazy(() => import("./PerformanceChart"))
// add additional chart components here as discovered during implementation
```

Pages import chart components from `LazyChart.tsx` and wrap usage in `<Suspense fallback={<ChartSkeleton />}>`. Recharts ends up in chart-page chunks, not the main bundle.

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
- Mutation handlers in `useTransactions` (add/edit/remove) call `refresh()` after success.

**Migrated consumers:**

| Hook | Before | After |
|---|---|---|
| `useDashboardHero` (line 87-109) | own `Promise.all` fetch | `useTransactionData()` |
| `usePnL` (line 53-69) | own `Promise.all` fetch | `useTransactionData()` |
| `useTransactionLog` | own `fetchAllExchangeRates` | `useTransactionData().rates` |
| `useCostBasis` | per-pair `fetchTransactionsForPnL(assetId, platformId)` | client-side filter on `transactions` |

**`useCostBasis` filter contract:**

```ts
const txForPair = useMemo(
  () =>
    transactions
      .filter((t) => t.asset_id === assetId && t.platform_id === platformId)
      .sort(
        (a, b) =>
          a.date.localeCompare(b.date) || a.created_at.localeCompare(b.created_at)
      ),
  [transactions, assetId, platformId]
)
```

The original `fetchTransactionsForPnL` orders by `(date, created_at)`. After filtering the master array (ordered by `asset_id, platform_id, date, created_at`), an explicit re-sort guarantees FIFO inputs are stable. Both queries share `select("*")` so columns are identical — no shape divergence risk.

**`fetchTransactionsForPnL` is not deleted yet** — leave for now; remove in a follow-up cleanup if no consumers remain.

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

**Target after:** `<200kB` initial gzip; recharts in a separate chunk loaded only on `/performance` (and dashboard hero if applicable).

### Security verify (manual)

| ID | Test | Expected |
|---|---|---|
| H1 | Browser console: `await supabase.rpc("seed_user_data", { p_user_id: crypto.randomUUID() })` | Throws `cannot seed for another user` |
| H1 | Same with `(await supabase.auth.getUser()).data.user.id` | Resolves OK (idempotent) |
| H2 | `curl -X POST <project>/functions/v1/backfill-snapshots` (no auth) | 401 |
| H2 | UI Backfill button (logged in) | Works (session JWT attached) |
| M1 | `curl -X POST <project>/functions/v1/take-snapshots -d '{}'` (no token) | 401 |
| M1 | Same with `-H "X-Cron-Token: $CRON_TOKEN"` | 200 |
| M1 | Wait for next cron tick or trigger via `cron.schedule_run` | Edge Function logs show 200 |
| M2 | OPTIONS preflight from non-allowlisted origin | Allow-Origin doesn't reflect that origin |
| M2 | OPTIONS preflight from `http://localhost:5173` | `Access-Control-Allow-Origin: http://localhost:5173` |
| M3 | Signup with 6-char password | Rejected |

### Cleanup verify

| ID | Test | Expected |
|---|---|---|
| B2 | `gzip -c dist/assets/index-*.js \| wc -c` | < 200000 (was ~400000) |
| B2 | DevTools Network on Dashboard | recharts chunk not loaded |
| B2 | Navigate to Performance | recharts chunk arrives |
| B4 | Dashboard mount, network tab `transactions` queries | 1× (was 3-4×) |
| B4 | Dashboard numbers (visual) | Identical pre/post refactor |
| B4 | Add new transaction | Dashboard refreshes without reload |

### Smoke flow (~10 min, before merge)

1. Login → Dashboard loads.
2. Add a buy transaction → Portfolio + Dashboard update.
3. Edit it → Numbers update.
4. Delete it → Portfolio updates.
5. Navigate to Performance → Chart loads (recharts chunk arrives in network tab now).
6. Settings → all tabs working.
7. Logout → Login → state clean.

---

## 6. Risks & rollback

### Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| B4 context refactor introduces wrong filter → missing tx | Medium | High | Capture pre-refactor Dashboard screenshot; uçtan uca smoke. |
| B2 Suspense fallback flashes on slow network | Low | Low | Minimal skeleton + 100ms fade; visual smoke. |
| M1 cron token misconfigured → snapshots silently fail | Medium | Medium | Weekly check of Edge Function logs (operational note). |
| H2 `verify_jwt = true` accidentally applied to `take-snapshots` → cron breaks | Low | High | Only the `backfill-snapshots` block edited; diff-review catches. |
| Large PR review fatigue | Medium | Low | Logical commits per fix; review commit-by-commit. |

### Rollback playbook

**Migration breakage (H1, M1):**
- Down migration files included in repo (not auto-run).
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

- [ ] 7 fixes implemented with logical commits on `chore/pre-deploy-stabilization`
- [ ] `npm run build` and `npm run lint` exit zero
- [ ] All verify checks above pass
- [ ] Smoke flow successful
- [ ] PR opened, self-reviewed, merged
- [ ] `docs/security-audit-2026-05-04.md` updated: H1/H2/M1/M2/M3 marked `Fixed in <commit>`
- [ ] `docs/project-review-2026-05-04.md` updated: items 2 and 4 marked `Fixed`

After merge, the project is ready for the deploy (C) brainstorm.

---

## 8. Open follow-ups (not in this spec)

- **C — Free deploy:** host selection (Vercel / Netlify / CF Pages), custom domain, Supabase Cloud project provisioning, env var management, prod migration push, `enable_signup = false` flip after both accounts created, `ALLOWED_ORIGINS` real-domain narrowing, `CRON_TOKEN` rotation policy.
- **M4** input validation, **L1-L4** — remain open in audit doc.
- **Budget feature** — separate spec already exists (`docs/budget-feature-plan.md`).
