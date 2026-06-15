# Component 2: Database Schema & Auth — Technical (this build)

> Layer: React/Vite/Supabase implementation. Contract → [../02-database-schema-auth.md](../02-database-schema-auth.md)

## Stack

- **Supabase Postgres** for storage; **Supabase Auth** (email/password) for identity.
- **Row-Level Security (RLS)** on every table is the per-user isolation mechanism.
- **Edge Functions / pg_cron / pg_net** drive the price/snapshot writes (owned by other components; this doc only notes the tables they write to).
- Frontend: **React 19 + Vite + TypeScript**, shadcn/ui form primitives, React Router 7 for the protected-route gate.
- All money/quantity columns are Postgres `numeric`; the client uses **BigNumber.js** and writes `numeric` as strings to preserve precision (see `src/types/database.ts` insert helpers).

## File map — real paths + one-line role each

**Migrations** (`supabase/migrations/`, append-only, timestamp-prefixed, applied in order):

| File | Role |
|------|------|
| `20260520000000_init.sql` | **Consolidated baseline** (replaces 22 prior migrations). Creates the `transaction_type` enum; all tables (`signup_allowlist`, `platforms`, `assets`, `holdings`, `transactions`, `price_cache`, `snapshots`, `exchange_rates`); indexes; restores `public`-schema grants; enables RLS + per-user policies; defines `enforce_signup_allowlist()` + its `BEFORE INSERT` trigger on `auth.users`; defines `seed_user_data(uuid)`; schedules the daily snapshot cron. |
| `20260522000000_benchmark_prices.sql` | Adds global `benchmark_prices` table (index daily-close history) + read-only RLS for authenticated. |
| `20260524000000_bulk_insert_transactions.sql` | Adds `bulk_insert_transactions(jsonb)` RPC (atomic multi-row insert + auto cash-side children + balance recompute). `SECURITY INVOKER` so RLS still applies. |
| `20260529234241_asset_price_id_column.sql` | Adds `assets.price_id` (provider fetch key, decoupled from display `ticker`); backfills `price_id = ticker`. Behavior-neutral. |
| `20260530000311_asset_yahoo_retarget.sql` | **Breaking w/ deploy:** retargets crypto + tokenized gold to Yahoo `*-USD` symbols, renames stablecoins (display only), re-keys `price_cache`. |
| `20260531000000_asset_icon_url_column.sql` | Adds `assets.icon_url` (optional manual logo override). Additive. |
| `20260601000000_stablecoin_yahoo_retarget.sql` | Retargets USDT/USDC to Yahoo, re-keys `price_cache`, and **re-defines `seed_user_data`** to the Yahoo-priced model (8 platforms + 13 assets — superseded as the authoritative seed body by `20260610000000_…`). |
| `20260602000000_demand_driven_price_refresh.sql` | Repoints the daily cron from `take-snapshots` to `fetch-prices` with `{force, snapshot}` (demand-driven refresh). No schema change. |
| `20260610000000_global_asset_catalog.sql` | Flips assets to a global admin-managed catalog: deletes other users' seed-duplicate asset rows, swaps assets RLS to global-read/admin-write, reseeds seed_user_data to platforms-only. |
| `20260615000000_intraday_snapshots.sql` | Adds per-user `intraday_snapshots` table (timestamp-keyed, totals-only: `captured_at`, `total_usd`, `total_try`) + index `idx_intraday_user_captured` + four `auth.uid() = user_id` RLS policies. Rolling 24h window — written hourly, pruned by `take-intraday-snapshots`. |
| `20260615000100_schedule_intraday_snapshot_cron.sql` | Schedules pg_cron `hourly-intraday-snapshot` (`0 * * * *`) → POSTs `fetch-prices` with `{force, intraday}`. No schema change. |

**Types & client:**

- `src/types/database.ts` — hand-written row interfaces mirroring the schema (`Platform`, `Asset`, `Holding`, `Transaction`, `PriceCache`, `Snapshot`, `ExchangeRate`, `BenchmarkPrice`), the `TransactionType` union, the `SnapshotBreakdown` shape, and `*Insert` / `*Update` helper types (numeric-as-string on writes). Kept in sync with migrations **by hand** — there is no generated-types step in the loop.
- `src/lib/supabase.ts` — single `createClient` instance from `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`; throws at startup if either env var is missing (no local dev server → a missing Vercel env var would otherwise ship silently broken).

**Auth UI & state:**

- `src/contexts/AuthContext.tsx` — `AuthProvider` + `AuthContext`. Holds `{ user, session, loading }`; exposes `signIn` / `signUp` / `signOut`. Restores the session on mount via `getSession()`, subscribes to `onAuthStateChange`. After a successful `signUp` it calls `supabase.rpc("seed_user_data", { p_user_id })` (best-effort; logs on failure).
- `src/hooks/useAuth.ts` — `useAuth()` consumer hook; throws if used outside `AuthProvider`.
- `src/components/auth/LoginForm.tsx` — email/password form; on success `navigate("/", { replace: true })`.
- `src/components/auth/SignupForm.tsx` — email/password/confirm form; client-side password-match check; on success navigates into the app (auto-confirm, no email step).
- `src/components/auth/ProtectedRoute.tsx` — spinner while `loading`; `<Navigate to="/login">` when no `user`; else `<Outlet/>`.
- `src/pages/LoginPage.tsx` / `src/pages/SignupPage.tsx` — page shells wrapping the forms.
- `src/main.tsx` — mounts `<AuthProvider>` around the router.

## Data layer — migrations, RLS, auth

**RLS / isolation.** Each per-user table (`platforms`, `holdings`, `transactions`, `snapshots`, `intraday_snapshots`) has four `auth.uid() = user_id` policies (`select`/`insert`/`update`/`delete`). `assets` now follows the **shared-read** pattern instead: a single `SELECT … TO authenticated USING (true)` so every authenticated user reads the whole catalog, plus INSERT/UPDATE/DELETE policies gated to the hardcoded admin uuid (`auth.uid() = '201091b3-6381-48f2-860b-4947fac09c69'`) — no longer `auth.uid() = user_id` (see migration `20260610000000_global_asset_catalog.sql`). `price_cache`, `exchange_rates`, `benchmark_prices` have a single `SELECT … TO authenticated USING (true)` and **no** write policy — service-role writes (edge functions) bypass RLS. `signup_allowlist` has RLS enabled and **zero** policies, so only the service role and `SECURITY DEFINER` functions can touch it.

**Signup gate.** `public.enforce_signup_allowlist()` (`SECURITY DEFINER`, `SET search_path = public`) runs as a `BEFORE INSERT` trigger on `auth.users`: it raises if `email` is null, or if `LOWER(NEW.email)` is not in `signup_allowlist`, rolling back the insert. Because it's a DB trigger it can't be bypassed from the client. The Supabase Auth "Allow new users to sign up" provider toggle stays **on** — gating lives in the trigger, not the provider. Operator workflow (Studio → SQL Editor): `INSERT INTO public.signup_allowlist (email, note) VALUES (LOWER('x@y.com'), 'who');` / `DELETE …` / `SELECT email, added_at, note …`.

- **Grandfathering** ran in the *original* allowlist migration (before consolidation), which inserted every then-existing `auth.users` email with a "pre-existing user" note. The consolidated `init.sql` ships an **empty** `signup_allowlist` — a fresh-from-baseline DB has no grandfathered rows, which is correct (nothing pre-exists). The live DB retains its grandfathered rows.
- **Error UX gotcha.** Supabase surfaces the trigger exception as a generic `Database error saving new user`, not a clean allowlist message. To improve: swap the trigger for a "Before User Created" Auth Hook and shape the error JSON (the Auth Hook needs dashboard configuration; the trigger does not).

**Seeding.** `public.seed_user_data(p_user_id uuid)` (`SECURITY DEFINER`, guarded by `IF p_user_id IS DISTINCT FROM auth.uid() THEN RAISE`) inserts the defaults. **Current authoritative body is in `20260610000000_global_asset_catalog.sql`** (it `CREATE OR REPLACE`s the `20260601000000_…` version). It now seeds **8 platforms only** (IBKR, Midas, Midas Kripto, Paribu, OKX, Binance, Enpara, Fiziksel) and **no assets** — assets are the single global catalog every user already shares, so they are not re-seeded per user. Execute is revoked from `PUBLIC`, granted to `authenticated`. Called from `AuthContext.signUp` post-signup. (The earlier `20260601000000_…` body also seeded 13 assets: 3 fiat (TRY/USD/EUR, `is_currency=true`), 2 stablecoins (USDT/USDC), 2 major crypto (BTC/ETH), 2 tokenized gold (PAXG/XAUT), 1 physical gold (XAU_GRAM), 3 US stocks (AAPL/QQQ/BRK-B) — that asset seeding is now historical.)

**Auth flow.** `supabase.auth.signInWithPassword` / `signUp` / `signOut`; session restored via `getSession()` and tracked via `onAuthStateChange`. Local Supabase runs with **auto-confirm**, so signup logs the user straight in (no email step) — production may differ.

## Notes & gotchas

- **New users get 0 assets, not 13.** Since `20260610000000_…`, `seed_user_data` seeds **8 platforms and no assets** — every user reads the shared global asset catalog instead. The historical 13-asset seed body (3 fiat, 2 stablecoins, 2 crypto, 2 tokenized gold, 1 physical gold, 3 US stocks) lived in `20260601000000_…` (and `init.sql`/README at various points said 13 or a stale "16"); that asset seeding is pre-`20260610…` history. Treat `20260610000000_…`, not `init.sql` or `20260601000000_…`, as the source of truth for the seed.
- **Multiple seed definitions exist.** `init.sql` defines `seed_user_data` (CoinGecko-era, 13 assets), `20260601000000_…` `CREATE OR REPLACE`s it (Yahoo-era, 13 assets), and `20260610000000_…` `CREATE OR REPLACE`s it again (platforms-only). Last-applied wins; only edit the latest. The old doc's per-table migration filenames (`20260402100001_…` etc.) and `seed.sql` no longer exist — they were folded into `init.sql`.
- **Session identity guard (both paths).** `AuthContext` routes `getSession()` *and* `onAuthStateChange` through one `applySession` that bails out of `setUser`/`setSession` when `access_token` / `user.id` are unchanged. Two hazards need this: (1) on mount `getSession()` and `onAuthStateChange`'s `INITIAL_SESSION` race — whichever lands second carries the same id but a fresh object reference, and an unguarded set flips `user` a second time, firing every `[user]` effect twice (two identical `fetchTransactionsForAllAssets` calls, doubled snapshot/holdings loads); (2) `TOKEN_REFRESHED` on tab-focus return swaps the reference the same way. The earlier code guarded only `onAuthStateChange` and left `getSession`'s `setUser` unguarded — that gap caused the duplicate mount fetches. Keep both paths guarded.
- **Numeric-as-string.** `numeric` columns are written as `BigNumber.toFixed()` strings (see `*Insert` types); reads come back as JS `number` via supabase-js. Don't "simplify" inserts to raw numbers.
- **Hand-written types drift risk.** `src/types/database.ts` is not generated; any column change in a migration must be mirrored there by hand.
- **`bulk_insert_transactions` mirrors TS logic.** Its add/subtract balance sets and cash-pairing rules duplicate `src/lib/balance.ts` / `src/lib/cash.ts` / `src/lib/constants/transaction-types.ts`. If those constants change, update the RPC in lock-step (it is `SECURITY INVOKER`, so RLS protects the writes).

## Setup / commands

> Read-only doc; commands listed for reference — this build pushes to prod (commit → push → test live), there is no local dev server in the normal loop.

- Apply migrations to the linked project: `supabase db push` (or the Supabase MCP `apply_migration`). Migrations are append-only — never edit an applied file; add a new timestamped one.
- Env (set in `.env.local` for any local run, and in the Vercel project for prod): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. Missing either → the client throws at startup by design.
- Onboard a user: add their email to `public.signup_allowlist` (SQL Editor / Table Editor), then share the prod URL; they sign up and are auto-seeded.
- Local stack with auto-confirm: `supabase start` (auth auto-confirms; no email setup needed).
