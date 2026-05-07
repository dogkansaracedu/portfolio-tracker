# Security Audit — 2026-05-04

Scope: existing codebase (not just current branch). Deferred — user explicitly chose to defer security work; this file is a parking list with priorities so nothing gets lost.

Today is a single-user app, so most issues have a tiny real blast radius. Severity below assumes the app could later be exposed publicly (or that a curious passer-by stumbles on the URL).

---

## HIGH

### H1. `seed_user_data` is callable for any user_id  ✅ Fixed in `79ff342`

`supabase/migrations/20260402100010_seed_function.sql:4`

```sql
CREATE OR REPLACE FUNCTION public.seed_user_data(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$ ...
```

- `SECURITY DEFINER` runs as function owner → RLS bypassed.
- Takes `p_user_id` as a parameter; no `auth.uid() = p_user_id` check.
- Exposed via `supabase.rpc("seed_user_data", ...)` — any authenticated user can call it.
- Combined with `auth.enable_signup = true` + `auth.enable_confirmations = false` (anyone can sign up without email verification): an attacker creates an account, calls `seed_user_data` with a victim's UUID, and pollutes the victim's `platforms` and `assets` tables.

**Fix options (any one):**
- Add guard at top of function:
  ```sql
  IF p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'cannot seed for another user';
  END IF;
  ```
- Drop the parameter; use `auth.uid()` directly inside the function.
- Move the seed to a `BEFORE INSERT ON auth.users` trigger so the client never calls it.
- `REVOKE EXECUTE ... FROM authenticated;` and replace the client `rpc()` call with a server-side trigger.

### H2. `backfill-snapshots` is a public, expensive, cross-user, write-capable endpoint  ✅ Fixed in `011a41e`

`supabase/config.toml:380` — `verify_jwt = false`
`supabase/functions/backfill-snapshots/index.ts:190` — uses service role
`supabase/functions/backfill-snapshots/index.ts:243` — reads all users' transactions

- No auth required. Hitting the URL triggers a 30–90-second job that:
  - Reads all assets / platforms / transactions across every user (service role bypasses RLS).
  - Sequentially calls CoinGecko (with 1.5s delays) and Yahoo (with 0.8s delays).
  - Upserts (and optionally overwrites) snapshots for every user.
- `Access-Control-Allow-Origin: *` — any website can launch it via a browser fetch.
- An attacker can: burn CoinGecko / Yahoo rate limits, fill the snapshots table, and force `overwrite: true` to wipe legitimate history.

**Fix:** flip to `verify_jwt = true` in `config.toml` and have the client invoke it with a logged-in session (`supabase.functions.invoke` already passes the JWT). Cron does not call this — only `take-snapshots` is cron-driven.

---

## MEDIUM

### M1. `take-snapshots` is also unauthenticated (mitigated but still public)  ✅ Fixed in `b64d755`

`supabase/config.toml:374` + `supabase/functions/take-snapshots/index.ts:102`

- Same shape as backfill: `verify_jwt = false`, service role, iterates all users.
- Mitigated: idempotent (upserts today's snapshot from current `holdings`); body is ignored. Direct damage is bounded.
- Still: anyone can flood the endpoint, generating writes and CPU.

**Why it's `verify_jwt = false`:** so pg_cron can call it without a session.

**Fix options:**
- Shared-secret header: Edge Function checks `req.headers.get("X-Cron-Token") === Deno.env.get("CRON_TOKEN")` and `cron.schedule` injects the same header. Keeps cron working, blocks public callers.
- Or: switch cron to call via a Postgres trigger / `pg_net` with the service-role JWT in the `Authorization` header and turn `verify_jwt = true` back on. (Service role JWT, kept inside Postgres.)

Shared secret is simpler.

### M2. CORS wildcard on every Edge Function  ✅ Fixed in `9571ec1`

All six Edge Functions (`fetch-*`, `take-snapshots`, `backfill-snapshots`) set `Access-Control-Allow-Origin: *`. Combined with H2/M1, any browser tab on any site can call the snapshot functions. After fixing H2/M1, this becomes lower risk (Supabase JWTs are scoped), but tightening to your deployed frontend origin (or an env-driven allowlist) is best practice.

### M3. Auth defaults are wide open for a single-user app  ✅ Fixed in `d4c4411`

`supabase/config.toml`:

- `enable_signup = true` (line 169) — anyone can create an account.
- `[auth.email] enable_confirmations = false` (line 209) — sign-ups don't need email verification.
- `minimum_password_length = 6` (line 175) — weak; 10+ recommended.

For a single-user app exposed publicly, the most defensive setting is:
- `enable_signup = false` after your one account exists, OR
- Keep signup on but require email confirmation, AND
- Bump password length.

This is a `config.toml` change only.

### M4. No input validation on Edge Function POST bodies

`backfill-snapshots/index.ts:202-207` parses `req.json()` and trusts `body.granularity` / `body.overwrite` with only an `if granularity === "monthly"` branch — anything else falls through to per-tx mode. Service role + RLS-bypass means malformed input doesn't enable SQL injection, but a richer schema (zod-style validation, reject unknown values) would defend against future fields.

---

## LOW / informational

### L1. `db.network_restrictions.enabled = false`

`supabase/config.toml:69` — local dev only. Hosted Supabase has its own controls, but worth confirming the production project has restricted CIDRs if exposing the Postgres port.

### L2. No rate limiting on Edge Functions

Supabase doesn't rate-limit Edge Functions per IP by default. After fixing H2/M1, JWT-required endpoints inherit Supabase's auth rate limits, but the `fetch-*` endpoints and any future public endpoints would still be open.

### L3. Service role key is loaded in every Edge Function

Standard Supabase pattern; fine. Just noting that all six functions are equally trusted — there's no read-only function. If you ever need an "external user can hit this safely" function, build it without the service role and rely on RLS.

### L4. `auth.rate_limit.email_sent = 2` per hour

`config.toml:182` — legitimate users hitting password-reset twice in an hour will get blocked. Not a security issue; UX nit.

---

## Things I checked and they were fine

- **RLS coverage**: every user-owned table (`platforms`, `assets`, `holdings`, `transactions`, `snapshots`) has all 4 policies (SELECT/INSERT/UPDATE/DELETE) on `auth.uid() = user_id`. `price_cache` and `exchange_rates` are read-by-authenticated, writeable only via service role — correct.
- **`.env.local`** is gitignored. Only contains `VITE_SUPABASE_URL` + anon key (public by design).
- **No `dangerouslySetInnerHTML`** anywhere in `src/`. XSS surface is minimal.
- **No raw SQL** in client code. Everything goes through supabase-js (parametrized).
- **No untrusted strings written to DB columns** that would allow injection — types are constrained.
- **`enable_anonymous_sign_ins = false`** in `config.toml`.
- **`refresh_token_reuse_interval = 10` + rotation enabled** — sensible defaults.

---

## Suggested order of action when you come back to this

1. H1 (seed_user_data guard) — 5-line SQL migration, biggest cross-user risk closed.
2. H2 (`backfill-snapshots` JWT) — one line in `config.toml`.
3. M1 (`take-snapshots` shared secret) — function tweak + cron header.
4. M3 (auth signup + password length) — `config.toml` only.
5. M2 (CORS allowlist) — touches every Edge Function but mechanical.
6. M4, L-tier — nice-to-haves.
