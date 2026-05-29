-- price_id: provider-specific fetch key, decoupled from ticker (display label).
-- Behaviour-neutral: nothing reads price_id until the app is deployed with the
-- price_id-aware code, so this is safe to apply ahead of that deploy.
alter table public.assets add column if not exists price_id text;

-- Backfill every existing asset so price_id == ticker (identical fetch behaviour).
update public.assets set price_id = ticker where price_id is null;
