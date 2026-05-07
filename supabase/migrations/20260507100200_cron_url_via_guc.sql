-- The previous cron migration (20260507100100) hardcoded the local Kong
-- gateway URL `http://kong:8000/functions/v1/take-snapshots`, which only
-- resolves inside the local Supabase Docker network. On Supabase Cloud the
-- DNS lookup fails, so the cron job's HTTP request never reaches the
-- function.
--
-- This migration re-schedules the daily snapshot using a Postgres GUC
-- `app.functions_url` for the base URL, so each environment can set its
-- own value:
--   Local:  ALTER DATABASE postgres SET app.functions_url = 'http://kong:8000/functions/v1';
--   Cloud:  ALTER DATABASE postgres SET app.functions_url = 'https://<ref>.supabase.co/functions/v1';
--
-- `current_setting(...)` is invoked at every cron run, so updating the
-- GUC takes effect on the next tick (no migration needed).
--
-- Audit reference: docs/security-audit-2026-05-04.md M1 (continued).

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
    url := current_setting('app.functions_url') || '/take-snapshots',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Cron-Token', current_setting('app.cron_token', true)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $cron$
);
