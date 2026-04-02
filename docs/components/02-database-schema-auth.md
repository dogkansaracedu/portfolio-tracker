# Component 2: Database Schema & Auth

## Status: Done

## Overview
SQL migrations for all database tables. Row-Level Security (RLS) policies. TypeScript types. Login/signup pages with Supabase Auth. Seed function for default data on signup.

## Dependencies
- Component 1 (Project Setup)

## File Structure
```
supabase/
├── migrations/
│   ├── 20260402100001_create_enums.sql
│   ├── 20260402100002_create_platforms.sql
│   ├── 20260402100003_create_assets.sql
│   ├── 20260402100004_create_holdings.sql
│   ├── 20260402100005_create_transactions.sql
│   ├── 20260402100006_create_price_cache.sql
│   ├── 20260402100007_create_snapshots.sql
│   ├── 20260402100008_create_exchange_rates.sql
│   ├── 20260402100009_create_rls_policies.sql
│   ├── 20260402100010_seed_function.sql
│   └── 20260402100011_category_tags_refactor.sql
├── seed.sql
src/
├── types/
│   ├── index.ts
│   └── database.ts
├── contexts/
│   └── AuthContext.tsx
├── hooks/
│   └── useAuth.ts
├── components/
│   └── auth/
│       ├── ProtectedRoute.tsx
│       ├── LoginForm.tsx
│       └── SignupForm.tsx
├── pages/
│   ├── LoginPage.tsx
│   └── SignupPage.tsx
```

## Database Tables

| Table | Key Details |
|-------|------------|
| platforms | user-owned, simple CRUD, name + color |
| assets | user-owned, **global** (one per ticker per user), category (text), tags (text[]), price_source |
| holdings | user-owned, FK to assets + platforms, balance derived from transactions |
| transactions | user-owned, FK to assets + platforms, type enum, related_asset_id for transfers |
| price_cache | global, ticker PK, service-role writes |
| snapshots | user-owned, unique (user_id, snapshot_date), jsonb breakdown |
| exchange_rates | global, composite PK (date, source) |

## Key Schema Changes from Initial Design

1. **Assets are global**: No `platform_id` on assets. One asset per ticker per user. Platform-specific balances tracked in `holdings` table.
2. **Category refactored**: Changed from rigid `asset_category` enum to free-form text. Supports: `fiat`, `crypto`, `gold`, `stock_us`, `stock_bist`, `vehicle`, `commodity`, etc.
3. **Tags array**: `text[]` field for cross-cutting allocation (e.g., stablecoins: `['crypto','usd']`).
4. **price_source**: Added to assets to specify which API fetches the price: `tcmb`, `coingecko`, `yahoo`, `manual`.
5. **Seed function**: `seed_user_data(p_user_id)` creates 8 default platforms + 16 default assets on signup.

## Key Decisions
- **Migration naming**: Timestamp-based `20260402100XXX_` prefixes
- **RLS on price_cache**: All authenticated read, service role write only
- **Auto-confirm for local**: No email setup needed locally
- **No generated columns for total_cost**: App computes `amount * unit_price` before insert
- **BigNumber.js**: All financial math uses BigNumber for decimal precision
