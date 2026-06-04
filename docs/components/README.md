# Component Specs

Per-component documentation for the Portfolio Tracker app, in two layers plus a
shared glossary. The behavioral specs are the **tech-agnostic rebuild
contract** — enough to recreate the app on any stack; the technical docs record
how the current React/Vite/Supabase build satisfies that contract.

## How to read these docs

1. **[GLOSSARY.md](GLOSSARY.md)** — the shared domain model: entities (Asset,
   Holding, Transaction, Snapshot, …), terms (money-weighted, net invested, FIFO,
   daily return, …), and the canonical formulas. Defined once; everything links
   here.
2. **Behavioral spec** (`NN-name.md`) — *what any implementation must do*:
   behaviors, rules (with worked numeric examples for the math), data contracts,
   UI contracts, and tech-neutral acceptance criteria. No stack specifics.
3. **Technical doc** (`technical/NN-name.md`) — *how this build does it*:
   libraries, exact file paths, the data layer (Supabase tables / migrations /
   edge functions), and the non-obvious gotchas.

Each behavioral spec links to its technical doc and back. To rebuild on a
different stack, implement the behavioral specs + glossary and ignore `technical/`.

## Components

Build in order — each builds on the previous.

| # | Component | Behavioral | Technical | Status |
|---|-----------|-----------|-----------|--------|
| 1 | Project Setup | [spec](01-project-setup.md) | [tech](technical/01-project-setup.md) | Done |
| 2 | Database Schema & Auth | [spec](02-database-schema-auth.md) | [tech](technical/02-database-schema-auth.md) | Done |
| 3 | Platform & Asset Management | [spec](03-platform-asset-management.md) | [tech](technical/03-platform-asset-management.md) | Done |
| 4 | Transaction System | [spec](04-transaction-system.md) | [tech](technical/04-transaction-system.md) | Done |
| 5 | Price Engine | [spec](05-price-engine.md) | [tech](technical/05-price-engine.md) | Done |
| 6 | P&L Engine | [spec](06-pnl-engine.md) | [tech](technical/06-pnl-engine.md) | Done |
| 7 | Dashboard | [spec](07-dashboard.md) | [tech](technical/07-dashboard.md) | Done |
| 8 | Portfolio Page | [spec](08-portfolio-page.md) | [tech](technical/08-portfolio-page.md) | Done |
| 9 | Transactions Page | [spec](09-transactions-page.md) | [tech](technical/09-transactions-page.md) | Done |
| 10 | Snapshots & Performance | [spec](10-snapshots-performance.md) | [tech](technical/10-snapshots-performance.md) | Done |
| 11 | Settings & Data Portability | [spec](11-settings-data-portability.md) | [tech](technical/11-settings-data-portability.md) | Partial — import done (see Component 4), data **export** not built |

## Dependency graph

```
1  Project Setup        (foundation)
2  Database & Auth      → 1
3  Platform & Asset     → 2
4  Transaction System   → 3
5  Price Engine         → 3
6  P&L Engine           → 4, 5, 10        (computation, no UI)
7  Dashboard            → 5, 6, 10
8  Portfolio Page       → 5, 6, 10
9  Transactions Page    → 4, 6
10 Snapshots & Perf.    → 5, 6
11 Settings & Portability→ 3, 4, 10
```

(6 and 10 are mutually referential at runtime: snapshots store the values the P&L
engine reads as "current/previous," while the engine defines what a snapshot
freezes. Build 10's storage first, then 6's computation over it.)

## Tech stack (high level)

Detailed, per-component stack lives in each `technical/` doc. In summary:

- **Frontend:** React 19 + Vite 8 + TypeScript 5.9 + Tailwind 4 + shadcn/ui
  (`base-nova` style, `neutral` base, built on Base UI `@base-ui/react`) + Recharts
  (lazy-loaded).
- **Financial math:** BigNumber.js for *all* money/quantity; numeric DB columns
  written as `toFixed()` strings to preserve precision.
- **State:** React Context + hooks (no Zustand, no react-query). Shared server data
  flows through context providers, never per-call-site fetch-on-mount.
- **Routing:** React Router 7 (`BrowserRouter` + `Routes`); SPA, no SSR.
- **Theme:** custom `ThemeContext` + a pre-paint script in `index.html` (no
  wrong-theme flash). `next-themes` is present but only consumed by the toast
  component.
- **Backend:** Supabase — Postgres (+ RLS), Auth (email/password, allowlisted
  signup), Edge Functions (Deno), pg_cron.
- **Edge functions:** `fetch-prices` (consolidated price + FX orchestrator — no
  separate per-source functions), `fetch-historical-rate`, `fetch-benchmark-history`,
  `resolve-tickers`, `take-snapshots`, `backfill-snapshots`.
- **No tests** (by design) — discipline via types and small functions.

## Implementation notes

- **Assets are global** (one per ticker per user); per-platform balances live in
  `holdings`. See [GLOSSARY: Asset](GLOSSARY.md#asset) / [Holding](GLOSSARY.md#holding).
- **Category** is free-form text (not an enum): `fiat`, `crypto`, `gold`,
  `stock_us`, `stock_bist`, `vehicle`, … **Tags** are a cross-cutting array.
- **`price_source`** routes pricing (`yahoo`, `tcmb`, `manual`; `coingecko` is a
  dormant legacy value); **`price_id`** is the provider's fetch identifier
  (falls back to `ticker`).
- **Signup seeding** auto-creates **8 platforms + 13 global assets** for a new user.
- **P&L is money-weighted** (`value − net invested`, USD-anchored) — see
  [P&L Methodology](../pnl-methodology.md).
