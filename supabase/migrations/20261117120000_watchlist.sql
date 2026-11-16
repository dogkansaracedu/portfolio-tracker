-- Watchlist (Takip listesi): symbols the user follows without holding them.
--
-- 1. `watchlist_items` — per-user, owner-only. Each row carries the same
--    pricing vocabulary an asset does (`category`, `price_source`, `price_id`),
--    so `fetch-prices` prices it through the one shared `price_cache`, keyed
--    by `price_id`. No `assets` row is created for a watched symbol.
-- 2. `price_cache.baseline_usd / baseline_try` — the day's baseline for
--    "today's change" on symbols with no snapshot: the last cached price from
--    before the first refresh of the current Europe/Istanbul day. A trigger
--    rolls it on every update; writers never set it.

-- ─── 1. watchlist_items ─────────────────────────────────────────────

CREATE TABLE public.watchlist_items (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Display symbol (THYAO, BTC, USDTRY) — never used to fetch.
  ticker       text NOT NULL CHECK (char_length(ticker) BETWEEN 1 AND 32),
  name         text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  -- Same values as assets.category; drives the refresh cadence and the BIST
  -- market-hours gate in fetch-prices.
  category     text NOT NULL,
  -- Same values as assets.price_source, minus 'manual' (nothing to type in).
  price_source text NOT NULL CHECK (price_source IN ('yahoo', 'tcmb', 'tefas')),
  -- Price-fetch key = the price_cache key (THYAO.IS, BTC-USD, USDTRY=X, TP2).
  price_id     text NOT NULL CHECK (char_length(price_id) BETWEEN 1 AND 32),
  -- The currency the price is shown in: TRY when the source quotes TRY, USD
  -- otherwise (price_cache keeps only USD + TRY, so EUR falls back to USD).
  currency     text NOT NULL CHECK (currency IN ('USD', 'TRY')),
  sort_order   integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, price_id)
);

COMMENT ON TABLE public.watchlist_items IS
  'Per-user watchlist (Takip listesi): symbols followed without holding them. Priced via price_cache[price_id]; never creates assets rows.';

CREATE INDEX watchlist_items_user_sort_idx
  ON public.watchlist_items (user_id, sort_order);

ALTER TABLE public.watchlist_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY watchlist_items_select
  ON public.watchlist_items FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);
CREATE POLICY watchlist_items_insert
  ON public.watchlist_items FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY watchlist_items_update
  ON public.watchlist_items FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY watchlist_items_delete
  ON public.watchlist_items FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- ─── 2. price_cache daily baseline ──────────────────────────────────

ALTER TABLE public.price_cache
  ADD COLUMN baseline_usd numeric,
  ADD COLUMN baseline_try numeric;

COMMENT ON COLUMN public.price_cache.baseline_usd IS
  'Last price_usd cached before the first refresh of the current Europe/Istanbul day (trigger-maintained). Baseline for a watchlist item''s today''s change.';
COMMENT ON COLUMN public.price_cache.baseline_try IS
  'Last price_try cached before the first refresh of the current Europe/Istanbul day (trigger-maintained).';

-- On the first write of a new home-local day the outgoing price becomes the
-- baseline; every other write keeps the existing baseline, whatever the writer
-- sent. The 23:55 forced refresh (daily cron) prices every key, so in practice
-- the baseline is the previous day's end-of-day price — the same moment the
-- daily snapshot freezes for held assets.
CREATE FUNCTION public.price_cache_roll_baseline()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF OLD.updated_at IS NOT NULL
     AND NEW.updated_at IS NOT NULL
     AND (NEW.updated_at AT TIME ZONE 'Europe/Istanbul')::date
       > (OLD.updated_at AT TIME ZONE 'Europe/Istanbul')::date THEN
    NEW.baseline_usd := OLD.price_usd;
    NEW.baseline_try := OLD.price_try;
  ELSE
    NEW.baseline_usd := OLD.baseline_usd;
    NEW.baseline_try := OLD.baseline_try;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER price_cache_roll_baseline
  BEFORE UPDATE ON public.price_cache
  FOR EACH ROW EXECUTE FUNCTION public.price_cache_roll_baseline();
