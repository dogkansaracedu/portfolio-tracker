-- Create assets table

CREATE TABLE public.assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform_id uuid NOT NULL REFERENCES public.platforms(id) ON DELETE CASCADE,
  category public.asset_category NOT NULL,
  ticker text NOT NULL,
  name text NOT NULL,
  balance numeric DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_assets_user_platform ON public.assets(user_id, platform_id);
CREATE INDEX idx_assets_ticker ON public.assets(ticker);
