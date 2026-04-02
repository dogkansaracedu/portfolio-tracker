-- Function to seed default platforms and assets for a new user.
-- Call via: SELECT seed_user_data('user-uuid-here');

CREATE OR REPLACE FUNCTION public.seed_user_data(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_ibkr uuid;
  v_midas uuid;
  v_midas_kripto uuid;
  v_paribu uuid;
  v_okx uuid;
  v_binance uuid;
  v_ziraat uuid;
  v_fiziksel uuid;
BEGIN
  -- ─── Platforms ────────────────────────────────────────────────────
  INSERT INTO public.platforms (id, user_id, name, color) VALUES
    (gen_random_uuid(), p_user_id, 'IBKR',          '#3b82f6'),
    (gen_random_uuid(), p_user_id, 'Midas',         '#8b5cf6'),
    (gen_random_uuid(), p_user_id, 'Midas Kripto',  '#f97316'),
    (gen_random_uuid(), p_user_id, 'Paribu',        '#06b6d4'),
    (gen_random_uuid(), p_user_id, 'OKX',           '#22c55e'),
    (gen_random_uuid(), p_user_id, 'Binance',       '#eab308'),
    (gen_random_uuid(), p_user_id, 'Ziraat',        '#ec4899'),
    (gen_random_uuid(), p_user_id, 'Fiziksel',      '#64748b');

  -- Get platform IDs
  SELECT id INTO v_ibkr        FROM public.platforms WHERE user_id = p_user_id AND name = 'IBKR';
  SELECT id INTO v_midas       FROM public.platforms WHERE user_id = p_user_id AND name = 'Midas';
  SELECT id INTO v_midas_kripto FROM public.platforms WHERE user_id = p_user_id AND name = 'Midas Kripto';
  SELECT id INTO v_paribu      FROM public.platforms WHERE user_id = p_user_id AND name = 'Paribu';
  SELECT id INTO v_okx         FROM public.platforms WHERE user_id = p_user_id AND name = 'OKX';
  SELECT id INTO v_binance     FROM public.platforms WHERE user_id = p_user_id AND name = 'Binance';
  SELECT id INTO v_ziraat      FROM public.platforms WHERE user_id = p_user_id AND name = 'Ziraat';
  SELECT id INTO v_fiziksel    FROM public.platforms WHERE user_id = p_user_id AND name = 'Fiziksel';

  -- ─── Common Assets ───────────────────────────────────────────────
  -- Fiat
  INSERT INTO public.assets (user_id, platform_id, category, ticker, name, balance, is_active) VALUES
    (p_user_id, v_ziraat, 'fiat', 'TRY', 'Türk Lirası', 0, true),
    (p_user_id, v_ziraat, 'fiat', 'USD', 'US Dollar', 0, true),
    (p_user_id, v_ziraat, 'fiat', 'EUR', 'Euro', 0, true),
    (p_user_id, v_ibkr,   'fiat', 'USD', 'US Dollar', 0, true);

  -- Crypto - major coins
  INSERT INTO public.assets (user_id, platform_id, category, ticker, name, balance, is_active) VALUES
    (p_user_id, v_paribu,       'crypto', 'bitcoin',  'Bitcoin',  0, true),
    (p_user_id, v_paribu,       'crypto', 'ethereum', 'Ethereum', 0, true),
    (p_user_id, v_binance,      'crypto', 'bitcoin',  'Bitcoin',  0, true),
    (p_user_id, v_binance,      'crypto', 'ethereum', 'Ethereum', 0, true),
    (p_user_id, v_okx,          'crypto', 'bitcoin',  'Bitcoin',  0, true),
    (p_user_id, v_okx,          'crypto', 'ethereum', 'Ethereum', 0, true),
    (p_user_id, v_midas_kripto, 'crypto', 'bitcoin',  'Bitcoin',  0, true),
    (p_user_id, v_midas_kripto, 'crypto', 'ethereum', 'Ethereum', 0, true);

  -- Crypto - stablecoins
  INSERT INTO public.assets (user_id, platform_id, category, ticker, name, balance, is_active) VALUES
    (p_user_id, v_paribu,  'crypto', 'tether',   'Tether (USDT)', 0, true),
    (p_user_id, v_binance, 'crypto', 'tether',   'Tether (USDT)', 0, true),
    (p_user_id, v_okx,     'crypto', 'tether',   'Tether (USDT)', 0, true),
    (p_user_id, v_paribu,  'crypto', 'usd-coin', 'USD Coin',      0, true);

  -- Crypto - other popular
  INSERT INTO public.assets (user_id, platform_id, category, ticker, name, balance, is_active) VALUES
    (p_user_id, v_binance, 'crypto', 'solana',    'Solana',    0, true),
    (p_user_id, v_binance, 'crypto', 'ripple',    'XRP',       0, true),
    (p_user_id, v_binance, 'crypto', 'cardano',   'Cardano',   0, true),
    (p_user_id, v_binance, 'crypto', 'avalanche-2', 'Avalanche', 0, true);

  -- Gold - tokenized (crypto category, CoinGecko IDs)
  INSERT INTO public.assets (user_id, platform_id, category, ticker, name, balance, is_active) VALUES
    (p_user_id, v_binance, 'crypto', 'paxgold',      'Pax Gold (PAXG)',    0, true),
    (p_user_id, v_binance, 'crypto', 'tether-gold',  'Tether Gold (XAUT)', 0, true),
    (p_user_id, v_midas,   'crypto', 'paxgold',      'Pax Gold (PAXG)',    0, true);

  -- Gold - physical (commodity category, TCMB price)
  INSERT INTO public.assets (user_id, platform_id, category, ticker, name, balance, is_active) VALUES
    (p_user_id, v_fiziksel, 'commodity', 'XAU_GRAM', 'Gram Altın', 0, true);

  -- US Stocks (via IBKR)
  INSERT INTO public.assets (user_id, platform_id, category, ticker, name, balance, is_active) VALUES
    (p_user_id, v_ibkr, 'stock_us', 'AAPL', 'Apple',         0, true),
    (p_user_id, v_ibkr, 'stock_us', 'MSFT', 'Microsoft',     0, true),
    (p_user_id, v_ibkr, 'stock_us', 'VOO',  'Vanguard S&P 500', 0, true),
    (p_user_id, v_ibkr, 'stock_us', 'QQQ',  'Invesco QQQ',   0, true);

  -- BIST Stocks (via Midas)
  INSERT INTO public.assets (user_id, platform_id, category, ticker, name, balance, is_active) VALUES
    (p_user_id, v_midas, 'stock_bist', 'THYAO.IS', 'THY',     0, true),
    (p_user_id, v_midas, 'stock_bist', 'GARAN.IS', 'Garanti', 0, true),
    (p_user_id, v_midas, 'stock_bist', 'ASELS.IS', 'Aselsan', 0, true);

  -- Midas Funds (using fiat category as TRY-denominated funds)
  INSERT INTO public.assets (user_id, platform_id, category, ticker, name, balance, is_active) VALUES
    (p_user_id, v_midas, 'fiat', 'TRY', 'Fon TL', 0, true);

END;
$$;
