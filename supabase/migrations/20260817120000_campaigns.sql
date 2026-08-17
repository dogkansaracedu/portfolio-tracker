-- Campaigns (Component 15) — global earn/reward opportunities found by an
-- automated research pass.
--
-- Two tables, both GLOBAL (no user_id): one research run produces a batch of
-- campaign rows that serves every user, exactly like `price_cache` / the asset
-- catalog. Personalization happens at read time by intersecting tickers with
-- the reader's holdings, so nothing user-specific is stored here.
--
-- Runs are append-only history: a new successful run supersedes the previous
-- one ("latest run" = greatest ran_at with status = 'success'), older runs are
-- kept for the audit trail and never edited. A failed run leaves the previous
-- run's data in place, which is why writers insert the run as 'failed' first
-- and only flip it to 'success' once its rows landed — a crash mid-write is
-- then invisible to readers instead of showing a half-written batch.

CREATE TABLE public.campaign_research_runs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ran_at        timestamptz NOT NULL DEFAULT now(),
  producer      text NOT NULL,              -- 'research-campaigns' | 'ingest'
  model         text,                       -- e.g. 'gemini-2.5-flash'
  status        text NOT NULL,              -- 'success' | 'failed'
  summary       text,                       -- change summary vs the previous run
  rejected_rows jsonb,                      -- validation rejects, for debugging
  raw_output    jsonb                       -- raw model output, for debugging
);

CREATE TABLE public.campaigns (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id             uuid NOT NULL REFERENCES public.campaign_research_runs(id) ON DELETE CASCADE,
  -- Free text, upper-cased: a campaign may reward a coin that is not in the
  -- asset catalog (a new listing), so this never becomes an asset_id FK.
  asset_ticker       text NOT NULL,
  platform           text NOT NULL,
  program_type       text NOT NULL,         -- flexible_earn|locked_earn|staking|launchpool|hold_to_earn|promo|airdrop
  apr                numeric,               -- percent, e.g. 3.8; NULL when the reward is prose-only
  apr_kind           text,                  -- 'fixed' | 'variable' | 'up_to' (NULL iff apr NULL)
  reward_description text,                  -- prose reward; a row must have apr OR this
  lock_days          integer,               -- NULL/0 = flexible
  min_amount         numeric,
  max_amount         numeric,
  amount_currency    text,                  -- unit of min/max (e.g. 'USDT', 'ETH')
  conditions         text,                  -- fine print, incl. country eligibility
  deadline           date,
  is_stablecoin      boolean NOT NULL DEFAULT false,
  source_url         text NOT NULL,
  fetched_at         date NOT NULL
);

CREATE INDEX idx_campaigns_run ON public.campaigns(run_id);

ALTER TABLE public.campaign_research_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;

-- Shared read, no write policy: campaign data enters only through the edge
-- functions (service role), so users can read every row and write none.
CREATE POLICY campaign_research_runs_select
  ON public.campaign_research_runs FOR SELECT TO authenticated USING (true);
CREATE POLICY campaigns_select
  ON public.campaigns FOR SELECT TO authenticated USING (true);

-- ─── Weekly research cron ───────────────────────────────────────────
--
-- Mirrors the intraday snapshot job (20260615000100): same vault secrets
-- (functions_url, cron_token) and the same X-Cron-Token convention. Monday
-- 04:00 UTC = 07:00 TRT — a fresh dataset waiting at the start of the week.
-- Fire-and-forget: grounded model calls can outlast the http_post timeout, and
-- the outcome is recorded in campaign_research_runs, not in the cron response.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'weekly-campaign-research') THEN
    PERFORM cron.unschedule('weekly-campaign-research');
  END IF;
END $$;

SELECT cron.schedule(
  'weekly-campaign-research',
  '0 4 * * 1',
  $cron$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'functions_url') || '/research-campaigns',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Cron-Token', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_token')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $cron$
);
