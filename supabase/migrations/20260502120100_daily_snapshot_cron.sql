-- Daily auto-snapshot infrastructure.
-- A pg_cron job pings the take-snapshots Edge Function once per day
-- (23:55 UTC). The function is configured with verify_jwt=false in
-- config.toml so no Authorization header is required. The Edge Function
-- itself uses the service role internally to write snapshots.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Drop any pre-existing schedule with the same name so this migration is
-- idempotent across resets.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'daily-portfolio-snapshot') THEN
    PERFORM cron.unschedule('daily-portfolio-snapshot');
  END IF;
END $$;

-- 23:55 UTC every day. Calls Kong (the local API gateway) over the
-- internal Docker network so the URL works inside the Postgres container.
SELECT cron.schedule(
  'daily-portfolio-snapshot',
  '55 23 * * *',
  $$
  SELECT net.http_post(
    url := 'http://kong:8000/functions/v1/take-snapshots',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
