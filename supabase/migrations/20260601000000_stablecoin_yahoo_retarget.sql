-- Retarget the two stablecoins (USDT/USDC) from CoinGecko to Yahoo, completing
-- the move started in 20260530000311_asset_yahoo_retarget.sql. These were the
-- last CoinGecko-sourced assets; the fetch-prices / backfill-snapshots functions
-- that drop the CoinGecko code paths ship alongside this migration.
--
-- Yahoo serves USDT-USD / USDC-USD at ~$1 with multi-year daily history
-- (verified), so stablecoins now carry a real market price (catches the rare
-- depeg) instead of the previous hardcoded $1. price_cache is re-keyed to the
-- new price_id so client lookups hit immediately (no unpriced window).

update public.assets
  set price_id = 'USDT-USD', price_source = 'yahoo'
  where price_id = 'tether' and price_source = 'coingecko';
update public.assets
  set price_id = 'USDC-USD', price_source = 'yahoo'
  where price_id = 'usd-coin' and price_source = 'coingecko';

update public.price_cache set ticker = 'USDT-USD' where ticker = 'tether';
update public.price_cache set ticker = 'USDC-USD' where ticker = 'usd-coin';

-- Refresh the new-user seed so fresh signups no longer get CoinGecko assets.
-- Mirrors the post-retarget model: crypto + tokenized gold priced from Yahoo
-- *-USD symbols (ticker = display symbol, price_id = Yahoo fetch symbol).
CREATE OR REPLACE FUNCTION public.seed_user_data(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'cannot seed for another user';
  END IF;

  -- Platforms
  INSERT INTO public.platforms (user_id, name, color) VALUES
    (p_user_id, 'IBKR',          '#3b82f6'),
    (p_user_id, 'Midas',         '#8b5cf6'),
    (p_user_id, 'Midas Kripto',  '#f97316'),
    (p_user_id, 'Paribu',        '#06b6d4'),
    (p_user_id, 'OKX',           '#22c55e'),
    (p_user_id, 'Binance',       '#eab308'),
    (p_user_id, 'Enpara',        '#10b981'),
    (p_user_id, 'Fiziksel',      '#64748b');

  -- Fiat (system currencies)
  INSERT INTO public.assets (user_id, category, ticker, name, tags, price_source, is_currency) VALUES
    (p_user_id, 'fiat', 'TRY', 'Türk Lirası', ARRAY['try'], 'tcmb', true),
    (p_user_id, 'fiat', 'USD', 'US Dollar',    ARRAY['usd'], 'tcmb', true),
    (p_user_id, 'fiat', 'EUR', 'Euro',         ARRAY['eur'], 'tcmb', true);

  -- USD-pegged crypto (priced from Yahoo *-USD)
  INSERT INTO public.assets (user_id, category, ticker, price_id, name, tags, price_source, is_currency) VALUES
    (p_user_id, 'crypto', 'USDT', 'USDT-USD', 'Tether (USDT)', ARRAY['crypto','usd'], 'yahoo', false),
    (p_user_id, 'crypto', 'USDC', 'USDC-USD', 'USD Coin',      ARRAY['crypto','usd'], 'yahoo', false);

  -- Major crypto (priced from Yahoo *-USD)
  INSERT INTO public.assets (user_id, category, ticker, price_id, name, tags, price_source, is_currency) VALUES
    (p_user_id, 'crypto', 'BTC', 'BTC-USD', 'Bitcoin',  ARRAY[]::text[], 'yahoo', false),
    (p_user_id, 'crypto', 'ETH', 'ETH-USD', 'Ethereum', ARRAY[]::text[], 'yahoo', false);

  -- Tokenized gold (priced from Yahoo *-USD)
  INSERT INTO public.assets (user_id, category, ticker, price_id, name, tags, price_source, is_currency) VALUES
    (p_user_id, 'gold', 'PAXG', 'PAXG-USD', 'Pax Gold (PAXG)',    ARRAY['crypto'], 'yahoo', false),
    (p_user_id, 'gold', 'XAUT', 'XAUT-USD', 'Tether Gold (XAUT)', ARRAY['crypto'], 'yahoo', false);

  -- Physical gold
  INSERT INTO public.assets (user_id, category, ticker, name, tags, price_source, is_currency) VALUES
    (p_user_id, 'gold', 'XAU_GRAM', 'Physical Gold', ARRAY['commodity'], 'tcmb', false);

  -- US stocks
  INSERT INTO public.assets (user_id, category, ticker, name, tags, price_source, is_currency) VALUES
    (p_user_id, 'stock_us', 'AAPL',  'Apple',                ARRAY[]::text[], 'yahoo', false),
    (p_user_id, 'stock_us', 'QQQ',   'Invesco QQQ',          ARRAY[]::text[], 'yahoo', false),
    (p_user_id, 'stock_us', 'BRK-B', 'Berkshire Hathaway B', ARRAY[]::text[], 'yahoo', false);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.seed_user_data(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.seed_user_data(uuid) TO authenticated;
