# Component 15: Campaigns — Technical (this build)

> Layer: React/Vite/Supabase implementation. Contract → [../15-campaigns.md](../15-campaigns.md)

## Stack

- **Supabase Postgres** — two global tables (`campaign_research_runs`,
  `campaigns`), shared-read RLS, no client write policy (service-role writes
  only, same pattern as `price_cache`).
- **Supabase Edge Functions (Deno)** — `research-campaigns` (the scheduled
  producer) and `ingest-campaigns` (the token-secured door for any external
  producer). Both funnel through one shared validate+insert module.
- **pg_cron + pg_net + Vault** — weekly trigger, reusing the existing
  `functions_url` / `cron_token` vault secrets and `X-Cron-Token` convention.
- **Tavily Research API** (primary engine) — one hosted deep-research call per
  run (`POST /research`, `output_schema`-constrained, watch-list
  `include_domains`), polled via self-chaining hops. Free tier: 1,000
  credits/month; a research call costs 4–110 (mini) / 15–250 (pro) credits.
- **Gemini API** (fallback engine) — `gemini-3.6-flash` with the free
  `url_context` tool (reads the watch-list pages; no search). Selected via
  `CAMPAIGN_RESEARCH_ENGINE=gemini`.
- Frontend: React context provider (repo convention: shared server data never
  fetch-on-mount per call site), shadcn/ui cards, BigNumber.js for estimates.

## File map

| Path | Role |
|---|---|
| `supabase/migrations/20260817120000_campaigns.sql` | Tables + RLS + weekly cron. |
| `supabase/functions/_shared/campaigns.ts` | **Dependency-free pure TS** (zero imports — loadable by both Deno and Vite/Vitest): `CAMPAIGN_PROGRAM_TYPES`, `APR_KINDS`, `PLATFORM_WATCH_LIST`, `CampaignInput`/`CampaignBatch` types, `validateCampaignBatch(payload)` → `{ valid, rejected }`, `canonicalPlatformName(raw)`, `consolidateCampaigns(rows)` → `{ campaigns, merged, floored }`, `CAMPAIGN_MIN_APR_PCT`. |
| `supabase/functions/_shared/campaign-store.ts` | Persistence half (needs the Supabase client, so it can't live in the import-free module): `insertCampaignBatch`, `recordFailedRun`, `fetchLatestSuccessfulRows`, run-status/producer constants. Both functions insert through it. |
| `supabase/functions/ingest-campaigns/index.ts` | POST door: checks `Authorization: Bearer <CAMPAIGN_INGEST_TOKEN>` (500 if env unset, 401 mismatch, 405 non-POST), validates via `validateCampaignBatch` (zero valid rows → 422 with reasons), inserts run + rows via `campaign-store`. Honors an optional `producer` string in the payload (default `'ingest'`). |
| `src/lib/campaign-validation.test.ts` | Vitest over `validateCampaignBatch` (imports `_shared/campaigns.ts`, same cross-boundary pattern as `yahoo.test.ts`). |
| `src/lib/campaign-consolidation.test.ts` | Vitest over `consolidateCampaigns` / `canonicalPlatformName` (tier merge, promo distinctness, quality floor, platform-drift grouping). |
| `supabase/functions/research-campaigns/index.ts` | Cron entry (`X-Cron-Token`; also accepts the ingest bearer for manual runs): builds the research task from catalog crypto tickers + `PLATFORM_WATCH_LIST`, runs the selected engine (Tavily research with self-chaining polling, or 3 Gemini url_context/search sweeps), funnels through the same validate+insert. |
| `src/types/database.ts` | `CampaignResearchRun`, `Campaign` row interfaces (hand-synced, as ever). |
| `src/lib/constants/campaigns.ts` | UI-side constants: program-type display labels, APR-kind affixes, `CAMPAIGN_STALENESS_DAYS = 10`, `DEADLINE_SOON_DAYS = 7`, `CAMPAIGN_RUN_STATUS`, table names, and all page copy (`CAMPAIGN_COPY`). Re-exports `CampaignProgramType` / `AprKind` **as types only** from `_shared/campaigns.ts` (backend truth, zero bundle cost) — `database.ts` imports them from here. |
| `src/lib/campaigns.ts` | Pure grouping/estimate logic: `groupCampaigns(campaigns, heldTickers, estimateFor?)` → the three buckets; `estimateYearlyUsd(qty, priceUsd, aprPct)` (BigNumber, null when any input is missing/zero); `isExpired` / `partitionExpired` / `isDeadlineSoon` / `isRunStale` / `formatApr`. |
| `src/lib/campaigns.test.ts` | Vitest: grouping rules, estimate math, expired filtering. |
| `src/lib/queries/campaigns.ts` | `fetchLatestCampaigns()` → latest successful run + its rows. |
| `src/contexts/CampaignsContext.tsx` | Provider: loads once per session, exposes `{ run, campaigns, loading, error, refresh }`. |
| `src/pages/CampaignsPage.tsx` | The three-group page. Each card also carries a **"Track"** button (Component 16): it opens the shared interest-position dialog prefilled from the campaign. Capture only — the page never lists or manages positions. See [technical/16-interest.md](16-interest.md). |
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
  is_stablecoin      boolean NOT NULL DEFAULT false,  -- stable-value: stablecoin OR tokenized gold (PAXG/XAUT)
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
ticker/platform/program_type/source_url; ticker not a single specific symbol
(`^[A-Z0-9]{2,12}$` — kills aggregates like "STABLECOINS (UNSPECIFIED)");
`program_type` not in
`CAMPAIGN_PROGRAM_TYPES`; `apr` present but outside `(0, 1000]`; `apr` present
without valid `apr_kind`; neither `apr` nor `reward_description`; `source_url`
not parseable as http(s) URL; `deadline`/`fetched_at` not `YYYY-MM-DD` or calendar-invalid; non-object rows;
present-but-unparseable numerics.
Normalization: tickers upper-cased/trimmed, platform trimmed, apr rounded to 4
dp, numeric strings from models coerced (`"4.25%"` → `4.25`),
`amount_currency` upper-cased, `lock_days` truncated to integer. Batch-level:
zero valid rows → the whole batch fails (run recorded as `failed`, previous
data untouched).

## Consolidation (`consolidateCampaigns`)

Runs after validation in **both** doors (`ingest-campaigns` and
`research-campaigns`) — added 2026-08-28 after a producer pushed 240 rows
(one per lock tier, plus 0.02%-APR base rates) through the ingest door, which
only validated row shape. Pure, import-free, Vitest-covered.

1. **Platform canonicalization** — `canonicalPlatformName(raw)` snaps each
   row's platform to the watch list's `shortName` (new `WatchListEntry` field,
   with optional `aliases`), matching short name / long prompt name (with or
   without its "—" suffix) / aliases case-insensitively. Unknown platforms
   pass through trimmed.
2. **Tier merge** — apr-bearing rows of ladder types (`flexible_earn`,
   `locked_earn`, `staking`, `hold_to_earn`) group by
   `(ticker, platform, program_type)`; a group keeps its highest-APR row's
   fields, sets `apr_kind: "up_to"` when tiers differ, and appends
   `Tiers: 30d 2.13% / … ` (sorted by `lock_days`, 0/null labeled `flex`) to
   `conditions`. Prose-only rows never join a ladder.
3. **Event dedupe** — promo/launchpool/airdrop and prose-only rows are
   distinct opportunities; only rows identical on
   (ticker, platform, type, apr, apr_kind, deadline, reward_description,
   conditions) collapse.
4. **Quality floor** — after merging, rows with
   `apr < CAMPAIGN_MIN_APR_PCT` (1.5), no `deadline`, and program type in
   (`flexible_earn`, `locked_earn`, `staking`) are dropped as standing base
   rates. Promos/launchpools/airdrops/`hold_to_earn` and prose rows are never
   floored.

Returns `{ campaigns, merged, floored }`; both doors surface the counts
(ingest: response + appended to the run summary; research: a summary note)
and fail the batch (422) if nothing survives. The research function's old
local `dedupeCampaigns` was replaced by this shared path.

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
   splitting stable-value tickers by the `usd` tag / known stable tickers +
   the tokenized-gold tickers (PAXG, XAUT).
3. Engine `tavily` (default): one `POST /research` call — `model` from
   `TAVILY_RESEARCH_MODEL` (default `mini`; `pro` researches deeper for more
   credits), `include_domains` derived from the watch list's ground URLs,
   `output_schema` = the campaign row schema (Tavily's schema dialect:
   every property needs a `description`, union types are rejected — nullable
   fields are modeled as optional single-type fields), and one `input` prompt
   carrying the three collection targets, the watch list with flags, the
   regulatory paragraph, and strict exclusions (no tax/banking/KYC/review
   content; no structured products whose principal can settle in another
   asset — Dual Investment and the like are options strategies, not earn). Research is async: the function polls `GET /research/{id}`
   within a ~100s hop budget, then **self-chains** — fire-and-forget POST to
   itself with `{request_id, hop}` (X-Cron-Token auth, 5s abort; Supabase
   keeps executing after client disconnect) — up to 6 hops before giving up,
   because a pro research outlives the free-tier ~150s function wall clock.
   `regulatory_notes` from the response is appended to the run summary.
4. Engine `gemini` (fallback): up to three `generateContent` sweeps with the
   `url_context` tool by default (`GEMINI_GROUNDING=google_search` restores
   true grounding on billing-enabled keys). Output is fenced-JSON, extracted
   defensively. One failed sweep doesn't kill the run; a run fails only when
   every sweep fails or zero rows validate.
5. Both engines: merge, drop structured-product rows (deterministic regex
   backstop for the prompt exclusion — dual investment/dual currency are
   options strategies, not earn), scrub "Turkey eligibility: unconfirmed"-style
   boilerplate out of `conditions` (regex backstop; the prompt's eligibility
   rule drops explicitly-excluded campaigns and forbids the phrase), run the
   shared `consolidateCampaigns` (see **Consolidation** below — replaces the
   old local higher-APR dedupe), **compute** the change summary in code (diff of
   `ticker@platform` pairs vs the previous successful run — never
   model-written), stamp missing `fetched_at` with today, then validate and
   insert via the write-order pseudo-transaction above. Any thrown error →
   run row with `status='failed'` and the error in `summary`; previous runs
   are never touched.
6. **Freshness guard (cost control):** a non-forced start is skipped while the
   latest successful run is younger than 10 days — the weekly cron therefore
   runs effectively fortnightly (~2 pro researches ≈ 400–500 of the 1,000
   monthly free credits). Manual `{"force": true}` overrides; continuation
   hops are never skipped.

Env (function secrets): `TAVILY_API_KEY`, `TAVILY_RESEARCH_MODEL`
(default `mini`), `CAMPAIGN_RESEARCH_ENGINE` (default `tavily`),
`GEMINI_API_KEY`, `GEMINI_MODEL` (default `gemini-3.6-flash`),
`GEMINI_GROUNDING` (default `url_context`), `CAMPAIGN_INGEST_TOKEN`, plus the
pre-existing `CRON_TOKEN`. `supabase/config.toml`: both functions
`verify_jwt = false` (auth is the token, as with `fetch-prices`).

**Gemini free-tier reality (verified empirically 2026-08-17, overriding the
pricing docs):** `gemini-2.5-flash`/`-lite` — the models with free grounding —
are closed to newly created keys ("no longer available to new users");
`google_search` on 3.x models has zero free quota (instant 429). The free
Gemini path is therefore `gemini-3.6-flash` + `url_context` (page fetch, no
search), which is why Tavily is the primary engine.

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
- Each card's "Track" button hands the campaign to
  [Component 16](../16-interest.md)'s prefill (planned, not built) — Campaigns
  stays capture-only; positions live on the asset pages.
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
| 2b | OKX (global) — Earn + campaigns | cex-global | okx.com/en/earn | Per-campaign Turkey eligibility; TRY services live on OKX TR (added 2026-08-17: global+TR variants both watched) |
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
