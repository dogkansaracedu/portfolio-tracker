-- Flip `assets` from per-user isolation to a single global, admin-managed
-- catalog. Admin: imarooddy@gmail.com (201091b3-6381-48f2-860b-4947fac09c69).
-- Platforms stay per-user. Admin's holdings/transactions are untouched.

-- 1. Wipe non-admin portfolio data. Only the admin's assets form the global
--    catalog; the one other account holds junk test data (a car logged as a
--    US stock). Delete its transactions + holdings + asset rows. Per-user
--    platforms are intentionally kept. (Order is explicit, not relying on the
--    ON DELETE CASCADE from holdings/transactions -> assets.)
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
