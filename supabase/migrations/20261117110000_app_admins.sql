-- Admin rights come from a table instead of a user id written into the code.
--
-- 20260610000000_global_asset_catalog.sql gated the asset catalog writes on
-- a literal user id. Same rule here, but the admin is a row in
-- public.app_admins and the policies ask public.is_admin(). Policy names,
-- commands and roles are unchanged.

-- 1. Who is an admin. Readable only for your own row; no write policies, so
--    rows are added by migrations or the service role, never through the API.
create table public.app_admins (
  user_id uuid primary key references auth.users on delete cascade
);

alter table public.app_admins enable row level security;

create policy app_admins_select_own on public.app_admins
  for select to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.app_admins from anon, authenticated;
grant select on table public.app_admins to authenticated;

-- 2. The check every admin-gated policy and the UI use. SECURITY DEFINER so
--    it can read app_admins regardless of the caller's RLS.
create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.app_admins where user_id = (select auth.uid())
  );
$$;

revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- 3. Seed the existing admin from data only the admin could have written.
--    Since 20260610000000 every assets row belongs to the admin: that
--    migration deleted every row whose owner was not the admin (user_id is
--    NOT NULL), its write policies admit only the admin, the app always sets
--    user_id to the signed-in user and never changes it, no later migration
--    writes assets, and the edge functions only read it. So the catalog's
--    owners are exactly {admin}. If that ever stopped holding, refuse rather
--    than guess: the migration fails and the old policies stay in place.
--    On an empty database (fresh local reset) this inserts nothing.
do $$
declare
  owner_count integer;
begin
  select count(distinct user_id) into owner_count from public.assets;
  if owner_count > 1 then
    raise exception
      'app_admins seed: public.assets has % distinct owners, expected at most 1',
      owner_count;
  end if;

  insert into public.app_admins (user_id)
  select distinct user_id from public.assets
  on conflict (user_id) do nothing;
end
$$;

-- 4. Asset catalog writes: same policies, admin check from the table.
drop policy if exists assets_insert on public.assets;
drop policy if exists assets_update on public.assets;
drop policy if exists assets_delete on public.assets;

create policy assets_insert on public.assets
  for insert to authenticated
  with check ((select public.is_admin()));

create policy assets_update on public.assets
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy assets_delete on public.assets
  for delete to authenticated
  using ((select public.is_admin()));
