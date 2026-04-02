# Component Specs

Detailed specs for each high-level component of the Portfolio Tracker app.
Build in order — each component builds on the previous ones.

| # | Component | Spec | Status |
|---|-----------|------|--------|
| 1 | [Project Setup](01-project-setup.md) | Vite + React + Tailwind + shadcn/ui + Supabase local + layout shell | Not started |
| 2 | [Database Schema & Auth](02-database-schema-auth.md) | SQL migrations, RLS, TypeScript types, login/signup | Not started |
| 3 | [Platform & Asset Management](03-platform-asset-management.md) | CRUD for platforms and assets | Not started |
| 4 | [Transaction System](04-transaction-system.md) | Add/edit transactions, balance recalculation, transfers | Not started |
| 5 | [Price Engine](05-price-engine.md) | TCMB + CoinGecko + Yahoo fetching, price cache, manual entry | Not started |
| 6 | [P&L Engine](06-pnl-engine.md) | FIFO cost basis, realized/unrealized P&L, currency normalization | Not started |
| 7 | [Dashboard](07-dashboard.md) | Net worth, allocation chart, platform breakdown, top movers | Not started |
| 8 | [Portfolio Page](08-portfolio-page.md) | Grouped asset table, search/filter, P&L columns | Not started |
| 9 | [Transactions Page](09-transactions-page.md) | Transaction log, filters, realized P&L display | Not started |
| 10 | [Snapshots & Performance](10-snapshots-performance.md) | Manual snapshots, performance charts, metrics | Not started |
| 11 | [Settings & Data Portability](11-settings-data-portability.md) | Export/import, preferences, pg_cron, dark mode | Not started |

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

- **Frontend**: React + Vite + TypeScript + Tailwind + shadcn/ui (New York, Zinc)
- **Charts**: Recharts
- **State**: React Context + hooks
- **Router**: React Router v7
- **Database**: Local Supabase (PostgreSQL via Docker)
- **Auth**: Supabase Auth (local, auto-confirm)
- **Edge Functions**: Supabase Edge Functions (Deno) — local
- **No testing for MVP**
