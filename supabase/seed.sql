-- Seed exchange rate data for development
INSERT INTO public.exchange_rates (date, source, usd_try, eur_try, eur_usd, gold_gram_try)
VALUES
  ('2025-06-01', 'tcmb', 35.00, 38.50, 1.10, 4200),
  ('2026-03-01', 'tcmb', 43.80, 50.80, 1.10, 6400),
  ('2026-04-01', 'tcmb', 44.50, 51.56, 1.09, 6610)
ON CONFLICT DO NOTHING;

