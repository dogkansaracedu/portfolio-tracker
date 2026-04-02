# Component Specs

Detailed specs for each high-level component of the Portfolio Tracker app.
Build in order — each component builds on the previous ones.

| # | Component | Spec | Status |
|---|-----------|------|--------|
| 1 | [Project Setup](01-project-setup.md) | Vite + React + Tailwind + shadcn/ui + Supabase local + layout shell | Done |
| 2 | [Database Schema & Auth](02-database-schema-auth.md) | SQL migrations, RLS, TypeScript types, login/signup | Done |
| 3 | [Platform & Asset Management](03-platform-asset-management.md) | CRUD for platforms and assets | Done |
| 4 | [Transaction System](04-transaction-system.md) | Add/edit transactions, balance recalculation, transfers | Done |
| 5 | [Price Engine](05-price-engine.md) | TCMB + CoinGecko + Yahoo fetching, price cache, manual entry | Done |
| 6 | [P&L Engine](06-pnl-engine.md) | FIFO cost basis, realized/unrealized P&L, currency normalization | Done |
| 7 | [Dashboard](07-dashboard.md) | Net worth, allocation chart, platform breakdown, top movers | Done |
| 8 | [Portfolio Page](08-portfolio-page.md) | Grouped asset table, search/filter, P&L columns | Done |
| 9 | [Transactions Page](09-transactions-page.md) | Transaction log, filters, realized P&L display | Done |
| 10 | [Snapshots & Performance](10-snapshots-performance.md) | Manual snapshots, performance charts, metrics | Done |
| 11 | [Settings & Data Portability](11-settings-data-portability.md) | Export/import, preferences, pg_cron, dark mode | Partial (no CSV import/export, no pg_cron) |

## Dependency Graph

```
1 → 2 → 3 → 4
         ↓       ↘
         5         6 (needs 4 + 5)
         ↓       ↙ ↓
         7 (needs 3 + 5 + 6)
         8 (needs 3 + 5 + 6)
         9 (needs 4 + 6)
         10 (needs 5 + 6 + 7)
         11 (needs all)
```

## Tech Stack Summary

- **Frontend**: React 19 + Vite 8 + TypeScript 5.9 + Tailwind 4 + shadcn/ui
- **Charts**: Recharts 3
- **Financial Math**: BigNumber.js (all money/quantity operations)
- **State**: React Context (Auth, Display, Transaction) + hooks
- **Router**: React Router v7
- **Database**: Supabase (PostgreSQL via Docker, 11 migrations)
- **Auth**: Supabase Auth (email/password, auto-confirm in local)
- **Edge Functions**: Supabase Edge Functions (Deno) — fetch-prices, fetch-tcmb, fetch-coingecko, fetch-yahoo
- **No testing for MVP**

## Implementation Notes

- **Assets are global** (one per ticker per user), with `holdings` table for per-platform balances
- **Category** is free-form text (not enum): `fiat`, `crypto`, `gold`, `stock_us`, `stock_bist`, `vehicle`, etc.
- **Tags** array for cross-cutting allocation (e.g., stablecoins: `['crypto','usd']`)
- **price_source** field on assets determines which API fetches the price: `tcmb`, `coingecko`, `yahoo`, `manual`
- **Seed function** (`seed_user_data`) auto-creates 8 platforms + 16 assets on signup
