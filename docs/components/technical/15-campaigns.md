# Component 15: Campaigns — Technical (this build)

> Layer: React/Vite/Supabase implementation. Contract → [../15-campaigns.md](../15-campaigns.md)

## Stack

- **Supabase Postgres** — two global tables (`campaign_research_runs`,
  `campaigns`), shared-read RLS, no client write policy (service-role writes
  only, same pattern as `price_cache`).
- **Supabase Edge Functions (Deno)** — `research-campaigns` (the scheduled
  producer, calls the Gemini API with Google Search grounding) and
  `ingest-campaigns` (the token-secured door for any external producer). Both
  funnel through one shared validate+insert module.
- **pg_cron + pg_net + Vault** — weekly trigger, reusing the existing
  `functions_url` / `cron_token` vault secrets and `X-Cron-Token` convention.
- **Gemini API** — `gemini-2.5-flash` with the `google_search` tool (free-tier
  grounding); model name is env config so it can be flipped without a deploy.
- Frontend: React context provider (repo convention: shared server data never
  fetch-on-mount per call site), shadcn/ui cards, BigNumber.js for estimates.

## File map

| Path | Role |
|---|---|
| `supabase/migrations/20260817120000_campaigns.sql` | Tables + RLS + weekly cron. |
| `supabase/functions/_shared/campaigns.ts` | **Dependency-free pure TS** (zero imports — loadable by both Deno and Vite/Vitest): `CAMPAIGN_PROGRAM_TYPES`, `APR_KINDS`, `PLATFORM_WATCH_LIST`, `CampaignInput`/`CampaignBatch` types, `validateCampaignBatch(payload)` → `{ valid, rejected }`. |
| `supabase/functions/_shared/campaign-store.ts` | Persistence half (needs the Supabase client, so it can't live in the import-free module): `insertCampaignBatch`, `recordFailedRun`, `fetchLatestSuccessfulRows`, run-status/producer constants. Both functions insert through it. |
| `supabase/functions/ingest-campaigns/index.ts` | POST door: checks `Authorization: Bearer <CAMPAIGN_INGEST_TOKEN>` (500 if env unset, 401 mismatch, 405 non-POST), validates via `validateCampaignBatch` (zero valid rows → 422 with reasons), inserts run + rows via `campaign-store`. Honors an optional `producer` string in the payload (default `'ingest'`). |
| `src/lib/campaign-validation.test.ts` | Vitest over `validateCampaignBatch` (imports `_shared/campaigns.ts`, same cross-boundary pattern as `yahoo.test.ts`). |
| `supabase/functions/research-campaigns/index.ts` | Cron entry (`X-Cron-Token`): builds prompt from catalog crypto tickers + `PLATFORM_WATCH_LIST`, 3 grounded Gemini calls (holdings-scope / stablecoins / notable sweep), parses JSON, funnels through the same validate+insert. |
| `src/types/database.ts` | `CampaignResearchRun`, `Campaign` row interfaces (hand-synced, as ever). |
| `src/lib/constants/campaigns.ts` | UI-side constants: program-type display labels, APR-kind affixes, `CAMPAIGN_STALENESS_DAYS = 10`, `DEADLINE_SOON_DAYS = 7`, `CAMPAIGN_RUN_STATUS`, table names, and all page copy (`CAMPAIGN_COPY`). Re-exports `CampaignProgramType` / `AprKind` **as types only** from `_shared/campaigns.ts` (backend truth, zero bundle cost) — `database.ts` imports them from here. |
| `src/lib/campaigns.ts` | Pure grouping/estimate logic: `groupCampaigns(campaigns, heldTickers, estimateFor?)` → the three buckets; `estimateYearlyUsd(qty, priceUsd, aprPct)` (BigNumber, null when any input is missing/zero); `isExpired` / `partitionExpired` / `isDeadlineSoon` / `isRunStale` / `formatApr`. |
| `src/lib/campaigns.test.ts` | Vitest: grouping rules, estimate math, expired filtering. |
| `src/lib/queries/campaigns.ts` | `fetchLatestCampaigns()` → latest successful run + its rows. |
| `src/contexts/CampaignsContext.tsx` | Provider: loads once per session, exposes `{ run, campaigns, loading, error, refresh }`. |
| `src/pages/CampaignsPage.tsx` | The three-group page. |
| `src/App.tsx`, `src/components/layout/Sidebar.tsx`, `MobileNav.tsx` | Route `/campaigns` + nav entries. |

## Schema

```sql
CREATE TABLE campaign_research_runs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ran_at        timestamptz NOT NULL DEFAULT now(),
  producer      text NOT NULL,              -- 'research-campaigns' | 'ingest'
  model         text,                        -- e.g. 'gemini-2.5-flash'
  status        text NOT NULL,              -- 'success' | 'failed'
  summary       text,                        -- change summary vs previous run (computed in code)
  rejected_rows jsonb,                       -- validation rejects, for debugging
  raw_output    jsonb                        -- raw model output, for debugging
);

CREATE TABLE campaigns (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id             uuid NOT NULL REFERENCES campaign_research_runs(id) ON DELETE CASCADE,
  asset_ticker       text NOT NULL,          -- upper-cased, free text
  platform           text NOT NULL,
  program_type       text NOT NULL,          -- flexible_earn|locked_earn|staking|launchpool|hold_to_earn|promo|airdrop
  apr                numeric,                -- percent, e.g. 3.8; NULL when reward is prose-only
  apr_kind           text,                   -- 'fixed' | 'variable' | 'up_to' (NULL iff apr NULL)
  reward_description text,                   -- prose reward; row must have apr OR this
  lock_days          integer,                -- NULL/0 = flexible
  min_amount         numeric,
  max_amount         numeric,
  amount_currency    text,                   -- currency/unit of min/max (e.g. 'USDT', 'ETH')
  conditions         text,
  deadline           date,
  is_stablecoin      boolean NOT NULL DEFAULT false,
  source_url         text NOT NULL,
  fetched_at         date NOT NULL
);
CREATE INDEX idx_campaigns_run ON campaigns(run_id);
```

RLS: both tables `SELECT … TO authenticated USING (true)`, **no** write
policies (edge functions use the service role). "Latest run" = greatest
`ran_at` with `status = 'success'`; the client query fetches that run then its
rows — old runs are history, never edited.

Cron (in the same migration, mirroring `20260615000100`): jobname
`weekly-campaign-research`, schedule `0 4 * * 1` (Mon 04:00 UTC = 07:00 TRT),
`net.http_post` to `functions_url || '/research-campaigns'` with the
`X-Cron-Token` header, `timeout_milliseconds := 60000`. The POST is
fire-and-forget — grounded calls can exceed the cron wait; success/failure is
recorded in `campaign_research_runs`, not in the cron response.

## Validation (`validateCampaignBatch`)

Input: `{ producer, model?, summary?, campaigns: CampaignInput[] }`. Per-row
rejects (collected into `rejected`, not thrown): missing
ticker/platform/program_type/source_url; `program_type` not in
`CAMPAIGN_PROGRAM_TYPES`; `apr` present but outside `(0, 1000]`; `apr` present
without valid `apr_kind`; neither `apr` nor `reward_description`; `source_url`
not parseable as http(s) URL; `deadline`/`fetched_at` not `YYYY-MM-DD` or calendar-invalid; non-object rows;
present-but-unparseable numerics.
Normalization: tickers upper-cased/trimmed, platform trimmed, apr rounded to 4
dp, numeric strings from models coerced (`"4.25%"` → `4.25`),
`amount_currency` upper-cased, `lock_days` truncated to integer. Batch-level:
zero valid rows → the whole batch fails (run recorded as `failed`, previous
data untouched).

**Write order (pseudo-transaction).** PostgREST has no multi-statement
transaction, so inserts go: run row with `status='failed'` → campaign rows →
flip run to `success` (+ summary, rejected_rows). Readers only ever query
`status='success'`, so a mid-way crash leaves an inert failed run and the
previous data intact.

## research-campaigns flow

1. Auth: `X-Cron-Token` must equal env `CRON_TOKEN` (same convention as
   `fetch-prices`); also accepts the ingest bearer token so it can be invoked
   manually.
2. Reads catalog: `assets` where `category = 'crypto'` and `is_active`,
   splitting stablecoins by the `usd` tag / known stable tickers.
3. Up to three Gemini calls (`generateContent`, tools: `google_search`):
   catalog-coin offers (skipped when no non-stable active crypto exists),
   stablecoin offers, notable sweep. The API rejects `response_mime_type`
   alongside `google_search`, so output is always fenced-JSON, extracted
   defensively (fenced block → bare `[...]` scan → whole-text parse; unwraps
   `{"campaigns": [...]}`). Each prompt embeds `PLATFORM_WATCH_LIST` with its
   flags, the regulatory-context paragraph, today's date, the exact output
   schema, and demands per-row `source_url` + explicit conditions. One failed
   sweep doesn't kill the run (noted in the summary); a run fails only when
   every sweep fails or zero rows validate.
4. Merges rows, dedupes on `(ticker, platform, program_type)` keeping the
   higher APR, **computes** the change summary in code (diff of
   `ticker@platform` pairs vs the previous successful run: counts + up to 8
   names each, plus failed-sweep/reject notes — never model-written), then
   validates and inserts via the write-order pseudo-transaction above.
   Stablecoin-sweep rows default `is_stablecoin: true`; missing `fetched_at`
   defaults to today. Any thrown error → run row with `status='failed'` and
   the error in `summary`; previous runs are never touched.

Env (function secrets): `GEMINI_API_KEY`, `GEMINI_MODEL`
(default `gemini-2.5-flash`), `CAMPAIGN_INGEST_TOKEN`, plus the pre-existing
`CRON_TOKEN`. `supabase/config.toml`: both functions `verify_jwt = false`
(auth is the token, as with `fetch-prices`).

**Gemini free-tier constraint:** Google Search grounding is free only on
2.5-generation Flash models (500 req/day); on Gemini 3.x it requires a
billing-enabled project. Do not bump `GEMINI_MODEL` to a 3.x model without
enabling billing (then it's 5,000 free searches/month — still $0 at this
cadence). Verified 2026-08 against ai.google.dev/gemini-api/docs/pricing.

## Frontend

- `CampaignsContext` fetches once per session (no polling — data changes
  weekly); `refresh()` re-fetches on demand. Mounted with the other providers.
- Grouping (pure, tested): bucket 1 = ticker ∈ user's held crypto tickers
  (from `HoldingsContext`, balance > 0), sorted by `estimateYearlyUsd` desc;
  bucket 2 = remaining `is_stablecoin` rows; bucket 3 = rest, apr desc,
  rate-less rows last. Expired (`deadline < today`) hidden behind a toggle.
  The toggle re-includes expired rows in their own bucket, badged `Expired`
  and dimmed — not as a separate fourth list.
- Estimates: `qty × price_usd × apr/100` in BigNumber; price from
  `PricesContext`; no estimate when price or apr missing. The page builds one
  entry per held ticker (balance summed across platforms, upper-cased ticker
  key, price looked up as `prices[price_id ?? ticker]`) and closes over it as
  the `estimateFor` callback `groupCampaigns` sorts bucket 1 with.
- Header: run `ran_at` (+ summary), staleness warning past
  `CAMPAIGN_STALENESS_DAYS`; every card shows source link + "found on
  {fetched_at} — verify at source" line; gain-style coloring is **not** used
  (APRs aren't P&L) — neutral styling.

## Platform watch list (`PLATFORM_WATCH_LIST`)

Researched 2026-08-17 (Turkey accessibility + trust verified with sources; see
git history of this doc for the full report trail). Each entry carries a
canonical URL the research prompt grounds on, ordered by usefulness:

| # | Platform | Kind | Ground URL | Flag |
|---|---|---|---|---|
| 1 | Binance (global) — Launchpool / HODLer Airdrops / Megadrop | cex-global | binance.com/en/launchpool + /en/support/announcement | **Per-campaign Turkey eligibility** — each announcement's country list must be checked; TRY services removed but accounts/withdrawals work |
| 2 | OKX TR — Earn + campaigns | cex-turkey | tr.okx.com/en/earn | SPK-listed |
| 3 | Binance TR — Staking ("Biriktir") | cex-turkey | binance.tr/tr/blog | SPK-listed, ~180 earn assets |
| 4 | Paribu — Staking | cex-turkey | paribu.com/blog/en/news/ | SPK-listed; flexible + fixed, incl. TRY-balance rewards |
| 5 | Midas Kripto — liquid staking + promos | cex-turkey | getmidas.com/midas-kripto/ | User's own platform; USDT "staking" is lending-like — SPK risk |
| 6 | Trust Wallet — Launchpool + staking | wallet | trustwallet.com/blog/announcements | Self-custodial hold-to-earn token farms |
| 7 | Bybit (global + TR) — Earn / Launchpool | cex-global | bybit.com/en/earn/home + announcements.bybit.com | Feb-2025 hack (covered) — trust caveat; per-campaign eligibility |
| 8 | Jito — JitoSOL + points seasons | defi | jito.network | Solana LST/airdrop signal |
| 9 | Lido — stETH rate + incentives | defi | lido.fi | ETH LST benchmark |
| 10 | Aave — Merit rewards / rate spikes | defi | app.aave.com | Stablecoin yield benchmark |
| 11 | OKX Web3 Wallet Earn | wallet | web3.okx.com/earn | DeFi campaign aggregator |
| 12 | Icrypex — stake campaigns | cex-turkey | research.icrypex.com/tr/ | Secondary local signal |
| 13 | Kraken — staking assets | cex-global | kraken.com/features/staking-coins | Turkey eligibility unconfirmed — verify in-app before acting |
| 14 | BtcTurk — announcements | cex-turkey | kripto.btcturk.com/en/corporate/announcements | No earn product today; watch for launch |
| 15 | SPK press announcements | regulator | spk.gov.tr/duyurular/basin-duyurulari | Meta-entry: staking/lending rule changes invalidate TR-entity rows |

Excluded (verified, don't re-add without new evidence): **Coinbase** (not
available in Turkey), **Gate** (Turkey on its restricted list), **Bitexen**
(no earn program evidence), **KuCoin TR** (earn scope unclear, second-tier
trust — revisit after its SPK license lands).

Regulatory context the research prompt must encode: Turkish SPK rules ban
customer-asset lending and guaranteed-return promos; **staking is a tolerated
gray zone** on TR entities — a paused/changed TR earn program is itself a
finding, and the run summary must surface any SPK announcement touching
staking/earn.

## Notes & gotchas

- `PLATFORM_WATCH_LIST` lives in `_shared/campaigns.ts` (backend truth — it
  scopes research); the UI never needs it. Keep that module import-free so
  Vitest and Deno both load it.
- Campaign tickers are free text and may not exist in the catalog — join by
  ticker string, never by asset id.
- `numeric` columns are written as strings from Deno too (BigNumber-safe
  convention).
- The ingest door is the vendor-neutral contract: any future producer (e.g. a
  scheduled Claude agent) POSTs the same payload to `ingest-campaigns` and
  needs nothing else.
