-- Enable RLS on all tables
ALTER TABLE public.platforms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.holdings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exchange_rates ENABLE ROW LEVEL SECURITY;

-- Platforms: user owns their rows
CREATE POLICY platforms_select ON public.platforms FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY platforms_insert ON public.platforms FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY platforms_update ON public.platforms FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY platforms_delete ON public.platforms FOR DELETE USING (auth.uid() = user_id);

-- Assets: user owns their rows
CREATE POLICY assets_select ON public.assets FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY assets_insert ON public.assets FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY assets_update ON public.assets FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY assets_delete ON public.assets FOR DELETE USING (auth.uid() = user_id);

-- Holdings: user owns their rows
CREATE POLICY holdings_select ON public.holdings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY holdings_insert ON public.holdings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY holdings_update ON public.holdings FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY holdings_delete ON public.holdings FOR DELETE USING (auth.uid() = user_id);

-- Transactions: user owns their rows
CREATE POLICY transactions_select ON public.transactions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY transactions_insert ON public.transactions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY transactions_update ON public.transactions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY transactions_delete ON public.transactions FOR DELETE USING (auth.uid() = user_id);

-- Price cache: all authenticated users can read, only service role can write
CREATE POLICY price_cache_select ON public.price_cache FOR SELECT TO authenticated USING (true);

-- Snapshots: user owns their rows
CREATE POLICY snapshots_select ON public.snapshots FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY snapshots_insert ON public.snapshots FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY snapshots_update ON public.snapshots FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY snapshots_delete ON public.snapshots FOR DELETE USING (auth.uid() = user_id);

-- Exchange rates: all authenticated users can read
CREATE POLICY exchange_rates_select ON public.exchange_rates FOR SELECT TO authenticated USING (true);
