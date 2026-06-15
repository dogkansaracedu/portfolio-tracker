-- Intraday (hourly) snapshots — a rolling ~24h window of totals-only points.
--
-- Separate from `snapshots` (which is UNIQUE(user_id, snapshot_date) on a DATE
-- column — one row per day, the permanent record). This table is timestamp-keyed
-- and append-only; the hourly writer (take-intraday-snapshots) prunes rows older
-- than 24h every run, so it never grows beyond ~24 rows per user. Totals only —
-- no breakdown jsonb; allocation doesn't move intraday and the 1D chart needs
-- only totals. The daily 23:55 snapshot stays the authoritative per-day value.

CREATE TABLE public.intraday_snapshots (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  captured_at timestamptz NOT NULL DEFAULT now(),
  total_usd   numeric,
  total_try   numeric
);

CREATE INDEX idx_intraday_user_captured
  ON public.intraday_snapshots(user_id, captured_at);

ALTER TABLE public.intraday_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY intraday_snapshots_select ON public.intraday_snapshots FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY intraday_snapshots_insert ON public.intraday_snapshots FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY intraday_snapshots_update ON public.intraday_snapshots FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY intraday_snapshots_delete ON public.intraday_snapshots FOR DELETE USING (auth.uid() = user_id);
