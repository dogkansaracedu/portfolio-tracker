-- Send X-Cron-Token on the daily benchmark-history cron.
--
-- fetch-benchmark-history used to accept any caller (verify_jwt = false and no
-- check), so anyone with the public anon key could loop a 10-year Yahoo pull and
-- get the shared egress IP rate-limited. The function now accepts only the cron
-- token or a signed-in user, so its cron must carry the token like the other
-- jobs do. Same schedule (21:30 UTC) and body as 20260607000000.
--
-- Deploy order: apply this migration BEFORE deploying the new function. The
-- old function ignores the extra header, so this side is safe to ship first.

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
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Cron-Token', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_token')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $cron$
);
