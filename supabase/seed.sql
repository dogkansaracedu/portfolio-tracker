-- Seed data for portfolio tracker
-- Note: Platform seed data requires a user_id, so it will be inserted
-- after the first user signs up. This file is intentionally minimal
-- for the local dev setup.

-- Seed some exchange rate data for development
INSERT INTO public.exchange_rates (date, source, usd_try, eur_try, eur_usd, gold_gram_try)
VALUES
  ('2026-04-01', 'tcmb', 38.50, 42.10, 1.09, 3850),
  ('2026-03-01', 'tcmb', 37.80, 41.50, 1.10, 3720)
ON CONFLICT DO NOTHING;
