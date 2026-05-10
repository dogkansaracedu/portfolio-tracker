# Portfolio Tracker

Personal multi-platform portfolio tracker — see total net worth in USD and TRY across IBKR, Midas, Paribu, OKX, banks, and physical assets in one dashboard. FIFO P&L, daily auto-snapshots, allocation breakdown, performance over time.

Solo project. React + Vite + Supabase. PWA-friendly so it works on mobile.

See [PRD.md](./PRD.md) for the product requirements; design notes live in [`docs/`](./docs/).

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | React 19, Vite 8, Tailwind 4, shadcn/ui, Recharts |
| Backend | Supabase (Postgres, Auth, Edge Functions, pg_cron) |
| Routing | React Router 7 |
| Math | BigNumber.js (decimal-safe — never JS Number for money/quantities) |
| State | React Context + hooks (no Zustand) |

## Prerequisites

- **Node.js** 20+
- **Docker Desktop** (running) — Supabase local stack runs in containers
- **Supabase CLI** — `brew install supabase/tap/supabase`

## Quick start

```bash
make install         # one-time: npm install
make supabase-start  # bring up local Supabase (first run pulls images, ~few minutes)
make env-template    # write .env.local from supabase status (one-time)
make dev             # everything: ensures Supabase is up, then starts Vite
```

Open http://localhost:5173. Sign up with any email / password (local auth doesn't require email confirmation). The signup flow auto-seeds default platforms and global assets via [`seed_user_data`](./supabase/migrations/20260402100010_seed_function.sql).

The Supabase Studio for the local DB lives at http://localhost:54323.

## All make targets

```
make help            # list all targets
make dev             # full dev bootstrap (Supabase + Vite)
make build           # production build (typecheck + bundle)
make typecheck       # tsc --noEmit
make lint            # eslint
make preview         # serve the built bundle

make supabase-start  # start local Supabase
make supabase-stop   # stop local Supabase
make supabase-status # show URLs + keys
make supabase-reset  # drop DB, re-run migrations, apply seed.sql
make functions-serve # serve Edge Functions with hot reload (separate terminal)
make env-template    # regenerate .env.local from current supabase status

make clean           # stop Supabase + remove dist/
```

## Project layout

```
src/
  components/        # UI components (dashboard, portfolio, transactions, …)
  contexts/          # AuthContext, DisplayContext, TransactionContext
  hooks/             # useDashboard, usePnL, useHoldings, useDashboardHero, …
  lib/
    config.ts        # BigNumber config + helpers (bn, BN_ZERO, …)
    pnl/             # FIFO cost basis engine
    queries/         # Supabase query wrappers (one file per table)
    performance.ts   # Time-series & range delta logic
    balance.ts       # Holding balance recalculation
  pages/             # DashboardPage, PortfolioPage, …
  types/             # database.ts hand-written DB types

supabase/
  migrations/        # Schema (run in order; immutable once shipped)
  functions/         # Edge Functions (Deno) — fetch-prices, take-snapshots, backfill-snapshots, …
  seed.sql           # Local-only seed (applied on `supabase db reset`)
  config.toml        # Supabase CLI config (verify_jwt, auth, etc.)

docs/
  budget-feature-plan.md             # Brainstorm/plan for the future budget feature
  components/                        # Per-component product specs (build order, tasks, status)
```

## Environment variables

`.env.local` is gitignored. Two values are needed:

```
VITE_SUPABASE_URL=...      # http://127.0.0.1:54321 for local
VITE_SUPABASE_ANON_KEY=... # printed by `supabase status` (or `make env-template`)
```

For a deployed environment, point these at your hosted Supabase project.

## Daily snapshot cron

A pg_cron job (`daily-portfolio-snapshot`) calls the `take-snapshots` Edge Function every day at 23:55 UTC. The function chains after `fetch-prices` so price cache and exchange rates are fresh before snapshotting. See [`supabase/migrations/20260502120100_daily_snapshot_cron.sql`](./supabase/migrations/20260502120100_daily_snapshot_cron.sql).

For historical backfill (one-shot, on demand), use **Settings → Snapshots → Run backfill**, which invokes the `backfill-snapshots` Edge Function. Density: daily for the last 30 days, weekly for everything older (configured in [`supabase/functions/backfill-snapshots/index.ts`](./supabase/functions/backfill-snapshots/index.ts)).

## Production deploy (Vercel + Supabase Cloud)

The project ships with no GitHub integration — frontend deploys via the Vercel CLI directly from your machine, backend via the Supabase CLI.

### One-time setup

**Backend (Supabase Cloud):**
```bash
supabase login
supabase link --project-ref <ref>
supabase db push                                       # apply all migrations
supabase secrets set CRON_TOKEN=$(openssl rand -hex 32)
supabase secrets set ALLOWED_ORIGINS="https://<vercel-url>"
for fn in backfill-snapshots fetch-coingecko fetch-historical-rate \
          fetch-prices fetch-tcmb fetch-yahoo take-snapshots; do
  supabase functions deploy $fn
done
```

Then in the Supabase Dashboard SQL Editor (one-time), seed the cron's secrets into Postgres Vault:
```sql
SELECT vault.create_secret(
  '<same CRON_TOKEN value>', 'cron_token',
  'X-Cron-Token for take-snapshots');

SELECT vault.create_secret(
  'https://<ref>.supabase.co/functions/v1', 'functions_url',
  'Edge Functions base URL for cron callbacks');
```

The cron migration reads both via `vault.decrypted_secrets`. `ALTER DATABASE ... SET app.*` is not allowed on Supabase Cloud — Vault is the supported path for runtime config that Postgres needs to read.

**Frontend (Vercel):**
```bash
npm i -g vercel
export VERCEL_TOKEN=<personal-access-token>            # avoids `vercel login` hostname bugs
vercel env add VITE_SUPABASE_URL production            # paste https://<ref>.supabase.co
vercel env add VITE_SUPABASE_ANON_KEY production       # paste anon JWT from Settings → API
vercel deploy --prod --yes
```

`vercel.json` rewrites all paths to `/` (SPA fallback) — required for client-side React Router.

### Subsequent deploys

```bash
npm run deploy            # = npm run build && vercel --prod
```

Backend changes ship via `supabase db push` (migrations) or `supabase functions deploy <name>` (edge functions).

### Secrets summary

| Where | What | Used by |
|---|---|---|
| `.env.production.local` (gitignored, local only) | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Local prod-mode build verification |
| Vercel project env (production) | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Cloud build |
| Supabase function secrets | `CRON_TOKEN`, `ALLOWED_ORIGINS` | Edge functions runtime |
| Supabase Vault (`vault.secrets`) | `cron_token`, `functions_url` | pg_cron job (Postgres-side) |

The token must match between Edge Function env and Vault — the function rejects requests where `req.headers.get('X-Cron-Token') !== Deno.env.get('CRON_TOKEN')`, and the cron job sends whatever's in the Vault row.

### Token rotation

Six-month hygiene:
```bash
NEW=$(openssl rand -hex 32)
supabase secrets set CRON_TOKEN=$NEW
# Then SQL Editor: UPDATE vault.secrets SET secret = '<NEW>' WHERE name = 'cron_token';
supabase functions deploy take-snapshots
```

### Onboarding a new user (signup allowlist)

Signup is gated by `public.signup_allowlist`. Leave the Supabase Auth provider toggle "Allow new users to sign up" **on** — gating happens at the database trigger, not at the provider level.

To onboard a new person:
1. **Supabase Dashboard → SQL Editor**:
   ```sql
   INSERT INTO public.signup_allowlist (email, note)
   VALUES (LOWER('person@example.com'), 'who they are');
   ```
   (Or use Table Editor → `signup_allowlist` → Insert row.)
2. Share the production URL. They sign up with the email you allowlisted.
3. The signup-trigger seeds their default platforms and assets automatically (Component 2 → seed function).

To revoke (blocks *future* signups; does not delete an existing account):
```sql
DELETE FROM public.signup_allowlist WHERE email = LOWER('person@example.com');
```

To list:
```sql
SELECT email, added_at, note FROM public.signup_allowlist ORDER BY added_at;
```

When the allowlist migration was first applied, every then-existing `auth.users` email was auto-grandfathered, so the live accounts at the time were not locked out.

### Common deploy snags

- **`vercel login` HTTP header error** on macOS with non-ASCII hostname → use a personal access token (`vercel.com/account/tokens`) and `export VERCEL_TOKEN=...` to bypass interactive login.
- **`supabaseUrl is required` after first deploy** → env vars not set in Vercel. `vercel env add` then redeploy.
- **`404 NOT_FOUND` on `/login`, `/portfolio`** → `vercel.json` SPA rewrite missing.
- **`ERROR: 42501: permission denied to set parameter "app.*"`** in Supabase Cloud SQL Editor → use Vault, not `ALTER ROLE/DATABASE SET`.
- **`Database error saving new user`** on signup → the email isn't on `public.signup_allowlist`. Add it via SQL Editor and retry.

## Conventions

- All money / quantity math goes through **BigNumber.js**. Never `Number()` on an amount. Numeric DB columns are written as `BigNumber.toFixed()` strings to preserve precision.
- UI strings are **English**. Translate any Turkish copy you touch.
- No tests. Stay disciplined about types and small functions instead.
- Keep migrations append-only — never edit a shipped migration.

## Status

MVP ~90% complete. See [PRD §16](./PRD.md#16-mvp-scope-summary) for the feature matrix. Known gaps: PWA service worker, CSV import/export, manual "snapshot now" button.
