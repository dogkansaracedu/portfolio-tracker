-- Consolidated init migration. Replaces 22 prior migrations with a single
-- baseline that builds the schema as if from scratch. The `denomination`
-- column intentionally does not exist here — see
-- docs/denomination-rollback-handoff.md for the rationale.

-- ─── Extensions ─────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ─── Types ──────────────────────────────────────────────────────────
CREATE TYPE public.transaction_type AS ENUM (
  'buy',
  'sell',
  'transfer_in',
  'transfer_out',
  'dividend',
  'interest',
  'fee',
  'cash_credit',
  'cash_debit'
);

-- ─── Tables ─────────────────────────────────────────────────────────

-- Signup gate: only emails in this table may create an auth.users row.
-- RLS is on but no policies are defined, so reads/writes are limited to
-- the service role and SECURITY DEFINER functions.
CREATE TABLE public.signup_allowlist (
  email    text PRIMARY KEY CHECK (email = LOWER(email)),
  added_at timestamptz NOT NULL DEFAULT now(),
  note     text
);

CREATE TABLE public.platforms (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name       text NOT NULL,
  color      text DEFAULT '#6366f1',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.assets (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category     text NOT NULL,
  ticker       text NOT NULL,
  name         text NOT NULL,
  tags         text[] DEFAULT '{}',
  price_source text DEFAULT 'manual',
  is_currency  boolean NOT NULL DEFAULT false,
  is_active    boolean DEFAULT true,
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now(),
  UNIQUE(user_id, ticker)
);

CREATE TABLE public.holdings (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  asset_id    uuid NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  platform_id uuid NOT NULL REFERENCES public.platforms(id) ON DELETE CASCADE,
  balance     numeric DEFAULT 0,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now(),
  UNIQUE(user_id, asset_id, platform_id)
);

CREATE TABLE public.transactions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  asset_id         uuid NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  platform_id      uuid NOT NULL REFERENCES public.platforms(id) ON DELETE CASCADE,
  type             public.transaction_type NOT NULL,
  date             timestamptz NOT NULL,
  amount           numeric NOT NULL,
  unit_price       numeric NOT NULL,
  price_currency   text NOT NULL DEFAULT 'USD',
  total_cost       numeric NOT NULL,
  fee              numeric DEFAULT 0,
  fee_currency     text,
  related_asset_id uuid REFERENCES public.assets(id) ON DELETE SET NULL,
  linked_tx_id     uuid REFERENCES public.transactions(id) ON DELETE CASCADE,
  notes            text,
  created_at       timestamptz DEFAULT now(),
  CONSTRAINT transfer_in_has_cost
    CHECK (type <> 'transfer_in' OR total_cost > 0),
  CONSTRAINT cash_row_must_have_parent
    CHECK (
      (type IN ('cash_credit', 'cash_debit') AND linked_tx_id IS NOT NULL)
      OR
      (type NOT IN ('cash_credit', 'cash_debit') AND linked_tx_id IS NULL)
    )
);

CREATE TABLE public.price_cache (
  ticker     text PRIMARY KEY,
  price_usd  numeric,
  price_try  numeric,
  source     text,
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.snapshots (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  snapshot_date date NOT NULL,
  total_usd     numeric,
  total_try     numeric,
  breakdown     jsonb,
  created_at    timestamptz DEFAULT now(),
  UNIQUE(user_id, snapshot_date)
);

CREATE TABLE public.exchange_rates (
  date          date NOT NULL,
  source        text NOT NULL,
  usd_try       numeric,
  eur_try       numeric,
  eur_usd       numeric,
  gold_gram_try numeric,
  PRIMARY KEY (date, source)
);

-- ─── Indexes ────────────────────────────────────────────────────────
CREATE INDEX idx_platforms_user_id
  ON public.platforms(user_id);
CREATE INDEX idx_assets_user_id
  ON public.assets(user_id);
CREATE INDEX idx_assets_ticker
  ON public.assets(ticker);
CREATE INDEX idx_assets_tags
  ON public.assets USING GIN (tags);
CREATE INDEX idx_holdings_user_asset
  ON public.holdings(user_id, asset_id);
CREATE INDEX idx_holdings_user_platform
  ON public.holdings(user_id, platform_id);
CREATE INDEX idx_transactions_user_asset_platform_date
  ON public.transactions(user_id, asset_id, platform_id, date);
CREATE INDEX idx_transactions_user_date
  ON public.transactions(user_id, date);
CREATE INDEX transactions_linked_tx_id_idx
  ON public.transactions(linked_tx_id)
  WHERE linked_tx_id IS NOT NULL;
CREATE INDEX idx_snapshots_user_date
  ON public.snapshots(user_id, snapshot_date);

-- ─── Row Level Security ────────────────────────────────────────────
ALTER TABLE public.signup_allowlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platforms        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assets           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.holdings         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_cache      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.snapshots        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exchange_rates   ENABLE ROW LEVEL SECURITY;

-- ─── Policies ───────────────────────────────────────────────────────
-- signup_allowlist: no policies → service role / SECURITY DEFINER only.

CREATE POLICY platforms_select ON public.platforms FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY platforms_insert ON public.platforms FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY platforms_update ON public.platforms FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY platforms_delete ON public.platforms FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY assets_select ON public.assets FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY assets_insert ON public.assets FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY assets_update ON public.assets FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY assets_delete ON public.assets FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY holdings_select ON public.holdings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY holdings_insert ON public.holdings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY holdings_update ON public.holdings FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY holdings_delete ON public.holdings FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY transactions_select ON public.transactions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY transactions_insert ON public.transactions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY transactions_update ON public.transactions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY transactions_delete ON public.transactions FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY snapshots_select ON public.snapshots FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY snapshots_insert ON public.snapshots FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY snapshots_update ON public.snapshots FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY snapshots_delete ON public.snapshots FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY price_cache_select
  ON public.price_cache FOR SELECT TO authenticated USING (true);
CREATE POLICY exchange_rates_select
  ON public.exchange_rates FOR SELECT TO authenticated USING (true);

-- ─── Functions ──────────────────────────────────────────────────────

-- Signup allowlist enforcement. SECURITY DEFINER so the SELECT bypasses
-- the locked-down RLS on signup_allowlist; locked search_path defends
-- against search-path tricks.
CREATE FUNCTION public.enforce_signup_allowlist()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.email IS NULL THEN
    RAISE EXCEPTION 'signup blocked: email is required';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.signup_allowlist
    WHERE email = LOWER(NEW.email)
  ) THEN
    RAISE EXCEPTION
      'signup blocked: % is not on the allowlist', NEW.email;
  END IF;
  RETURN NEW;
END;
$$;

-- Per-user seed. SECURITY DEFINER + guard so callers can't pass another
-- user's UUID and write into their tables.
CREATE FUNCTION public.seed_user_data(p_user_id uuid)
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

  -- USD-pegged crypto
  INSERT INTO public.assets (user_id, category, ticker, name, tags, price_source, is_currency) VALUES
    (p_user_id, 'crypto', 'tether',   'Tether (USDT)', ARRAY['crypto','usd'], 'coingecko', false),
    (p_user_id, 'crypto', 'usd-coin', 'USD Coin',      ARRAY['crypto','usd'], 'coingecko', false);

  -- Major crypto
  INSERT INTO public.assets (user_id, category, ticker, name, tags, price_source, is_currency) VALUES
    (p_user_id, 'crypto', 'bitcoin',  'Bitcoin',  ARRAY[]::text[], 'coingecko', false),
    (p_user_id, 'crypto', 'ethereum', 'Ethereum', ARRAY[]::text[], 'coingecko', false);

  -- Tokenized gold
  INSERT INTO public.assets (user_id, category, ticker, name, tags, price_source, is_currency) VALUES
    (p_user_id, 'gold', 'pax-gold',    'Pax Gold (PAXG)',    ARRAY['crypto'], 'coingecko', false),
    (p_user_id, 'gold', 'tether-gold', 'Tether Gold (XAUT)', ARRAY['crypto'], 'coingecko', false);

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

-- ─── Triggers ───────────────────────────────────────────────────────
CREATE TRIGGER enforce_signup_allowlist_trg
  BEFORE INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_signup_allowlist();

-- ─── Cron ───────────────────────────────────────────────────────────
-- Daily portfolio snapshot at 23:55 UTC. Pulls the Edge Functions base
-- URL and the X-Cron-Token shared secret from Supabase Vault. Required
-- vault secrets (set once per environment via SQL Editor):
--   SELECT vault.create_secret('<token-hex>',
--                              'cron_token',
--                              'X-Cron-Token for take-snapshots');
--   SELECT vault.create_secret('https://<ref>.supabase.co/functions/v1',
--                              'functions_url',
--                              'Edge Functions base URL for cron callbacks');

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'daily-portfolio-snapshot') THEN
    PERFORM cron.unschedule('daily-portfolio-snapshot');
  END IF;
END $$;

SELECT cron.schedule(
  'daily-portfolio-snapshot',
  '55 23 * * *',
  $cron$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'functions_url') || '/take-snapshots',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Cron-Token', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_token')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $cron$
);
