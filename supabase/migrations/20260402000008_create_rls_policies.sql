-- Enable RLS on all tables and create policies

-- ============================================================
-- platforms
-- ============================================================
ALTER TABLE public.platforms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own platforms"
  ON public.platforms FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own platforms"
  ON public.platforms FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own platforms"
  ON public.platforms FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own platforms"
  ON public.platforms FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================
-- assets
-- ============================================================
ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own assets"
  ON public.assets FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own assets"
  ON public.assets FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own assets"
  ON public.assets FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own assets"
  ON public.assets FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================
-- transactions
-- ============================================================
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own transactions"
  ON public.transactions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own transactions"
  ON public.transactions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own transactions"
  ON public.transactions FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own transactions"
  ON public.transactions FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================
-- snapshots
-- ============================================================
ALTER TABLE public.snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own snapshots"
  ON public.snapshots FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own snapshots"
  ON public.snapshots FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own snapshots"
  ON public.snapshots FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own snapshots"
  ON public.snapshots FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================
-- price_cache (global: authenticated read, service_role write)
-- ============================================================
ALTER TABLE public.price_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read price_cache"
  ON public.price_cache FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role can insert price_cache"
  ON public.price_cache FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role can update price_cache"
  ON public.price_cache FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role can delete price_cache"
  ON public.price_cache FOR DELETE
  TO service_role
  USING (true);

-- ============================================================
-- exchange_rates (global: authenticated read, service_role write)
-- ============================================================
ALTER TABLE public.exchange_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read exchange_rates"
  ON public.exchange_rates FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role can insert exchange_rates"
  ON public.exchange_rates FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role can update exchange_rates"
  ON public.exchange_rates FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role can delete exchange_rates"
  ON public.exchange_rates FOR DELETE
  TO service_role
  USING (true);
