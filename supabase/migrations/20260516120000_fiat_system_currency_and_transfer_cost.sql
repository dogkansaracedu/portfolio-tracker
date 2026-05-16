-- Fiat-as-System-Currency + Transfer Cost UX
--
-- 1. Adds `is_currency` and `denomination` to assets.
-- 2. Adds CHECK preventing zero-cost transfer_in (closes the Mar 3 bug class).
-- 3. Backfills: USD/TRY/EUR become system currencies; USDT/USDC become crypto.
-- 4. Updates seed_user_data to set the new fields and emit USDT/USDC as crypto.

-- ─── 1. Schema additions ────────────────────────────────────────────

ALTER TABLE public.assets
  ADD COLUMN IF NOT EXISTS is_currency boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS denomination text NOT NULL DEFAULT 'USD';

ALTER TABLE public.assets
  ADD CONSTRAINT denomination_supported
    CHECK (denomination IN ('USD','TRY','EUR')),
  ADD CONSTRAINT currency_self_denominated
    CHECK (NOT is_currency OR denomination = ticker);

ALTER TABLE public.transactions
  ADD CONSTRAINT transfer_in_has_cost
    CHECK (type <> 'transfer_in' OR total_cost > 0);

-- ─── 2. Backfill existing data ──────────────────────────────────────

UPDATE public.assets
SET is_currency = true,
    denomination = ticker
WHERE ticker IN ('USD', 'TRY', 'EUR');

UPDATE public.assets
SET category = 'crypto'
WHERE ticker IN ('tether', 'usd-coin');

-- ─── 3. Updated seed function ───────────────────────────────────────

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

  INSERT INTO public.platforms (user_id, name, color) VALUES
    (p_user_id, 'IBKR',          '#3b82f6'),
    (p_user_id, 'Midas',         '#8b5cf6'),
    (p_user_id, 'Midas Kripto',  '#f97316'),
    (p_user_id, 'Paribu',        '#06b6d4'),
    (p_user_id, 'OKX',           '#22c55e'),
    (p_user_id, 'Binance',       '#eab308'),
    (p_user_id, 'Enpara',        '#10b981'),
    (p_user_id, 'Fiziksel',      '#64748b');

  INSERT INTO public.assets (user_id, category, ticker, name, tags, price_source, is_currency, denomination) VALUES
    (p_user_id, 'fiat', 'TRY', 'Türk Lirası', ARRAY['try'], 'tcmb', true, 'TRY'),
    (p_user_id, 'fiat', 'USD', 'US Dollar',    ARRAY['usd'], 'tcmb', true, 'USD'),
    (p_user_id, 'fiat', 'EUR', 'Euro',         ARRAY['eur'], 'tcmb', true, 'EUR');

  INSERT INTO public.assets (user_id, category, ticker, name, tags, price_source, is_currency, denomination) VALUES
    (p_user_id, 'crypto', 'tether',   'Tether (USDT)', ARRAY['crypto','usd'], 'coingecko', false, 'USD'),
    (p_user_id, 'crypto', 'usd-coin', 'USD Coin',      ARRAY['crypto','usd'], 'coingecko', false, 'USD');

  INSERT INTO public.assets (user_id, category, ticker, name, tags, price_source, is_currency, denomination) VALUES
    (p_user_id, 'crypto', 'bitcoin',  'Bitcoin',  ARRAY[]::text[], 'coingecko', false, 'USD'),
    (p_user_id, 'crypto', 'ethereum', 'Ethereum', ARRAY[]::text[], 'coingecko', false, 'USD');

  INSERT INTO public.assets (user_id, category, ticker, name, tags, price_source, is_currency, denomination) VALUES
    (p_user_id, 'gold', 'pax-gold',    'Pax Gold (PAXG)',    ARRAY['crypto'], 'coingecko', false, 'USD'),
    (p_user_id, 'gold', 'tether-gold', 'Tether Gold (XAUT)', ARRAY['crypto'], 'coingecko', false, 'USD');

  INSERT INTO public.assets (user_id, category, ticker, name, tags, price_source, is_currency, denomination) VALUES
    (p_user_id, 'gold', 'XAU_GRAM', 'Physical Gold', ARRAY['commodity'], 'tcmb', false, 'USD');

  INSERT INTO public.assets (user_id, category, ticker, name, tags, price_source, is_currency, denomination) VALUES
    (p_user_id, 'stock_us', 'AAPL',  'Apple',                ARRAY[]::text[], 'yahoo', false, 'USD'),
    (p_user_id, 'stock_us', 'QQQ',   'Invesco QQQ',          ARRAY[]::text[], 'yahoo', false, 'USD'),
    (p_user_id, 'stock_us', 'BRK-B', 'Berkshire Hathaway B', ARRAY[]::text[], 'yahoo', false, 'USD');
END;
$$;
