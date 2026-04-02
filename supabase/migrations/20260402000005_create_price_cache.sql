-- Create price_cache table (global, no user_id)

CREATE TABLE public.price_cache (
  ticker text PRIMARY KEY,
  price_usd numeric,
  price_try numeric,
  source text,
  updated_at timestamptz DEFAULT now()
);
