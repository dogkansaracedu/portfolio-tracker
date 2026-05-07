# Pre-deploy Stabilization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close 5 security findings (H1, H2, M1, M2, M3) and 2 cleanup items (B2 bundle, B4 transaction-data context) on a single branch, manual smoke-tested, ready to merge before the deploy phase.

**Architecture:** Single branch `chore/pre-deploy-stabilization` with logical commits per fix. Database changes ship as new migrations (forward-only). Edge Function changes deploy together with `config.toml` flips. Frontend changes are isolated by file. Tasks are ordered low-risk → high-risk so failures appear early.

**Tech Stack:** TypeScript, React 19, Vite, Supabase (Postgres + Edge Functions on Deno), bignumber.js, Recharts, Tailwind, shadcn. No test framework — verification is `npm run build` + `npm run lint` + manual smoke per task.

**Spec:** `docs/superpowers/specs/2026-05-07-pre-deploy-stabilization-design.md`

---

## Task ordering rationale

| # | Task | Risk | Why this order |
|---|---|---|---|
| 0 | Setup branch + bundle baseline | — | Captures before-state for B2 measurement. |
| 1 | M3: password length | Trivial | Single-line config edit. Build the muscle memory for `supabase` config flow. |
| 2 | H2: backfill JWT | Trivial | Single-line config edit. Verify with curl. |
| 3 | H1: seed_user_data guard | Low | Self-contained migration. Easy to verify in browser console. |
| 4 | M2: CORS shared util | Mechanical | 7-file change but pure refactor; no behavior change at allowed origin. |
| 5 | M1: take-snapshots shared secret | Medium | Touches function + cron migration; cron path needs careful local test. |
| 6 | B2: lazy bundle | Medium | UX impact (Suspense fallbacks); measurable before/after. |
| 7 | B4: TransactionDataContext | High | Touches 5 hooks. Numbers must stay identical. Last so earlier work is already verified. |
| 8 | Docs update + PR | — | Mark audit/review items fixed; open PR. |

---

## Task 0: Setup

**Files:**
- No creates/modifies; just branch + baseline capture.

**Steps:**

- [ ] **Step 1: Confirm clean working tree**

```bash
git status
```

Expected: `nothing to commit, working tree clean`. If dirty, stop and resolve.

- [ ] **Step 2: Create branch from master**

```bash
git checkout -b chore/pre-deploy-stabilization
```

- [ ] **Step 3: Capture pre-bundle baseline**

```bash
npm run build
echo "---" && for f in dist/assets/*.js; do
  size=$(gzip -c "$f" | wc -c)
  echo "$(basename "$f"): ${size} bytes gzipped"
done
```

Expected: build succeeds. Save the output verbatim to a scratch note (`/tmp/bundle-before.txt`) — used in Task 6 verify and final PR description.

- [ ] **Step 4: Confirm baseline build + lint pass**

```bash
npm run build && npm run lint
```

Expected: both exit 0. If lint warns, capture warnings — they should not increase by the end of the branch.

---

## Task 1: M3 — password length 10

**Files:**
- Modify: `supabase/config.toml` (line containing `minimum_password_length = 6`)

**Steps:**

- [ ] **Step 1: Find current value**

```bash
grep -n "minimum_password_length" supabase/config.toml
```

Expected output:
```
175:minimum_password_length = 6
```

- [ ] **Step 2: Edit line 175**

Change `minimum_password_length = 6` to `minimum_password_length = 10`.

- [ ] **Step 3: Verify edit**

```bash
grep -n "minimum_password_length" supabase/config.toml
```

Expected:
```
175:minimum_password_length = 10
```

- [ ] **Step 4: Restart local Supabase to pick up config**

```bash
supabase stop && supabase start
```

Expected: starts cleanly. (If Supabase is not currently running, just `supabase start`.)

- [ ] **Step 5: Verify rejection of short password**

In a browser at the local app, attempt to sign up with a 6-char password.
Expected: rejected with a "minimum 10 characters" style error from Supabase auth.

- [ ] **Step 6: Commit**

```bash
git add supabase/config.toml
git commit -m "chore(auth): raise minimum_password_length to 10"
```

---

## Task 2: H2 — backfill-snapshots requires JWT

**Files:**
- Modify: `supabase/config.toml` (the `[functions.backfill-snapshots]` block)

**Steps:**

- [ ] **Step 1: Confirm all client invocations use `supabase.functions.invoke`**

```bash
grep -rn "backfill-snapshots" src/
```

Expected: all matches are inside `supabase.functions.invoke("backfill-snapshots", ...)` calls. If any call uses raw `fetch(...)`, abort and add a `Authorization: Bearer <session-jwt>` header to that call before continuing.

- [ ] **Step 2: Locate the verify_jwt line for backfill-snapshots**

```bash
grep -n "verify_jwt" supabase/config.toml
```

Expected output (3 matches):
```
375:verify_jwt = false
381:verify_jwt = false
387:verify_jwt = false
```

Confirm line 381 is under the `[functions.backfill-snapshots]` section by reading 5 lines of context:

```bash
sed -n '378,384p' supabase/config.toml
```

Expected: shows `[functions.backfill-snapshots]` followed by `verify_jwt = false`.

- [ ] **Step 3: Flip line 381 only**

Change `verify_jwt = false` on line 381 to `verify_jwt = true`. Lines 375 and 387 must remain unchanged.

- [ ] **Step 4: Verify only one line changed**

```bash
git diff supabase/config.toml
```

Expected: exactly one `-`/`+` pair, both about line 381.

- [ ] **Step 5: Restart Supabase**

```bash
supabase stop && supabase start
```

- [ ] **Step 6: Verify unauthenticated curl is rejected**

```bash
curl -i -X POST http://127.0.0.1:54321/functions/v1/backfill-snapshots \
  -H "Content-Type: application/json" \
  -d '{"granularity":"monthly"}'
```

Expected: `HTTP/1.1 401` (or 403). Body is a Supabase auth error.

- [ ] **Step 7: Verify UI Backfill button still works**

In the browser (logged in), open Settings → Snapshot Backfill, click the backfill button.
Expected: 200, snapshots get written. (`supabase.functions.invoke` automatically attaches the session JWT.)

- [ ] **Step 8: Commit**

```bash
git add supabase/config.toml
git commit -m "fix(security): require JWT for backfill-snapshots (audit H2)"
```

---

## Task 3: H1 — `seed_user_data` guard migration

**Files:**
- Read (do not modify): `supabase/migrations/20260402100010_seed_function.sql`
- Create: `supabase/migrations/20260507100000_seed_function_guard.sql`
- Create: `supabase/migrations/20260507100000_seed_function_guard.down.sql`

**Steps:**

- [ ] **Step 1: Read the existing seed function body**

```bash
cat supabase/migrations/20260402100010_seed_function.sql
```

Note the body between `BEGIN` and `END`. This must be preserved verbatim in the new migration (only the guard is added).

- [ ] **Step 2: Create the guard migration**

Write the file `supabase/migrations/20260507100000_seed_function_guard.sql` with the following content. **Replace `<EXISTING_BODY>` with the body lines copied from step 1**:

```sql
-- Guard seed_user_data so that authenticated users cannot pass another
-- user's UUID and write into their tables. The function is SECURITY
-- DEFINER, so without this check it bypasses RLS for any caller.
-- Audit reference: docs/security-audit-2026-05-04.md H1.

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

  -- BEGIN: original body from 20260402100010_seed_function.sql
  <EXISTING_BODY>
  -- END: original body
END;
$$;

REVOKE EXECUTE ON FUNCTION public.seed_user_data(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.seed_user_data(uuid) TO authenticated;
```

- [ ] **Step 3: Create the down migration (kept in repo, not auto-run)**

Write `supabase/migrations/20260507100000_seed_function_guard.down.sql`:

```sql
-- Down migration for the seed_user_data guard. Supabase does not auto-run
-- down migrations; if rolling back is needed, write a new forward migration
-- that restores the body without the guard.
--
-- For local development only:
--   psql <db-url> -f supabase/migrations/20260507100000_seed_function_guard.down.sql

CREATE OR REPLACE FUNCTION public.seed_user_data(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Original body from 20260402100010_seed_function.sql:
  <EXISTING_BODY>
END;
$$;
```

- [ ] **Step 4: Apply migrations locally**

```bash
supabase db reset
```

Expected: all migrations apply cleanly. No errors mentioning `seed_function_guard`.

- [ ] **Step 5: Verify guard with own UUID — should succeed**

In the browser (logged in), open the JS console:

```js
const { data } = await window.supabase.auth.getUser()
await window.supabase.rpc("seed_user_data", { p_user_id: data.user.id })
```

(If `window.supabase` is not exposed, run from a page that already imports it; the codebase uses `import { supabase } from "@/lib/supabase"` — paste a temporary line at any module's top to expose it: `if (import.meta.env.DEV) (window as any).supabase = supabase`. Remove before commit.)

Expected: resolves without throwing. (Idempotent — function does nothing if rows already exist.)

- [ ] **Step 6: Verify guard with foreign UUID — should fail**

In the same console:

```js
await window.supabase.rpc("seed_user_data", { p_user_id: crypto.randomUUID() })
```

Expected: throws an error containing the string `cannot seed for another user`.

- [ ] **Step 7: Build sanity check**

```bash
npm run build
```

Expected: zero errors (no client code changed, but ensures nothing is implicitly broken).

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/20260507100000_seed_function_guard.sql \
        supabase/migrations/20260507100000_seed_function_guard.down.sql
git commit -m "fix(security): guard seed_user_data against cross-user calls (audit H1)"
```

---

## Task 4: M2 — CORS shared util across 7 functions

**Files:**
- Create: `supabase/functions/_shared/cors.ts`
- Modify: `supabase/functions/backfill-snapshots/index.ts`
- Modify: `supabase/functions/fetch-coingecko/index.ts`
- Modify: `supabase/functions/fetch-historical-rate/index.ts`
- Modify: `supabase/functions/fetch-prices/index.ts`
- Modify: `supabase/functions/fetch-tcmb/index.ts`
- Modify: `supabase/functions/fetch-yahoo/index.ts`
- Modify: `supabase/functions/take-snapshots/index.ts`
- Modify: `supabase/.env.local` (or create if absent)

**Steps:**

- [ ] **Step 1: Inspect the current CORS pattern**

```bash
grep -B 1 -A 5 "Access-Control-Allow-Origin" supabase/functions/fetch-prices/index.ts
```

Expected: shows an inline `corsHeaders` object literal with `"Access-Control-Allow-Origin": "*"` and a few static header values.

- [ ] **Step 2: Create the shared util**

Write `supabase/functions/_shared/cors.ts`:

```ts
// Shared CORS helper for all Edge Functions.
// ALLOWED_ORIGINS is a comma-separated env var; if empty or unset the
// helper falls back to the literal string "null" which browsers treat as
// no-allow. Set "*" only if intentionally opening to any origin.

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

- [ ] **Step 3: Add ALLOWED_ORIGINS to local env**

Check whether the env file exists:

```bash
ls -la supabase/.env.local 2>/dev/null
```

If it does NOT exist, create it. If it exists, append (do not overwrite). Add the line:

```
ALLOWED_ORIGINS=http://localhost:5173
```

(`5173` is Vite's default dev port. If your dev server runs elsewhere, use that port.)

- [ ] **Step 4: Migrate `backfill-snapshots`**

In `supabase/functions/backfill-snapshots/index.ts`:

a. Add at the top (after existing imports):
   ```ts
   import { corsHeaders } from "../_shared/cors.ts"
   ```

b. Delete the existing inline `corsHeaders` constant (the `const corsHeaders = { ... }` block).

c. Replace every reference to `corsHeaders` (the constant) with `corsHeaders(req.headers.get("origin"))` (the function call).
   - In the OPTIONS preflight branch and the response builders.

d. Verify the file compiles:
   ```bash
   npx tsc --noEmit --target es2020 --module esnext --moduleResolution bundler --allowImportingTsExtensions --types deno --allowJs supabase/functions/backfill-snapshots/index.ts 2>&1 | head -20
   ```
   (Deno-style imports may not type-check perfectly via `tsc`; treat any errors that mention `Deno` or `.ts` extensions as benign. Real issues will be about `corsHeaders` usage.)

- [ ] **Step 5: Migrate the other 6 functions identically**

Repeat the same 3-substitution pattern (import, delete inline const, function call) for:
- `supabase/functions/fetch-coingecko/index.ts`
- `supabase/functions/fetch-historical-rate/index.ts`
- `supabase/functions/fetch-prices/index.ts`
- `supabase/functions/fetch-tcmb/index.ts`
- `supabase/functions/fetch-yahoo/index.ts`
- `supabase/functions/take-snapshots/index.ts`

- [ ] **Step 6: Confirm no inline corsHeaders constants remain**

```bash
grep -rn '^const corsHeaders' supabase/functions/
```

Expected: zero matches.

```bash
grep -rn 'from "../_shared/cors.ts"' supabase/functions/
```

Expected: 7 matches (one per function).

- [ ] **Step 7: Restart local functions**

```bash
supabase functions serve --env-file supabase/.env.local
```

(Run this in a separate terminal; keep it running for the next steps.)

- [ ] **Step 8: Verify allowed origin gets reflected**

```bash
curl -i -X OPTIONS http://127.0.0.1:54321/functions/v1/fetch-prices \
  -H "Origin: http://localhost:5173" \
  -H "Access-Control-Request-Method: POST"
```

Expected response header: `Access-Control-Allow-Origin: http://localhost:5173`.

- [ ] **Step 9: Verify disallowed origin does NOT get reflected**

```bash
curl -i -X OPTIONS http://127.0.0.1:54321/functions/v1/fetch-prices \
  -H "Origin: https://evil.example.com" \
  -H "Access-Control-Request-Method: POST"
```

Expected: `Access-Control-Allow-Origin` is `http://localhost:5173` (the fallback first allowlisted origin), NOT `https://evil.example.com`.

- [ ] **Step 10: Smoke the UI**

In the browser (logged in), open Dashboard. The UI calls Edge Functions for prices. All should succeed without CORS errors in the console.

- [ ] **Step 11: Commit**

```bash
git add supabase/functions/ supabase/.env.local
git commit -m "fix(security): origin allowlist via shared CORS util (audit M2)"
```

---

## Task 5: M1 — `take-snapshots` shared secret + cron migration

**Files:**
- Modify: `supabase/functions/take-snapshots/index.ts`
- Create: `supabase/migrations/20260507100100_cron_take_snapshots_token.sql`
- Modify: `supabase/.env.local`

**Steps:**

- [ ] **Step 1: Read existing cron migration**

```bash
cat supabase/migrations/20260502120100_daily_snapshot_cron.sql
```

Note: the job is named `daily-portfolio-snapshot` and currently calls `http://kong:8000/functions/v1/take-snapshots` with no auth headers.

- [ ] **Step 2: Generate a cron token**

```bash
TOKEN=$(openssl rand -hex 32)
echo "$TOKEN"
```

Save the value — you'll use it twice (Edge Function env, Postgres GUC).

- [ ] **Step 3: Add CRON_TOKEN to local env**

Append to `supabase/.env.local`:

```
CRON_TOKEN=<paste TOKEN value here>
```

(Replace `<paste TOKEN value here>` with the literal hex string from step 2.)

- [ ] **Step 4: Add token check to the function handler**

In `supabase/functions/take-snapshots/index.ts`, locate the request handler. After the existing OPTIONS preflight short-circuit and BEFORE any database or external call, insert:

```ts
const expectedToken = Deno.env.get("CRON_TOKEN")
const providedToken = req.headers.get("X-Cron-Token")

if (!expectedToken || providedToken !== expectedToken) {
  return new Response(JSON.stringify({ error: "unauthorized" }), {
    status: 401,
    headers: {
      ...corsHeaders(req.headers.get("origin")),
      "Content-Type": "application/json",
    },
  })
}
```

The `corsHeaders` import is already present from Task 4.

- [ ] **Step 5: Create the cron migration**

Write `supabase/migrations/20260507100100_cron_take_snapshots_token.sql`:

```sql
-- Re-schedule the daily snapshot cron to send X-Cron-Token. The token
-- value is read from a Postgres GUC `app.cron_token` so the secret
-- never lands in migration history. Set per environment via:
--   ALTER DATABASE postgres SET app.cron_token = '<token>';
-- Audit reference: docs/security-audit-2026-05-04.md M1.

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
```

- [ ] **Step 6: Apply locally**

```bash
supabase db reset
```

Expected: applies cleanly.

- [ ] **Step 7: Set the Postgres GUC for the cron token**

```bash
DB_URL=$(supabase status -o env 2>/dev/null | grep DB_URL | cut -d= -f2- | tr -d '"')
psql "$DB_URL" -c "ALTER DATABASE postgres SET app.cron_token = '<paste TOKEN here>';"
psql "$DB_URL" -c "SELECT current_setting('app.cron_token', true);"
```

Expected: the second query echoes the token. (If `supabase status -o env` doesn't exist on your CLI, get the URL via `supabase status` and copy `DB URL` manually.)

- [ ] **Step 8: Restart functions to pick up the new env**

In the terminal running `supabase functions serve`, Ctrl-C and restart:

```bash
supabase functions serve --env-file supabase/.env.local
```

- [ ] **Step 9: Verify rejection without token**

```bash
curl -i -X POST http://127.0.0.1:54321/functions/v1/take-snapshots \
  -H "Content-Type: application/json" \
  -d '{}'
```

Expected: `HTTP/1.1 401`, body `{"error":"unauthorized"}`.

- [ ] **Step 10: Verify acceptance with token**

```bash
curl -i -X POST http://127.0.0.1:54321/functions/v1/take-snapshots \
  -H "Content-Type: application/json" \
  -H "X-Cron-Token: <paste TOKEN here>" \
  -d '{}'
```

Expected: `HTTP/1.1 200`. Body shows snapshot result (or `{ok:true}` style).

- [ ] **Step 11: Verify cron path end-to-end**

Trigger the schedule manually:

```bash
psql "$DB_URL" -c "SELECT net.http_post(
  url := 'http://kong:8000/functions/v1/take-snapshots',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'X-Cron-Token', current_setting('app.cron_token', true)
  ),
  body := '{}'::jsonb
);"
```

Then check the response:

```bash
psql "$DB_URL" -c "SELECT id, status_code, content_type, error_msg FROM net._http_response ORDER BY id DESC LIMIT 1;"
```

Expected: `status_code = 200`, `error_msg` is null.

- [ ] **Step 12: Build sanity check**

```bash
npm run build
```

Expected: zero errors.

- [ ] **Step 13: Commit**

```bash
git add supabase/functions/take-snapshots/index.ts \
        supabase/migrations/20260507100100_cron_take_snapshots_token.sql \
        supabase/.env.local
git commit -m "fix(security): require X-Cron-Token for take-snapshots (audit M1)"
```

---

## Task 6: B2 — lazy routes + lazy recharts

**Files:**
- Create: `src/components/layout/RouteSkeleton.tsx`
- Modify: `src/App.tsx`
- Inspect: `src/components/charts/` (or wherever Recharts components live)
- Create: `src/components/charts/LazyChart.tsx` (only if charts live in their own folder)
- Modify: chart consumer pages (Performance, Dashboard hero) — discovered in Step 4.

**Steps:**

- [ ] **Step 1: Locate Recharts importers**

```bash
grep -rn "from 'recharts'\|from \"recharts\"" src/
```

Expected: 1-3 matches in chart components. Note their file paths — they will become the lazy-loaded units.

- [ ] **Step 2: Create RouteSkeleton**

Write `src/components/layout/RouteSkeleton.tsx`:

```tsx
export default function RouteSkeleton() {
  return (
    <div className="flex h-full min-h-[200px] items-center justify-center p-8">
      <div className="text-sm text-muted-foreground animate-pulse">Loading…</div>
    </div>
  )
}
```

- [ ] **Step 3: Lazy-load routes in App.tsx**

Replace the contents of `src/App.tsx` with:

```tsx
import { BrowserRouter, Routes, Route } from "react-router"
import { lazy, Suspense } from "react"
import AppLayout from "@/components/layout/AppLayout"
import ProtectedRoute from "@/components/auth/ProtectedRoute"
import RouteSkeleton from "@/components/layout/RouteSkeleton"
import DashboardPage from "@/pages/DashboardPage"
import LoginPage from "@/pages/LoginPage"
import SignupPage from "@/pages/SignupPage"

const PortfolioPage = lazy(() => import("@/pages/PortfolioPage"))
const TransactionsPage = lazy(() => import("@/pages/TransactionsPage"))
const PerformancePage = lazy(() => import("@/pages/PerformancePage"))
const SettingsPage = lazy(() => import("@/pages/SettingsPage"))

function Lazy({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<RouteSkeleton />}>{children}</Suspense>
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<AppLayout />}>
            <Route index element={<DashboardPage />} />
            <Route path="portfolio" element={<Lazy><PortfolioPage /></Lazy>} />
            <Route path="transactions" element={<Lazy><TransactionsPage /></Lazy>} />
            <Route path="performance" element={<Lazy><PerformancePage /></Lazy>} />
            <Route path="settings" element={<Lazy><SettingsPage /></Lazy>} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
```

(Auth pages stay eager because they're tiny and run on first paint anyway. Dashboard stays eager because it's the default route — making it lazy adds a fallback flash on every login.)

- [ ] **Step 4: Identify chart components and their importers**

For each Recharts file found in Step 1, list its consumers:

```bash
# Replace <chart-file-path> with the actual path:
grep -rn "from \"@/components/charts/<chart-file-name>\"" src/
```

Note each consumer (likely Performance page and Dashboard hero).

- [ ] **Step 5: Create LazyChart wrappers**

Write `src/components/charts/LazyChart.tsx` (adjust the import paths to whatever you found in Step 1):

```ts
import { lazy } from "react"

// One re-export per chart file. Update names to match the actual files
// found via `grep -rn "from 'recharts'" src/`.
// Example below assumes a PerformanceChart.tsx component with default export.

export const PerformanceChart = lazy(() => import("./PerformanceChart"))
// Add additional chart components here, e.g.:
// export const HeroSparkline = lazy(() => import("./HeroSparkline"))
```

If a chart file uses a named export instead of default, wrap it:

```ts
export const PerformanceChart = lazy(() =>
  import("./PerformanceChart").then((m) => ({ default: m.PerformanceChart }))
)
```

- [ ] **Step 6: Update consumer pages**

For each page that imports a chart directly, change the import to come from `LazyChart` and wrap usage in `<Suspense>`:

```tsx
// Before:
import { PerformanceChart } from "@/components/charts/PerformanceChart"
// ...
<PerformanceChart data={...} />

// After:
import { Suspense } from "react"
import { PerformanceChart } from "@/components/charts/LazyChart"
import RouteSkeleton from "@/components/layout/RouteSkeleton"
// ...
<Suspense fallback={<RouteSkeleton />}>
  <PerformanceChart data={...} />
</Suspense>
```

(Reusing `RouteSkeleton` is fine for chart fallback — it's already minimal.)

- [ ] **Step 7: Build**

```bash
npm run build
```

Expected: zero errors. Vite output should show multiple chunks named like `PortfolioPage-xxxx.js`, `PerformancePage-xxxx.js`, `recharts-xxxx.js`.

- [ ] **Step 8: Capture post-bundle measurements**

```bash
echo "=== AFTER ==="
for f in dist/assets/*.js; do
  size=$(gzip -c "$f" | wc -c)
  echo "$(basename "$f"): ${size} bytes gzipped"
done
```

Append to the same scratch note. Compute initial bundle (the file referenced by `dist/index.html`):

```bash
INDEX_JS=$(grep -oE 'src="[^"]*assets/index-[^"]*\.js"' dist/index.html | head -1 | sed 's/src="//;s/"$//')
echo "Initial JS: $INDEX_JS"
gzip -c "dist/$INDEX_JS" | wc -c
```

Expected: under 200000 bytes (200kB).

- [ ] **Step 9: Verify in dev — Dashboard does NOT load Recharts**

Run `npm run dev`. Open the app, log in to Dashboard. Open DevTools → Network → filter `js`. Note: no chunk containing "recharts" should appear.

- [ ] **Step 10: Verify navigation triggers chart chunk**

Click Performance nav item. A new JS chunk (containing "recharts" or the chart component name) should load NOW.

- [ ] **Step 11: Smoke each lazy route**

Click Portfolio, Transactions, Performance, Settings in turn. Each shows the loading skeleton briefly, then content. No errors in console.

- [ ] **Step 12: Build + lint final**

```bash
npm run build && npm run lint
```

Expected: zero errors, no new warnings vs. Task 0 baseline.

- [ ] **Step 13: Commit**

```bash
git add src/App.tsx src/components/layout/RouteSkeleton.tsx src/components/charts/LazyChart.tsx
# Plus any consumer files modified in Step 6:
git add src/pages/PerformancePage.tsx  # adjust to actual files
git commit -m "perf(bundle): lazy-load routes and recharts (project review B2)"
```

---

## Task 7: B4 — TransactionDataContext SoT

**Files:**
- Create: `src/contexts/TransactionDataContext.tsx`
- Modify: `src/main.tsx`
- Modify: `src/hooks/useDashboardHero.ts`
- Modify: `src/hooks/usePnL.ts`
- Modify: `src/hooks/useCostBasis.ts`
- Modify: `src/hooks/useTransactionLog.ts`
- Modify: `src/hooks/useTransactions.ts`

**Steps:**

- [ ] **Step 1: Capture pre-refactor Dashboard numbers**

In the browser, navigate to Dashboard (logged in). Take a screenshot or write down (in `/tmp/dashboard-before.txt`):
- Total USD value
- Total TRY value
- Top 3 categories (name + USD)
- Top 3 platforms (name + USD)
- Total P&L USD

Also: open DevTools → Network → filter `transactions`. Refresh Dashboard. Count the number of `transactions?...` requests. Expected: 3-4.

- [ ] **Step 2: Read the existing TransactionContext to confirm naming clash plan**

```bash
cat src/contexts/TransactionContext.tsx | head -40
```

Confirm: existing context exposes `useTransactionModal` (modal state). The new context will export `useTransactionData` — different hook name, no clash.

- [ ] **Step 3: Read useTransactions to see mutation flow**

```bash
cat src/hooks/useTransactions.ts
```

Note where add / edit / remove mutations land (likely a `txVersion` bump or similar). The new `refresh()` call needs to slot in there.

- [ ] **Step 4: Create TransactionDataContext**

Write `src/contexts/TransactionDataContext.tsx`:

```tsx
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react"
import {
  fetchTransactionsForAllAssets,
  fetchAllExchangeRates,
} from "@/lib/queries/pnl"
import { useAuth } from "@/hooks/useAuth"
import type { Transaction, ExchangeRate } from "@/types/database"

interface TransactionDataValue {
  transactions: Transaction[]
  rates: ExchangeRate[]
  loading: boolean
  refresh: () => Promise<void>
}

const TransactionDataContext = createContext<TransactionDataValue | null>(null)

export function TransactionDataProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [rates, setRates] = useState<ExchangeRate[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (!user) {
      setTransactions([])
      setRates([])
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const [tx, rt] = await Promise.all([
        fetchTransactionsForAllAssets(user.id),
        fetchAllExchangeRates(),
      ])
      setTransactions(tx)
      setRates(rt)
    } catch (err) {
      console.error("TransactionDataProvider load failed:", err)
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    refresh()
  }, [refresh])

  return (
    <TransactionDataContext.Provider value={{ transactions, rates, loading, refresh }}>
      {children}
    </TransactionDataContext.Provider>
  )
}

export function useTransactionData() {
  const v = useContext(TransactionDataContext)
  if (!v) {
    throw new Error("useTransactionData must be used inside TransactionDataProvider")
  }
  return v
}
```

- [ ] **Step 5: Wrap App with the new provider**

Edit `src/main.tsx`. The provider must sit INSIDE `AuthProvider` (it depends on `useAuth`) and OUTSIDE `TransactionProvider` (modal state is independent). Result:

```tsx
<TooltipProvider>
  <DisplayProvider>
    <AuthProvider>
      <TransactionDataProvider>
        <TransactionProvider>
          <App />
        </TransactionProvider>
      </TransactionDataProvider>
    </AuthProvider>
  </DisplayProvider>
</TooltipProvider>
```

Add the import:
```tsx
import { TransactionDataProvider } from "@/contexts/TransactionDataContext"
```

- [ ] **Step 6: Migrate `useDashboardHero`**

In `src/hooks/useDashboardHero.ts`:

a. Add import:
   ```ts
   import { useTransactionData } from "@/contexts/TransactionDataContext"
   ```

b. Inside the hook function, replace the local state + `useEffect` that calls `Promise.all([fetchTransactionsForAllAssets, fetchAllExchangeRates])` with:
   ```ts
   const { transactions, rates, loading: pnlLoading } = useTransactionData()
   ```

c. Remove the now-unused imports of `fetchTransactionsForAllAssets` and `fetchAllExchangeRates`. Remove the now-unused `useState` lines for `transactions`, `rates`, and `pnlLoading`. Remove the `useEffect` that loaded them.

d. Confirm the rest of the hook (which uses `transactions` and `rates` to compute hero data) still works without changes.

- [ ] **Step 7: Migrate `usePnL`**

In `src/hooks/usePnL.ts`, apply the same pattern as Step 6:
- Replace own `Promise.all` fetch with `useTransactionData()`.
- Remove unused imports and state.
- Note: `usePnL` may have a `txVersion` re-fetch trigger. The context's `refresh()` replaces this — the `useEffect` watching `txVersion` can be removed entirely (mutations now call `refresh()` directly in Step 9).

- [ ] **Step 8: Migrate `useTransactionLog` and `useCostBasis`**

`useTransactionLog`:
- Replace `fetchAllExchangeRates().then(setRates)` with `const { rates } = useTransactionData()`.
- Remove unused state.

`useCostBasis`:
- Replace `fetchTransactionsForPnL(assetId, platformId)` call with:
  ```ts
  import { useMemo } from "react"
  import { useTransactionData } from "@/contexts/TransactionDataContext"
  // ...
  const { transactions, rates } = useTransactionData()
  const txForPair = useMemo(
    () =>
      transactions
        .filter((t) => t.asset_id === assetId && t.platform_id === platformId)
        .sort(
          (a, b) =>
            a.date.localeCompare(b.date) ||
            a.created_at.localeCompare(b.created_at)
        ),
    [transactions, assetId, platformId]
  )
  ```
- Use `txForPair` everywhere the old fetched array was used.

- [ ] **Step 9: Wire mutation refresh in `useTransactions`**

In `src/hooks/useTransactions.ts`:

a. Add import:
   ```ts
   import { useTransactionData } from "@/contexts/TransactionDataContext"
   ```

b. Inside the hook:
   ```ts
   const { refresh } = useTransactionData()
   ```

c. After each successful mutation (`addTransaction`, `editTransaction`, `removeTransaction`), call `await refresh()` before any existing `txVersion` bump or return. Example pattern:

```ts
async function addTransaction(input: NewTransactionInput) {
  const { error } = await supabase.from("transactions").insert(input)
  if (error) throw error
  await refresh()
}
```

(If the existing code does balance recalculation or holdings updates after insert, keep those; just add `await refresh()` after them and before any UI version bumps.)

- [ ] **Step 10: TypeScript check**

```bash
npm run build
```

Expected: zero errors. If consumer hooks complain about removed variables, ensure all destructuring updates were done. If `loading` types diverged, expose them consistently.

- [ ] **Step 11: Lint**

```bash
npm run lint
```

Expected: zero new warnings.

- [ ] **Step 12: Verify single fetch on Dashboard mount**

In the browser, refresh the app (full reload). Open DevTools → Network → filter `transactions`. Watch as Dashboard loads.

Expected: exactly **1** request matching `transactions?...`. (Was 3-4 before.) Same check for `exchange_rates`: exactly 1.

- [ ] **Step 13: Verify Dashboard numbers unchanged**

Compare current Dashboard values to the screenshot/notes from Step 1. All numbers must be identical (Total USD, TRY, top categories, top platforms, total P&L).

- [ ] **Step 14: Verify mutations refresh dashboard**

Add a small buy transaction (e.g. 0.001 BTC at platform X). Without refreshing the page, navigate back to Dashboard. Expected: numbers updated immediately.

Edit that transaction (change amount). Expected: numbers update immediately.

Delete it. Expected: numbers revert to step-1 values.

- [ ] **Step 15: Commit**

```bash
git add src/contexts/TransactionDataContext.tsx src/main.tsx \
        src/hooks/useDashboardHero.ts src/hooks/usePnL.ts \
        src/hooks/useCostBasis.ts src/hooks/useTransactionLog.ts \
        src/hooks/useTransactions.ts
git commit -m "perf(data): TransactionDataContext SoT, dedupe transaction fetches (project review B4)"
```

---

## Task 8: Final smoke + docs update + PR

**Files:**
- Modify: `docs/security-audit-2026-05-04.md`
- Modify: `docs/project-review-2026-05-04.md`

**Steps:**

- [ ] **Step 1: Run the full smoke flow (~10 min)**

In the browser at the local app:
1. Logout if logged in. Login.
2. Dashboard renders correctly.
3. Add a buy transaction → Portfolio + Dashboard update.
4. Edit it → Numbers update.
5. Delete it → Portfolio updates.
6. Navigate to Performance → Chart loads.
7. Navigate to Settings → Backfill works (Task 2 verified, sanity recheck).
8. Logout → Login → state clean.

If any step fails, identify the responsible commit and revert it before proceeding.

- [ ] **Step 2: Final build + lint**

```bash
npm run build && npm run lint
```

Expected: zero errors.

- [ ] **Step 3: Capture final commit hashes**

```bash
git log --oneline master..HEAD
```

Save the commit list — you'll cite hashes in the docs updates.

- [ ] **Step 4: Mark audit items as Fixed**

Edit `docs/security-audit-2026-05-04.md`. For each of H1, H2, M1, M2, M3, prepend a "Fixed in `<hash>`" note to the heading. Example:

```markdown
### H1. `seed_user_data` is callable for any user_id  ✅ Fixed in <hash>
```

(Use the actual short hashes from Step 3.)

- [ ] **Step 5: Mark project-review items as Fixed**

Edit `docs/project-review-2026-05-04.md`. For items 2 (bundle size) and 4 (duplicate fetching), prepend the Fixed note. Item 3 (public Edge Functions) is also fixed by H2/M1 — note that too.

Items 1, 5, 6, 7 were already marked closed by `62b8c98`; no changes needed there.

- [ ] **Step 6: Commit docs updates**

```bash
git add docs/security-audit-2026-05-04.md docs/project-review-2026-05-04.md
git commit -m "docs: mark audit and review items as fixed"
```

- [ ] **Step 7: Push branch**

```bash
git push -u origin chore/pre-deploy-stabilization
```

- [ ] **Step 8: Open PR**

Use `gh pr create` with a body that includes:
- Summary: "Closes 5 security findings (H1, H2, M1, M2, M3) and 2 cleanup items (B2, B4) before deploy."
- Bundle size before/after table (from `/tmp/bundle-before.txt` and Task 6 Step 8).
- Verify checklist matching the spec's Section 5.
- Test plan: re-run the smoke flow on the merged code post-merge.

```bash
gh pr create --title "chore: pre-deploy stabilization (security + cleanup)" --body "$(cat <<'EOF'
## Summary
- Closes audit findings H1, H2, M1, M2, M3 (see `docs/security-audit-2026-05-04.md`).
- Closes project-review items B2 (bundle size) and B4 (duplicate fetching).
- Spec: `docs/superpowers/specs/2026-05-07-pre-deploy-stabilization-design.md`.

## Bundle size (gzip)
| Bundle | Before | After |
|---|---|---|
| Initial JS | <fill from /tmp/bundle-before.txt> | <fill from Task 6 Step 8> |
| Recharts | in main | separate chunk (lazy) |

## Test plan
- [ ] H1: `rpc('seed_user_data', { p_user_id: <random> })` throws.
- [ ] H2: unauthenticated `curl` to `/backfill-snapshots` returns 401.
- [ ] M1: unauthenticated `curl` to `/take-snapshots` returns 401; with token returns 200.
- [ ] M2: OPTIONS preflight from non-allowlisted origin not reflected.
- [ ] M3: signup with 6-char password rejected.
- [ ] B2: Performance page network shows recharts chunk only on navigation.
- [ ] B4: Dashboard makes exactly 1 `transactions` fetch on mount; numbers unchanged.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 9: Self-review the PR diff**

Open the PR in the browser. Read the diff commit-by-commit. For each commit:
- Does it do exactly what the message claims?
- Are there stray changes (whitespace-only edits, unrelated files)?

If yes to stray changes, fix and force-push (or amend + force-push).

- [ ] **Step 10: Merge**

After self-review passes, merge with a merge commit (not squash):

```bash
gh pr merge --merge
```

After merge, the project is ready for the deploy (C) brainstorm.

---

## Self-review checklist (run before handing this plan off)

- [x] Each task has exact file paths.
- [x] Each step shows the actual code or command.
- [x] No "TBD"/"TODO"/"implement later" placeholders for required work.
- [x] Type names (`TransactionDataValue`, `useTransactionData`) consistent across tasks.
- [x] Verify steps are concrete (curl with status code, query with expected output).
- [x] Migration ordering documented; cron job name (`daily-portfolio-snapshot`) consistent with `20260502120100`.
- [x] Spec coverage: H1, H2, M1, M2, M3, B2, B4 each have an implementing task.
