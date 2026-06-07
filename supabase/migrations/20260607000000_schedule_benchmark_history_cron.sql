-- Daily refresh for the benchmark index history (SPY / QQQ).
--
-- `benchmark_prices` is written ONLY by the `fetch-benchmark-history` edge
-- function, and until now nothing invoked it on a schedule — it was seeded
-- once by hand when the feature shipped, so the dashboard's "vs Market"
-- overlay (closesAtOrBefore forward-fill) re-used the last stored close for
-- every day after the seed and rendered a flat line. Wire the same pg_cron +
-- Vault pattern the daily snapshot uses so the series tracks the market.
--
-- Unlike the snapshot cron, NO `X-Cron-Token` is needed: the function ignores
-- its request body, writes hardcoded tickers via the service-role key, and is
-- configured `verify_jwt = false`. It pulls Yahoo's full 10y range and upserts
-- (onConflict ticker,date), so a single run also backfills any gap and the job
-- is idempotent — a weekend/holiday run just re-writes the prior close.
--
-- 21:30 UTC fires just after the US market close (16:00 ET, both DST regimes)
-- so Yahoo already has the latest daily close. It is independent of the
-- 20:55-UTC `daily-portfolio-snapshot` job.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'daily-benchmark-history') THEN
    PERFORM cron.unschedule('daily-benchmark-history');
  END IF;
END $$;

SELECT cron.schedule(
  'daily-benchmark-history',
  '30 21 * * *', -- 21:30 UTC, just after the US market close (16:00 ET)
  $cron$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'functions_url') || '/fetch-benchmark-history',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $cron$
);
