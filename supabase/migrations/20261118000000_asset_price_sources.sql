-- Price sources per asset (admin-managed, prioritized, with fallback).
-- Design: docs/superpowers/specs/2026-11-17-price-sources-design.md
--
-- 1. `asset_price_sources` — each catalog asset's ordered list of
--    (source, symbol). fetch-prices walks it by priority; the first source that
--    yields a price wins. Each row keeps its own health (last ok / last error)
--    for the admin page. TCMB (fiat, XAU_GRAM) and manual assets get no rows:
--    the FX step keeps pricing them. `assets.price_source` / `price_id` stay —
--    `price_id ?? ticker` is still the price_cache key and `price_source` still
--    drives history backfill.
-- 2. An AFTER INSERT trigger on `assets` gives every new yahoo/tefas asset its
--    current source as priority 1, so existing create paths keep working.
-- 3. Seed for existing assets from generic rules (no symbols written here).
-- 4. `watchlist_items` points at a catalog asset (`asset_id`). The old per-row
--    pricing columns become nullable and unused; they are dropped later.

-- ─── 1. asset_price_sources ─────────────────────────────────────────

create table public.asset_price_sources (
  id            uuid primary key default gen_random_uuid(),
  asset_id      uuid not null references public.assets(id) on delete cascade,
  -- 1 = tried first. Deferred so a reorder can swap priorities in one tx.
  priority      smallint not null check (priority >= 1),
  source        text not null check (source in
                  ('paribu_crypto', 'paribu_us', 'paribu_bist', 'yahoo', 'tefas')),
  -- The source's own id (btc, brk.b, asels, BTC-USD, a TEFAS fund code).
  symbol        text not null check (char_length(symbol) between 1 and 32),
  last_ok_at    timestamptz,
  last_error    text,
  last_error_at timestamptz,
  created_at    timestamptz not null default now(),
  constraint asset_price_sources_asset_priority_key
    unique (asset_id, priority) deferrable initially deferred,
  constraint asset_price_sources_asset_source_symbol_key
    unique (asset_id, source, symbol)
);

comment on table public.asset_price_sources is
  'Ordered price sources per catalog asset. fetch-prices tries them by priority and falls back on failure; health columns are written by fetch-prices (service role).';

alter table public.asset_price_sources enable row level security;

-- Catalog is shared: every signed-in user reads it, only the admin writes it.
create policy asset_price_sources_select on public.asset_price_sources
  for select to authenticated
  using (true);

create policy asset_price_sources_insert on public.asset_price_sources
  for insert to authenticated
  with check ((select public.is_admin()));

create policy asset_price_sources_update on public.asset_price_sources
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy asset_price_sources_delete on public.asset_price_sources
  for delete to authenticated
  using ((select public.is_admin()));

revoke all on table public.asset_price_sources from anon;

-- ─── 2. Default source for new assets ───────────────────────────────

-- SECURITY DEFINER so the row lands whoever inserts the asset (the admin
-- through RLS, or the service role); it only ever writes the new asset's row.
create function public.assets_default_price_source()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.price_source in ('yahoo', 'tefas')
     and not exists (
       select 1 from public.asset_price_sources s where s.asset_id = new.id
     ) then
    insert into public.asset_price_sources (asset_id, priority, source, symbol)
    values (new.id, 1, new.price_source, coalesce(new.price_id, new.ticker));
  end if;
  return null;
end;
$$;

revoke execute on function public.assets_default_price_source() from public, anon, authenticated;

create trigger assets_default_price_source
  after insert on public.assets
  for each row execute function public.assets_default_price_source();

-- ─── 3. Seed existing assets ────────────────────────────────────────

-- key = coalesce(price_id, ticker). A Paribu row goes first when one can be
-- derived from the key; the current source follows (or is alone at 1).
-- Paribu rows for symbols Paribu does not list just fail and fall back; the
-- admin deletes the never-ok ones from the admin page.
with seeded as (
  select
    a.id,
    a.price_source,
    coalesce(a.price_id, a.ticker) as k,
    a.category
  from public.assets a
  where a.price_source in ('yahoo', 'tefas')
    and not exists (
      select 1 from public.asset_price_sources s where s.asset_id = a.id
    )
),
paribu as (
  select
    id,
    case
      when category in ('crypto', 'gold') and k like '%-USD' then 'paribu_crypto'
      when category = 'stock_us' and position('.' in k) = 0 then 'paribu_us'
      when category = 'stock_bist' and k like '%.IS' then 'paribu_bist'
    end as source,
    case
      when category in ('crypto', 'gold') and k like '%-USD' then lower(split_part(k, '-', 1))
      when category = 'stock_us' and position('.' in k) = 0 then lower(replace(k, '-', '.'))
      when category = 'stock_bist' and k like '%.IS' then lower(split_part(k, '.', 1))
    end as symbol,
    price_source,
    k
  from seeded
)
insert into public.asset_price_sources (asset_id, priority, source, symbol)
select id, 1, source, symbol from paribu where source is not null
union all
select id, case when source is null then 1 else 2 end, price_source, k from paribu;

-- ─── 4. watchlist_items → catalog assets ────────────────────────────

alter table public.watchlist_items
  add column asset_id uuid references public.assets(id) on delete cascade;

-- Match on the price key. If two assets ever shared a key, take the oldest.
update public.watchlist_items w
set asset_id = m.asset_id
from (
  select distinct on (coalesce(a.price_id, a.ticker))
    coalesce(a.price_id, a.ticker) as k,
    a.id as asset_id
  from public.assets a
  order by coalesce(a.price_id, a.ticker), a.created_at, a.id
) m
where m.k = w.price_id;

-- Refuse rather than drop a row the user added: an unmatched item fails the
-- migration and the admin adds the asset first.
do $$
declare
  unmatched integer;
begin
  select count(*) into unmatched from public.watchlist_items where asset_id is null;
  if unmatched > 0 then
    raise exception
      'watchlist_items: % row(s) match no catalog asset by price key', unmatched;
  end if;
end
$$;

alter table public.watchlist_items
  alter column asset_id set not null,
  add constraint watchlist_items_user_asset_key unique (user_id, asset_id),
  alter column ticker drop not null,
  alter column name drop not null,
  alter column category drop not null,
  alter column price_source drop not null,
  alter column price_id drop not null,
  alter column currency drop not null;

create index watchlist_items_asset_id_idx on public.watchlist_items (asset_id);

comment on table public.watchlist_items is
  'Per-user watchlist (Takip listesi): catalog assets followed without holding them. ticker/name/category/price_source/price_id/currency are legacy (nullable, unused) and dropped in a later migration.';
