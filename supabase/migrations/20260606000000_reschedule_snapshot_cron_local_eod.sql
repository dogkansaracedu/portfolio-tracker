-- Reschedule the daily snapshot cron to the END of the home day (Istanbul).
--
-- snapshot_date is already stamped in the home timezone (Europe/Istanbul) by
-- both the client (homeDayIso) and the take-snapshots edge function. The cron,
-- however, still fired at 23:55 UTC = 02:55 Istanbul — so the once-a-day
-- fallback snapshot captured the portfolio near the START of the local day, not
-- its close. Move it to 20:55 UTC = 23:55 Istanbul so the daily "close"
-- snapshot reflects the full local day. (Baseline selection is now date-based
-- and timezone-correct regardless, see buildDailyReturnLookups — this only
-- improves what an idle day's fallback snapshot represents.)

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'daily-portfolio-snapshot') THEN
    PERFORM cron.unschedule('daily-portfolio-snapshot');
  END IF;
END $$;

SELECT cron.schedule(
  'daily-portfolio-snapshot',
  '55 20 * * *', -- 23:55 Europe/Istanbul (UTC+3)
  $cron$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'functions_url') || '/take-snapshots',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Cron-Token', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_token')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $cron$
);
