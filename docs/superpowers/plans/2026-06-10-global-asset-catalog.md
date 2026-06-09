# Global Asset Catalog (admin-managed) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Flip the `assets` table from per-user isolation to a single global catalog that only the admin account (`imarooddy@gmail.com`) can write, while every user reads it; platforms stay per-user.

**Architecture:** Database RLS changes from `auth.uid() = user_id` (four policies) to global SELECT + admin-gated writes (hardcoded admin UUID). A one-time migration deletes other users' untouched seed-duplicate asset rows and stops `seed_user_data` from seeding assets. The frontend drops the per-user asset filter and gates the create/edit/deactivate controls behind a `useIsAdmin()` check that mirrors the same UUID.

**Tech Stack:** Supabase Postgres (RLS, plpgsql), React 19 + TypeScript + Vite, shadcn/ui, BigNumber.js (unaffected here).

**Testing approach (read before starting):** This project's automated test harness is Vitest **for the P&L engine only** (`computePortfolioPnL`). There is no component-test or RLS-test harness, and the iteration loop is *commit → push → test on live prod* (no local dev server) — see the project memory. Nothing in this plan touches the P&L engine, so there is **no TDD test file to write**. Verification here is: (1) `npm run build` must pass (the build gate catches `noUnusedLocals` etc. that `tsc --noEmit` misses), (2) SQL checks against the linked DB after the migration, (3) a manual prod UI checklist. Each task states its concrete verification.

**Ops note:** Per project convention, DB migration application and any prod deploy are **hand-held with the user one step at a time** — the plan prepares the migration/commands; it does not assume the agent applies migrations or runs `vercel --prod` unattended.

---

## File Structure

| File | Change | Responsibility |
|------|--------|----------------|
| `supabase/migrations/20260610000000_global_asset_catalog.sql` | **Create** | One-time: clean seed-duplicate rows, swap assets RLS to global-read/admin-write, reseed function (platforms only) |
| `src/lib/constants/admin.ts` | **Create** | Export `ADMIN_USER_ID` (mirrors the migration's UUID) |
| `src/hooks/useIsAdmin.ts` | **Create** | `useIsAdmin()` — true when signed-in user is the catalog admin |
| `src/lib/queries/assets.ts` | Modify | `fetchAssets()` returns the global catalog (drop `user_id` filter) |
| `src/contexts/AssetsContext.tsx` | Modify | Call `fetchAssets()` with no arg |
| `src/components/assets/AssetList.tsx` | Modify | Gate "Add Asset" behind `useIsAdmin()`; pass `canManage` to rows |
| `src/components/assets/AssetRow.tsx` | Modify | Accept `canManage`; gate the row actions menu |
| `docs/components/GLOSSARY.md` | Modify | Asset = global/admin-managed; add **Admin** term |
| `docs/components/02-database-schema-auth.md` + `technical/` | Modify | Assets RLS now global; `seed_user_data` seeds platforms only |
| `docs/components/03-platform-asset-management.md` + `technical/` | Modify | Assets are a global admin catalog; read-only for non-admins |

**The admin UUID** (`201091b3-6381-48f2-860b-4947fac09c69`, resolved in Task 1) is embedded directly in exactly **two** files: the migration (Task 2) and the constant (Task 4). No placeholder tokens remain.

---

### Task 1: Resolve the admin UUID — DONE

**Resolved (2026-06-10, via Supabase MCP):**
- Admin (`imarooddy@gmail.com`) `auth.users.id` = **`201091b3-6381-48f2-860b-4947fac09c69`**.
- Every `__ADMIN_UUID__` in this plan is now the literal `201091b3-6381-48f2-860b-4947fac09c69`.

**Data audit (informs Task 2's cleanup):**
- Admin owns 43 assets, 49 holdings, 394 transactions — the real portfolio → becomes the global catalog.
- A second account `935432ab-c6a2-4fd5-8ac5-9b3a4c91053e` has 14 seeded assets + **1 holding + 1 transaction** for a junk asset (`MiTo` / "Alfa Romeo MiTo", a car logged as `stock_us`; admin has no such ticker).
- **Decision:** wipe that account's portfolio data — delete its 1 transaction, 1 holding, and all 14 asset rows; **keep its per-user platforms**. Task 2's migration does this unconditionally for all non-admin users (not the earlier NOT-EXISTS guard, which would have spared the junk `MiTo` row and left a stray non-admin asset in the global catalog).

---

### Task 2: Write the migration (global catalog + reseed)

**Files:**
- Create: `supabase/migrations/20260610000000_global_asset_catalog.sql`

- [ ] **Step 1: Create the migration file**

Create `supabase/migrations/20260610000000_global_asset_catalog.sql` with exactly this content (admin UUID already embedded — `201091b3-6381-48f2-860b-4947fac09c69`):

```sql
-- Flip `assets` from per-user isolation to a single global, admin-managed
-- catalog. Admin: imarooddy@gmail.com (201091b3-6381-48f2-860b-4947fac09c69).
-- Platforms stay per-user. Admin's holdings/transactions are untouched.
-- (No explicit begin/commit — Supabase wraps each migration atomically, and
-- none of the project's other migrations use them.)

-- 1. Wipe non-admin portfolio data. Only the admin's assets form the global
--    catalog; the one other account holds junk test data (a car logged as a
--    US stock). Delete its transactions + holdings + asset rows. Per-user
--    platforms are intentionally kept. (Order is explicit, not relying on the
--    ON DELETE CASCADE from holdings/transactions → assets.)
delete from public.transactions where user_id <> '201091b3-6381-48f2-860b-4947fac09c69'::uuid;
delete from public.holdings     where user_id <> '201091b3-6381-48f2-860b-4947fac09c69'::uuid;
delete from public.assets       where user_id <> '201091b3-6381-48f2-860b-4947fac09c69'::uuid;

-- 2. Replace the four per-user RLS policies with global-read + admin-write.
drop policy if exists assets_select on public.assets;
drop policy if exists assets_insert on public.assets;
drop policy if exists assets_update on public.assets;
drop policy if exists assets_delete on public.assets;

create policy assets_select on public.assets
  for select to authenticated
  using (true);

create policy assets_insert on public.assets
  for insert to authenticated
  with check (auth.uid() = '201091b3-6381-48f2-860b-4947fac09c69'::uuid);

create policy assets_update on public.assets
  for update to authenticated
  using (auth.uid() = '201091b3-6381-48f2-860b-4947fac09c69'::uuid)
  with check (auth.uid() = '201091b3-6381-48f2-860b-4947fac09c69'::uuid);

create policy assets_delete on public.assets
  for delete to authenticated
  using (auth.uid() = '201091b3-6381-48f2-860b-4947fac09c69'::uuid);

-- 3. New users no longer get seeded assets (they read the global catalog).
--    Keep seeding the 8 per-user platforms. This CREATE OR REPLACE supersedes
--    the body in 20260601000000_stablecoin_yahoo_retarget.sql.
create or replace function public.seed_user_data(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is distinct from auth.uid() then
    raise exception 'cannot seed for another user';
  end if;

  insert into public.platforms (user_id, name, color) values
    (p_user_id, 'IBKR',          '#3b82f6'),
    (p_user_id, 'Midas',         '#8b5cf6'),
    (p_user_id, 'Midas Kripto',  '#f97316'),
    (p_user_id, 'Paribu',        '#06b6d4'),
    (p_user_id, 'OKX',           '#22c55e'),
    (p_user_id, 'Binance',       '#eab308'),
    (p_user_id, 'Enpara',        '#10b981'),
    (p_user_id, 'Fiziksel',      '#64748b');
end;
$$;

revoke execute on function public.seed_user_data(uuid) from public;
grant  execute on function public.seed_user_data(uuid) to authenticated;
```

- [ ] **Step 2: Sanity-check the file**

Run: `grep -c "201091b3-6381-48f2-860b-4947fac09c69" supabase/migrations/20260610000000_global_asset_catalog.sql`
Expected: `8` matching lines (1 comment + 3 delete predicates + 4 policy clauses). Also confirm no leftover token: `grep -c "__ADMIN_UUID__" …` → `0`.

- [ ] **Step 3: Commit the migration file** (apply is a separate, hand-held step in Task 3)

```bash
git add supabase/migrations/20260610000000_global_asset_catalog.sql
git commit -m "feat(db): global admin-managed asset catalog (RLS + reseed)"
```

---

### Task 3: Apply the migration + verify (hand-held with the user)

**Files:** none (DB operation).

- [ ] **Step 1: Apply the migration to the linked project**

Hand the user the command (do not run prod DB writes unattended):

```bash
supabase db push
```

(Or apply via the Supabase MCP `apply_migration` with the file's SQL.) Expected: the migration applies cleanly, no errors.

- [ ] **Step 2: Verify the policies are global + admin-gated**

Run in SQL Editor:

```sql
select policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'assets'
order by policyname;
```

Expected: `assets_select` has `qual = true`; `assets_insert/update/delete` reference the admin UUID in `with_check`/`qual`.

- [ ] **Step 3: Verify only the admin owns asset rows**

Run in SQL Editor:

```sql
select user_id, count(*) from public.assets group by user_id;
```

Expected: a single row — the admin UUID `201091b3-6381-48f2-860b-4947fac09c69` — with 43 assets. (Any other `user_id` means the non-admin wipe didn't run; investigate before proceeding.) Also confirm the junk data is gone: `select count(*) from public.transactions where user_id <> '201091b3-6381-48f2-860b-4947fac09c69'::uuid;` → `0`.

- [ ] **Step 4: Verify reseed seeds platforms only**

Run in SQL Editor:

```sql
select prosrc from pg_proc where proname = 'seed_user_data';
```

Expected: the body inserts into `platforms` only — no `insert into public.assets`.

---

### Task 4: Frontend — admin constant + `useIsAdmin` hook

**Files:**
- Create: `src/lib/constants/admin.ts`
- Create: `src/hooks/useIsAdmin.ts`

- [ ] **Step 1: Create the admin constant**

Create `src/lib/constants/admin.ts` (UUID already embedded):

```ts
/**
 * The single admin account that curates the global asset catalog. Asset
 * create / edit / deactivate is gated to this user in the UI (via useIsAdmin)
 * AND in the database (the assets RLS write policies check the same uuid). RLS
 * is the real enforcement; this constant only decides whether to render the
 * controls. Mirrors the uuid in migration
 * 20260610000000_global_asset_catalog.sql.
 */
export const ADMIN_USER_ID = "201091b3-6381-48f2-860b-4947fac09c69"
```

- [ ] **Step 2: Create the hook**

Create `src/hooks/useIsAdmin.ts`:

```ts
import { useAuth } from "@/hooks/useAuth"
import { ADMIN_USER_ID } from "@/lib/constants/admin"

/** True when the signed-in user is the catalog admin (can write assets). */
export function useIsAdmin(): boolean {
  const { user } = useAuth()
  return user?.id === ADMIN_USER_ID
}
```

- [ ] **Step 3: Verify the UUID is present**

Run: `grep -c "201091b3-6381-48f2-860b-4947fac09c69" src/lib/constants/admin.ts`
Expected: `1`.

- [ ] **Step 4: Build gate**

Run: `npm run build`
Expected: build succeeds (the new hook/constant are unused so far — `noUnusedLocals` is per-file for exports, so this passes; if the build flags an unused export, ignore until Task 6 wires it in, or proceed to Task 5/6 first then build).

- [ ] **Step 5: Commit**

```bash
git add src/lib/constants/admin.ts src/hooks/useIsAdmin.ts
git commit -m "feat(assets): ADMIN_USER_ID constant + useIsAdmin hook"
```

---

### Task 5: Frontend — `fetchAssets` returns the global catalog

**Files:**
- Modify: `src/lib/queries/assets.ts:4-13`
- Modify: `src/contexts/AssetsContext.tsx:47`

- [ ] **Step 1: Drop the `user_id` filter from `fetchAssets`**

In `src/lib/queries/assets.ts`, replace the current `fetchAssets`:

```ts
export async function fetchAssets(userId: string): Promise<Asset[]> {
  const { data, error } = await supabase
    .from("assets")
    .select("*")
    .eq("user_id", userId)
    .order("name")

  if (error) throw error
  return data ?? []
}
```

with:

```ts
export async function fetchAssets(): Promise<Asset[]> {
  const { data, error } = await supabase
    .from("assets")
    .select("*")
    .order("name")

  if (error) throw error
  return data ?? []
}
```

- [ ] **Step 2: Update the only call site**

In `src/contexts/AssetsContext.tsx`, the `refetch` callback (around line 47) currently reads:

```ts
      const data = await fetchAssets(user.id)
```

Change it to:

```ts
      const data = await fetchAssets()
```

Leave the `if (!user) return` guard at the top of `refetch` as-is — we still only fetch once signed in, and `refetch` stays in the `[user]` dependency so it re-runs on login.

- [ ] **Step 3: Build gate**

Run: `npm run build`
Expected: build succeeds. (If TypeScript flags `user` as now-unused in `refetch`, it is still used by the `if (!user) return` guard, so this passes.)

- [ ] **Step 4: Commit**

```bash
git add src/lib/queries/assets.ts src/contexts/AssetsContext.tsx
git commit -m "feat(assets): fetch the shared global catalog (drop per-user filter)"
```

---

### Task 6: Frontend — gate write controls behind admin

**Files:**
- Modify: `src/components/assets/AssetRow.tsx:24-31,94-119`
- Modify: `src/components/assets/AssetList.tsx`

- [ ] **Step 1: Add a `canManage` prop to `AssetRow`**

In `src/components/assets/AssetRow.tsx`, change the props interface and signature:

```ts
interface AssetRowProps {
  asset: Asset;
  prices: Record<string, PriceCache>;
  canManage: boolean;
  onEdit: (asset: Asset) => void;
  onDeactivate: (asset: Asset) => void;
}

export function AssetRow({ asset, prices, canManage, onEdit, onDeactivate }: AssetRowProps) {
```

- [ ] **Step 2: Gate the actions menu on `canManage`**

In the same file, change the actions cell condition from:

```tsx
        {asset.is_active && !asset.is_currency && (
```

to:

```tsx
        {canManage && asset.is_active && !asset.is_currency && (
```

- [ ] **Step 3: Wire `useIsAdmin` into `AssetList` and gate the Add button**

In `src/components/assets/AssetList.tsx`, add the import near the other hook imports:

```tsx
import { useIsAdmin } from "@/hooks/useIsAdmin";
```

Inside the component, just after the existing `usePrices()` line, add:

```tsx
  const isAdmin = useIsAdmin();
```

Replace the header's Add button block. Current:

```tsx
        <Button size="sm" onClick={openCreateForm}>
          <Plus className="size-4" />
          Add Asset
        </Button>
```

New:

```tsx
        {isAdmin && (
          <Button size="sm" onClick={openCreateForm}>
            <Plus className="size-4" />
            Add Asset
          </Button>
        )}
```

- [ ] **Step 4: Pass `canManage` to both `AssetRow` usages**

In `src/components/assets/AssetList.tsx`, both `<AssetRow ... />` blocks (the owned list and the not-held list) take the same props. Add `canManage={isAdmin}` to each. The owned-list one becomes:

```tsx
                <AssetRow
                  key={asset.id}
                  asset={asset}
                  prices={prices}
                  canManage={isAdmin}
                  onEdit={handleEdit}
                  onDeactivate={handleDeactivate}
                />
```

And the not-held one becomes:

```tsx
                  <AssetRow
                    key={asset.id}
                    asset={asset}
                    prices={prices}
                    canManage={isAdmin}
                    onEdit={handleEdit}
                    onDeactivate={handleDeactivate}
                  />
```

- [ ] **Step 5: Build gate**

Run: `npm run build`
Expected: build succeeds, no type errors (every `AssetRow` now receives the required `canManage` prop).

- [ ] **Step 6: Commit**

```bash
git add src/components/assets/AssetList.tsx src/components/assets/AssetRow.tsx
git commit -m "feat(assets): admin-only Add/Edit/Deactivate; read-only catalog for others"
```

---

### Task 7: Update component docs to match the shipped behavior

**Files:**
- Modify: `docs/components/GLOSSARY.md:20-30` (+ new Admin term)
- Modify: `docs/components/03-platform-asset-management.md`
- Modify: `docs/components/technical/03-platform-asset-management.md`
- Modify: `docs/components/02-database-schema-auth.md`
- Modify: `docs/components/technical/02-database-schema-auth.md`

- [ ] **Step 1: GLOSSARY — redefine Asset**

In `docs/components/GLOSSARY.md`, change the Asset entry's first sentence from:

```
A tradable or held thing, **global: one row per ticker per user** (no platform on
the asset itself — balances live on [Holdings](#holding)).
```

to:

```
A tradable or held thing, **global: one row per ticker, shared by every user and
curated by the [Admin](#admin)** (no platform on the asset itself — balances live
on [Holdings](#holding)). Non-admin users read the catalog read-only.
```

- [ ] **Step 2: GLOSSARY — add the Admin term**

In `docs/components/GLOSSARY.md`, under `## Terms`, add a new entry (place it right after the `### Allocation` block or anywhere alphabetical-ish in Terms):

```
### Admin
The single account that curates the global [Asset](#asset) catalog. Only the
admin can create / edit / deactivate assets; everyone else reads the catalog
read-only. Enforced in the database (the asset write RLS policies check a
hardcoded user id) and mirrored in the UI. Platforms are unaffected — they stay
per-user.
```

- [ ] **Step 3: Behavioral 03 — assets are global/admin-managed**

In `docs/components/03-platform-asset-management.md`:

Change the **Depends on** bullet from:

```
- Component 2 (data store & auth). All platforms and assets are scoped to the signed-in user.
```

to:

```
- Component 2 (data store & auth). Platforms are scoped to the signed-in user; assets are a single global catalog (one shared set for all users), writable only by the admin.
```

In the **Assets — CRUD** section, change the opening line from:

```
An asset is **global: one row per ticker per user** — it is not tied to a platform, and it carries no balance (see [Holding](GLOSSARY.md#holding)). Editable fields:
```

to:

```
An asset is **global: one shared row per ticker for all users**, curated by the [Admin](GLOSSARY.md#admin) — it is not tied to a platform, and it carries no balance (see [Holding](GLOSSARY.md#holding)). Only the admin can create/edit/deactivate; every other user sees the catalog **read-only**. Admin-editable fields:
```

Add a new subsection right after **Assets — CRUD** (before **Native price currency**):

```
### Roles & visibility
- **Admin** (a single designated account) sees the full create/edit/deactivate surface.
- **Every other user** sees the same catalog (prices, categories, icons, the held/not-held split) but **read-only**: no "Add Asset" action and no per-row actions menu. Their personal "held" state is still derived from their own holdings, so the split works per user.
- The catalog is enforced server-side (database write policies), so hiding the controls is convenience, not the security boundary.
```

In the **UI contract** → Assets bullet, append after the existing sentence about the actions menu:

```
The "Add Asset" action and the per-row actions menu are shown **only to the admin**; non-admin users get a read-only table.
```

Update the **Acceptance** list — append:

```
- [ ] As admin, adding/editing/deactivating an asset is reflected for every user; as a non-admin, the page is read-only (no Add button, no row actions) and a direct write is rejected by the database.
```

- [ ] **Step 4: Technical 03 — implementation notes**

In `docs/components/technical/03-platform-asset-management.md`:

Under **Assets** (the `AssetList.tsx` / `AssetRow.tsx` bullets), add that both gate write controls on `useIsAdmin()` (`src/hooks/useIsAdmin.ts`), which compares `useAuth().user?.id` to `ADMIN_USER_ID` (`src/lib/constants/admin.ts`); `AssetList` hides "Add Asset" and passes `canManage={isAdmin}` to each `AssetRow`, which hides its actions menu unless `canManage && is_active && !is_currency`.

In the **Data layer** section, update the `fetchAssets` description: it now selects the whole table ordered by name with **no `user_id` filter** (the catalog is global); the `AssetsContext.refetch` calls `fetchAssets()` with no argument.

Add to **Notes & gotchas**:

```
- **Assets are a global catalog, not per-user.** RLS on `assets` is `SELECT USING (true)` for all authenticated + INSERT/UPDATE/DELETE gated to the hardcoded admin uuid (migration `20260610000000_global_asset_catalog.sql`). `ADMIN_USER_ID` (`src/lib/constants/admin.ts`) mirrors that uuid for the UI gate — RLS is the real boundary, the UI gate is convenience. Platforms remain per-user.
```

- [ ] **Step 5: Behavioral + technical 02 — RLS & seeding**

In `docs/components/02-database-schema-auth.md` (behavioral): wherever it states every table is per-user isolated, note the exception — `assets` is a **global catalog** (all authenticated users read it; only the admin writes), while platforms/holdings/transactions stay per-user.

In `docs/components/technical/02-database-schema-auth.md`:
- In the **RLS / isolation** paragraph, add that `assets` now follows the shared-read pattern (`SELECT … USING (true)` for authenticated) with INSERT/UPDATE/DELETE gated to the hardcoded admin uuid (not `auth.uid() = user_id`).
- In the **Seeding** paragraph, update: `seed_user_data` now seeds **8 platforms only** (no assets — those are the global catalog). The authoritative body is now migration `20260610000000_global_asset_catalog.sql` (it `CREATE OR REPLACE`s the `20260601…` version).
- In the **Migrations** table, add a row for `20260610000000_global_asset_catalog.sql` — "Flips `assets` to a global admin-managed catalog: deletes other users' seed-duplicate asset rows, swaps assets RLS to global-read/admin-write, reseeds `seed_user_data` to platforms-only."
- In **Notes & gotchas**, fix the "13 assets" note: new users now get **0 assets** (global catalog) + 8 platforms; the 13-asset seed body is historical (pre-`20260610…`).

- [ ] **Step 6: Commit the docs**

```bash
git add docs/components/
git commit -m "docs(assets,db): global admin-managed asset catalog"
```

---

### Task 8: Final verification

**Files:** none.

- [ ] **Step 1: Build gate (whole app)**

Run: `npm run build`
Expected: succeeds with no type/lint errors.

- [ ] **Step 2: Deploy (hand-held)**

Prepare the prod deploy and hand the user the command per project convention (do not run `vercel --prod` unattended). Confirm the migration (Task 3) was applied **before or with** this deploy.

- [ ] **Step 3: Manual prod checklist — admin (imarooddy@gmail.com)**

  - Assets page shows "Add Asset" and per-row Edit/Deactivate menus.
  - Adding an asset succeeds and it appears in the list.

- [ ] **Step 4: Manual prod checklist — a non-admin user**

  - Assets page shows the **same** catalog (the admin's assets, prices, icons).
  - **No** "Add Asset" button; **no** per-row actions menu.
  - Currency assets (USD/EUR/TRY/USDT/USDC, XAU_GRAM) appear with no menu; stablecoins still group under USD in the portfolio.
  - A freshly signed-up user has 8 platforms and sees the full catalog (everything under "Not held" until they transact).

- [ ] **Step 5: Confirm docs match shipped behavior**

Re-read the touched docs (Task 7) against the final code; fix any drift. No silent divergence between code and docs (CLAUDE.md rule).

---

## Self-Review notes (author)

- **Spec coverage:** RLS flip (Task 2), migration/cleanup (Tasks 2–3), seeding change (Task 2), admin constant + `useIsAdmin` (Task 4), `fetchAssets` global (Task 5), UI gating (Task 6), docs (Task 7), acceptance (Task 8). All spec sections mapped.
- **Out-of-scope items** (remove `tags`, drop `assets.user_id`, new admin screens) are intentionally not tasked.
- **Type consistency:** `canManage` prop name is identical across `AssetRow` definition (Task 6 Step 1) and both `AssetList` usages (Task 6 Step 4); `ADMIN_USER_ID` / `useIsAdmin` names match between Task 4 and Tasks 6/7.
- **Placeholder:** none — the admin UUID was resolved in Task 1 and is embedded literally in the migration (Task 2) and constant (Task 4), with grep checks confirming its presence.
