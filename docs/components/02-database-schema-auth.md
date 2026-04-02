# Component 2: Database Schema & Auth

## Overview
Create all SQL migrations for the database tables defined in the PRD (platforms, assets, transactions, price_cache, snapshots, exchange_rates). Set up Row-Level Security (RLS) policies. Generate TypeScript types from the schema. Build login and signup pages against local Supabase Auth.

## Dependencies
- Component 1 (Project Setup)

## File Structure
```
supabase/
├── migrations/
│   ├── 00001_create_enums.sql
│   ├── 00002_create_platforms.sql
│   ├── 00003_create_assets.sql
│   ├── 00004_create_transactions.sql
│   ├── 00005_create_price_cache.sql
│   ├── 00006_create_snapshots.sql
│   ├── 00007_create_exchange_rates.sql
│   └── 00008_create_rls_policies.sql
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
│   ├── LoginPage.tsx                   # Updated with real form
│   └── SignupPage.tsx                  # Updated with real form
```

## Tasks
1. **Enums migration** (`00001`): `asset_category` (fiat, crypto, stock_bist, stock_us, commodity) and `transaction_type` (buy, sell, transfer_in, transfer_out, dividend, interest, fee)
2. **Platforms table** (`00002`): id (uuid PK), user_id (FK auth.users), name, color (default '#6366f1'), created_at. Index on user_id
3. **Assets table** (`00003`): All columns per PRD 6.2. category uses enum. balance defaults to 0. Index on (user_id, platform_id) and ticker
4. **Transactions table** (`00004`): All columns per PRD 6.3. type uses enum. Index on (user_id, asset_id, date) and (user_id, date)
5. **Price cache table** (`00005`): ticker (PK), price_usd, price_try, source, updated_at. No user_id (global)
6. **Snapshots table** (`00006`): Per PRD 6.5. breakdown is jsonb. Unique constraint on (user_id, snapshot_date)
7. **Exchange rates table** (`00007`): Per PRD 6.6. Composite PK on (date, source)
8. **RLS policies** (`00008`): Enable RLS on all tables. User-owned tables: SELECT/INSERT/UPDATE/DELETE where `auth.uid() = user_id`. price_cache + exchange_rates: authenticated read-only, service role for writes
9. **TypeScript types**: Create `src/types/database.ts` (generate with `npx supabase gen types typescript --local` or write manually). Interfaces: Platform, Asset, Transaction, PriceCache, Snapshot, ExchangeRate, SnapshotBreakdown. Union types: AssetCategory, TransactionType
10. **AuthContext**: On mount restore session via `getSession()`. Subscribe to `onAuthStateChange()`. Expose user, session, loading, signIn, signUp, signOut
11. **useAuth hook**: `useContext(AuthContext)` wrapper
12. **ProtectedRoute**: If loading show spinner. If no user redirect to `/login`. Otherwise render `<Outlet />`
13. **LoginForm**: shadcn Input + Button + Label + Card. Email/password. Calls signIn(). Error display. Link to signup
14. **SignupForm**: Same structure. Calls signUp(). Auto-login for local dev
15. **Wire auth into App.tsx**: Wrap in `<AuthProvider>`. Public routes for login/signup. Protected routes via `<ProtectedRoute>` wrapping `<AppLayout>`
16. **Seed data** (`seed.sql`): Default platforms (IBKR, Midas, Paribu, OKX, Ziraat, etc.)
17. **Run migrations**: `npx supabase db reset`
18. **Auto-confirm for local dev**: In `supabase/config.toml`, enable auto-confirm so signups work without email

## Database
| Table | Key Details |
|-------|------------|
| platforms | user-owned, simple CRUD |
| assets | user-owned, FK to platforms, category enum |
| transactions | user-owned, FK to assets, type enum, related_asset_id for transfers |
| price_cache | global, ticker PK, service-role writes |
| snapshots | user-owned, unique (user_id, snapshot_date), jsonb breakdown |
| exchange_rates | global, composite PK (date, source) |

## Key Decisions
- **Migration numbering**: Sequential `00001_` prefixes for deterministic ordering
- **RLS on price_cache**: All authenticated read, service role write only
- **Auto-confirm for local**: No email setup needed locally. Switch to email confirmation in production
- **No generated columns for total_cost**: App computes `amount * unit_price` before insert (more flexible)
- **TypeScript types**: Generate once, maintain manually. Regenerate if schema changes

## Acceptance Criteria
- [ ] `npx supabase db reset` runs all migrations without errors
- [ ] Supabase Studio (localhost:54323) shows all 6 tables with correct columns
- [ ] RLS is enabled on all tables
- [ ] Signup on `/signup` creates a user and redirects to dashboard
- [ ] Login on `/login` authenticates and redirects to dashboard
- [ ] Visiting `/` without auth redirects to `/login`
- [ ] Page refresh maintains the session
- [ ] TypeScript types match the DB schema
