-- Hourly intraday snapshot cron.
--
-- Mirrors the daily snapshot job (20260602000000): POST fetch-prices with
-- force=true (refetch everything, bypassing the demand-driven cadence/guard so
-- coverage doesn't depend on a user being present) and intraday=true (chain
-- take-intraday-snapshots once prices are fresh). The X-Cron-Token unlocks force
-- and authorizes the chained call. Vault secrets (functions_url, cron_token) are
-- unchanged from the init migration. Runs every hour on the hour, 24/7 — crypto
-- moves overnight; equities simply sit flat outside market hours.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'hourly-intraday-snapshot') THEN
    PERFORM cron.unschedule('hourly-intraday-snapshot');
  END IF;
END $$;

SELECT cron.schedule(
  'hourly-intraday-snapshot',
  '0 * * * *',
  $cron$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'functions_url') || '/fetch-prices',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Cron-Token', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_token')
    ),
    body := '{"force": true, "intraday": true}'::jsonb,
    timeout_milliseconds := 60000
  );
  $cron$
);
