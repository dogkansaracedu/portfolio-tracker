CREATE TABLE public.exchange_rates (
  date date NOT NULL,
  source text NOT NULL,
  usd_try numeric,
  eur_try numeric,
  eur_usd numeric,
  gold_gram_try numeric,
  PRIMARY KEY (date, source)
);
