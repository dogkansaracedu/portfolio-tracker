# Global Asset Catalog (admin-managed) — Design

> Date: 2026-06-10 · Status: approved, pending implementation plan

## Problem

Assets are currently **per-user**: every user gets their own copy of ~13 seeded
asset rows, isolated by RLS (`auth.uid() = user_id`). That means the asset
catalog can't be curated centrally — each user would have to re-create or
re-seed assets, and there's no single source of truth for "what assets exist."

We want the Assets page to behave like an **admin panel**: one admin account
(`imarooddy@gmail.com`) curates a single **global** asset catalog that every
user reads. Platforms stay per-user.

## Decisions (from brainstorming)

1. **Only the admin account has real data today**, so the migration is a simple
   promote-and-clean: the admin's existing asset rows *become* the global
   catalog; every other user's untouched seed duplicates are deleted.
2. **The entire asset row is global / admin-managed** — no per-user overlay
   table. `ticker`, `name`, `category`, `price_source`, `price_id`, `icon_url`,
   `is_currency`, `tags`, `at_source_tax_rate`, `is_active` are all shared.
   (`tags` is likely to be removed later; kept as a global field for now.)
3. **Admin identity is a hardcoded UUID** — baked into the migration's RLS
   policy and mirrored in a frontend constant. RLS enforces it server-side, so
   the UUID is not a secret. Adding another admin later = a new migration. The
   concrete UUID is resolved during implementation by looking up
   `imarooddy@gmail.com` in `auth.users` (the user supplies it, or we query the
   linked Supabase project) — it is *not* left as a literal placeholder in
   shipped code.
4. **Non-admins see a read-only catalog** — same asset list (prices,
   categories, icons), but no "Add Asset" button and no per-row edit/deactivate
   actions. The admin sees full CRUD, exactly as today.

## Scope: what changes

### 1. Data model & RLS — `assets` table

The table shape is unchanged. Only access control flips from per-user to global:

| Op | Old policy | New policy |
|----|-----------|------------|
| SELECT | `auth.uid() = user_id` | `USING (true)` TO `authenticated` (same pattern as `price_cache`) |
| INSERT | `auth.uid() = user_id` | `WITH CHECK (auth.uid() = '<ADMIN_UUID>')` |
| UPDATE | `auth.uid() = user_id` | `USING (auth.uid() = '<ADMIN_UUID>')` + matching `WITH CHECK` |
| DELETE | `auth.uid() = user_id` | `USING (auth.uid() = '<ADMIN_UUID>')` |

- `user_id` column **stays** (`NOT NULL`). It stops meaning "owner for
  isolation"; it now just records "who created the row," always the admin on new
  rows. `UNIQUE(user_id, ticker)` still prevents duplicate tickers in the
  catalog because every catalog row shares the admin's uid. No column drop →
  minimal churn. (Dropping `user_id` entirely is a future cleanup — see
  Out of Scope.)
- `holdings` and `transactions` are **untouched** — still per-user, still
  FK `asset_id → assets.id`. They now reference global asset rows.

The "hardcoded" currencies the user mentioned (USD / EUR / TRY / USDT / USDC,
and `XAU_GRAM` gram gold) require **no special handling**: they already exist
among the admin's seeded rows as `is_currency` / gold assets, so they're simply
always-present catalog entries. `is_currency` rows already render with no
edit/deactivate menu. The "stablecoins/funds under USD" nesting is the existing
tag-based grouping in the portfolio view, unchanged by this work.

### 2. One-time migration — `supabase/migrations/20260610000000_global_asset_catalog.sql`

1. **Clean duplicates:** delete asset rows where `user_id <> '<ADMIN_UUID>'`
   **and** the row is not referenced by any `holdings` or `transactions` row.
   The guard makes the delete safe even if the "only admin has data" assumption
   is slightly off — a referenced row is left in place rather than cascade-
   deleting someone's history.
2. **Swap policies:** drop the four old `assets_*` policies; create the new
   SELECT-all + admin-gated write policies above.
3. **Reseed function:** `CREATE OR REPLACE seed_user_data` per §3.

The admin's existing asset rows are left as-is and become *the* catalog.

### 3. Seeding change — `seed_user_data(p_user_id)`

- **Keep** seeding the 8 platforms (platforms remain per-user).
- **Remove** the asset-insert block entirely — new users get no asset rows; they
  read the global catalog immediately.
- `AuthContext.signUp`'s `rpc("seed_user_data", …)` call is unchanged.

### 4. Frontend

- **New constant** `ADMIN_USER_ID` in `src/lib/constants/` (its own small module,
  e.g. `admin.ts`), plus a tiny `useIsAdmin()` derived from `useAuth()`
  (`user?.id === ADMIN_USER_ID`).
- **`fetchAssets()` (`src/lib/queries/assets.ts`):** drop the
  `.eq("user_id", userId)` filter so it returns the full catalog (RLS now scopes
  correctly). Update the `AssetsContext` call site (the `userId` argument is no
  longer needed for filtering).
- **`AssetList.tsx`:** hide the "Add Asset" button when `!isAdmin`.
- **`AssetRow.tsx`:** hide the per-row actions menu when `!isAdmin` (in addition
  to the existing `is_active` / `is_currency` conditions).
- **Held-vs-not split is unchanged** — still derived from the user's own
  holdings, so a brand-new user sees the full catalog with everything collapsed
  under "Not held" until they record a transaction.
- `createAsset` still sets `user_id: user.id`; for the admin that equals the
  admin UUID, so it stays consistent with the RLS `WITH CHECK`. No change.

### 5. Docs to update (in the same change)

- `docs/components/02-database-schema-auth.md` (+ `technical/`): assets RLS is now
  global SELECT + admin-gated writes; `seed_user_data` seeds platforms only; note
  the hardcoded admin UUID and the migration.
- `docs/components/03-platform-asset-management.md` (+ `technical/`): assets are a
  global, admin-managed catalog; read-only for non-admins; platforms stay
  per-user; the admin-gating of the Add button and row actions.
- `docs/components/GLOSSARY.md`: update **Asset** ("one global row per ticker,
  admin-managed; balances not stored here"); add an **Admin** term.

## Out of scope (explicitly not done)

- Removing the `tags` field — likely a later change; kept as a global field now
  because the portfolio grouping still reads it.
- Dropping the now-vestigial `assets.user_id` column.
- Any new admin-management screens beyond the existing CRUD surface.
- Changing platforms in any way (they remain per-user, still seeded).

## Acceptance

- [ ] As the admin, I can add / edit / deactivate an asset and it appears for
      every user.
- [ ] As a non-admin user, the Assets page shows the full catalog read-only — no
      "Add Asset" button, no per-row actions menu.
- [ ] A non-admin's `INSERT`/`UPDATE`/`DELETE` on `assets` is rejected by RLS
      (defense in depth behind the hidden UI).
- [ ] A newly signed-up user gets 8 platforms and zero new asset rows, yet sees
      the full global catalog.
- [ ] Existing admin holdings/transactions still resolve to their assets (no
      broken references); prices still display.
- [ ] The hardcoded currency assets (USD/EUR/TRY/USDT/USDC, XAU_GRAM) appear in
      the catalog with no edit menu, and stablecoins still group under USD in the
      portfolio.
- [ ] All touched component docs describe the code as shipped.
