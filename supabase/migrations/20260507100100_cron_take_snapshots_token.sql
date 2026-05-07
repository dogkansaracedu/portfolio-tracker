-- Re-schedule the daily snapshot cron to send X-Cron-Token. The token
-- value is read from a Postgres GUC `app.cron_token` so the secret never
-- lands in migration history. Set per environment via:
--   ALTER DATABASE postgres SET app.cron_token = '<token>';
-- Audit reference: docs/security-audit-2026-05-04.md M1.

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
    url := 'http://kong:8000/functions/v1/take-snapshots',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Cron-Token', current_setting('app.cron_token', true)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $cron$
);
