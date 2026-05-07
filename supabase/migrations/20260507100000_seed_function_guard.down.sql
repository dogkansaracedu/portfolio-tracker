-- Down migration for the seed_user_data guard. Supabase does not auto-run
-- down migrations; if rolling back is needed, write a new forward migration
-- that restores the body without the guard.
--
-- For local development only:
--   psql <db-url> -f supabase/migrations/20260507100000_seed_function_guard.down.sql

CREATE OR REPLACE FUNCTION public.seed_user_data(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Original body from 20260402100010_seed_function.sql:
  -- ─── Platforms ────────────────────────────────────────────────────
  INSERT INTO public.platforms (user_id, name, color) VALUES
    (p_user_id, 'IBKR',          '#3b82f6'),
    (p_user_id, 'Midas',         '#8b5cf6'),
    (p_user_id, 'Midas Kripto',  '#f97316'),
    (p_user_id, 'Paribu',        '#06b6d4'),
    (p_user_id, 'OKX',           '#22c55e'),
    (p_user_id, 'Binance',       '#eab308'),
    (p_user_id, 'Enpara',        '#10b981'),
    (p_user_id, 'Fiziksel',      '#64748b');

  -- ─── Global Assets (one row per ticker) ──────────────────────────

  -- Fiat — cash
  INSERT INTO public.assets (user_id, category, ticker, name, tags, price_source) VALUES
    (p_user_id, 'fiat', 'TRY', 'Türk Lirası',  ARRAY['try'],       'tcmb'),
    (p_user_id, 'fiat', 'USD', 'US Dollar',     ARRAY['usd'],       'tcmb'),
    (p_user_id, 'fiat', 'EUR', 'Euro',          ARRAY['eur'],       'tcmb');

  -- Fiat — stablecoins
  INSERT INTO public.assets (user_id, category, ticker, name, tags, price_source) VALUES
    (p_user_id, 'fiat', 'tether',   'Tether (USDT)', ARRAY['crypto','usd'], 'coingecko'),
    (p_user_id, 'fiat', 'usd-coin', 'USD Coin',      ARRAY['crypto','usd'], 'coingecko');

  -- Crypto — major
  INSERT INTO public.assets (user_id, category, ticker, name, tags, price_source) VALUES
    (p_user_id, 'crypto', 'bitcoin',  'Bitcoin',  ARRAY[]::text[], 'coingecko'),
    (p_user_id, 'crypto', 'ethereum', 'Ethereum', ARRAY[]::text[], 'coingecko');

  -- Gold — tokenized
  INSERT INTO public.assets (user_id, category, ticker, name, tags, price_source) VALUES
    (p_user_id, 'gold', 'pax-gold',    'Pax Gold (PAXG)',    ARRAY['crypto'], 'coingecko'),
    (p_user_id, 'gold', 'tether-gold', 'Tether Gold (XAUT)', ARRAY['crypto'], 'coingecko');

  -- Gold — physical
  INSERT INTO public.assets (user_id, category, ticker, name, tags, price_source) VALUES
    (p_user_id, 'gold', 'XAU_GRAM', 'Physical Gold', ARRAY['commodity'], 'tcmb');

  -- US Stocks
  INSERT INTO public.assets (user_id, category, ticker, name, tags, price_source) VALUES
    (p_user_id, 'stock_us', 'AAPL',  'Apple',                ARRAY[]::text[], 'yahoo'),
    (p_user_id, 'stock_us', 'QQQ',   'Invesco QQQ',          ARRAY[]::text[], 'yahoo'),
    (p_user_id, 'stock_us', 'BRK-B', 'Berkshire Hathaway B', ARRAY[]::text[], 'yahoo');

END;
$$;
