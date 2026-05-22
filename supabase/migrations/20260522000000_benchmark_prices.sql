-- Daily-close history for benchmark indices (SPY, QQQ, …) used by the
-- "Performance vs Market" overlay on the dashboard hero chart.
--
-- The series is global (not per-user) — anyone authenticated can SELECT.
-- Writes only happen through the service-role edge function, which
-- bypasses RLS, so no INSERT/UPDATE policies are needed.

CREATE TABLE public.benchmark_prices (
  ticker     text NOT NULL,
  date       date NOT NULL,
  close_usd  numeric NOT NULL,
  updated_at timestamptz DEFAULT now(),
  PRIMARY KEY (ticker, date)
);

CREATE INDEX idx_benchmark_prices_ticker_date
  ON public.benchmark_prices(ticker, date);

ALTER TABLE public.benchmark_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY benchmark_prices_select
  ON public.benchmark_prices FOR SELECT TO authenticated USING (true);
