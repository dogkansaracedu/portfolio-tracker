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
  budget-feature-plan.md           # Implementation plan for the budget feature
  project-review-2026-05-04.md     # Latest end-to-end review
  security-audit-2026-05-04.md     # Parking list of security gaps (deferred)
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

For historical backfill (one-shot, on demand), use **Settings → Snapshots → Run backfill**, which invokes the `backfill-snapshots` Edge Function.

## Conventions

- All money / quantity math goes through **BigNumber.js**. Never `Number()` on an amount. Numeric DB columns are written as `BigNumber.toFixed()` strings to preserve precision.
- UI strings are **English**. Translate any Turkish copy you touch.
- No tests. Stay disciplined about types and small functions instead.
- Keep migrations append-only — never edit a shipped migration.

## Status

MVP ~90% complete. See [PRD §16](./PRD.md#16-mvp-scope-summary) for the feature matrix. Known gaps: PWA service worker, CSV import/export, manual "snapshot now" button.
