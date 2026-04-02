-- Holdings track per-platform balance for each global asset.
-- Created on-demand when the first transaction occurs.
CREATE TABLE public.holdings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  platform_id uuid NOT NULL REFERENCES public.platforms(id) ON DELETE CASCADE,
  balance numeric DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, asset_id, platform_id)
);

CREATE INDEX idx_holdings_user_asset ON public.holdings(user_id, asset_id);
CREATE INDEX idx_holdings_user_platform ON public.holdings(user_id, platform_id);
