-- Assets are GLOBAL: one row per ticker per user.
-- No platform_id, no balance (balance lives in holdings table).
CREATE TABLE public.assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category public.asset_category NOT NULL,
  ticker text NOT NULL,
  name text NOT NULL,
  asset_group text,        -- Cross-ticker grouping: "Gold", "USD", "BTC", etc.
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, ticker)
);

CREATE INDEX idx_assets_user_id ON public.assets(user_id);
CREATE INDEX idx_assets_ticker ON public.assets(ticker);
