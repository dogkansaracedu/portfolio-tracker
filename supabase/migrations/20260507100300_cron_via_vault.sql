-- Supabase Cloud restricts `ALTER DATABASE`/`ALTER ROLE ... SET app.*`
-- (permission denied for non-superuser roles). Use Supabase Vault for both
-- the X-Cron-Token shared secret and the Edge Functions base URL.
--
-- Required vault secrets (set once per environment via SQL Editor):
--   SELECT vault.create_secret('<token-hex>',
--                              'cron_token',
--                              'X-Cron-Token for take-snapshots');
--   SELECT vault.create_secret('https://<ref>.supabase.co/functions/v1',
--                              'functions_url',
--                              'Edge Functions base URL for cron callbacks');
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
