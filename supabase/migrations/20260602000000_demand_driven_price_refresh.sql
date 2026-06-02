-- Demand-driven price refresh.
--
-- Prices are now refreshed on demand by the frontend (a visible tab pings
-- `fetch-prices`, which self-throttles per asset) — see PRICE_POLL in
-- src/lib/config.ts and the cadence constants in fetch-prices/index.ts.
--
-- The only thing that still needs a schedule is the daily end-of-day snapshot.
-- Previously the cron called `take-snapshots` directly against whatever was in
-- price_cache, so on a quiet day (no active users to trigger a refresh) the EOD
-- value could be built from stale prices. Repoint the same daily job at
-- `fetch-prices` with `force=true` (refetch everything, bypassing the cadence /
-- guard) and `snapshot=true` (chain `take-snapshots` once prices are fresh).
-- The `X-Cron-Token` is what unlocks force + snapshot and authorizes the
-- chained take-snapshots call. Vault secrets (functions_url, cron_token) are
-- unchanged from the init migration.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'daily-portfolio-snapshot') THEN
    PERFORM cron.unschedule('daily-portfolio-snapshot');
  END IF;
END $$;

SELECT cron.schedule(
  'daily-portfolio-snapshot',
  '55 23 * * *',
  $cron$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'functions_url') || '/fetch-prices',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Cron-Token', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_token')
    ),
    body := '{"force": true, "snapshot": true}'::jsonb,
    timeout_milliseconds := 60000
  );
  $cron$
);
