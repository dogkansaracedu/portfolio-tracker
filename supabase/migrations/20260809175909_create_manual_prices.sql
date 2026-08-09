-- Hand-entered historical closes used by backfill-snapshots to fill dates the
-- primary price source (Yahoo/TEFAS) lacks — e.g. fresh BIST IPOs whose first
-- trading days predate Yahoo's history window. A row only fills a hole; a
-- fetched close always wins over a manual one.
create table if not exists public.manual_prices (
  price_id text not null,
  price_date date not null,
  close numeric not null check (close > 0),
  currency text not null default 'TRY',
  note text,
  created_at timestamptz not null default now(),
  primary key (price_id, price_date)
);

comment on table public.manual_prices is
  'Hand-entered historical closes used by backfill-snapshots to fill dates the primary price source (Yahoo/TEFAS) lacks — e.g. fresh BIST IPOs. A row only fills a hole; fetched closes always win.';

alter table public.manual_prices enable row level security;

create policy "authenticated can read manual prices"
  on public.manual_prices for select to authenticated using (true);
