# Component 5: Price Engine — Technical (this build)

> Layer: React/Vite/Supabase implementation. Contract → [../05-price-engine.md](../05-price-engine.md)

## Stack

- **Supabase Edge Functions (Deno)** for all upstream fetching (avoids browser
  CORS against TCMB/Yahoo, keeps logic server-side, runs with the service-role
  key for cache writes).
- **React 19 Context + hooks** for the shared client-side price store.
- **Supabase Postgres** tables `price_cache` + `exchange_rates` as the cache.
- Formatting/staleness helpers in plain TS; UI built with shadcn/ui (Tooltip,
  Button) + lucide-react icons.

## File map

| Path | Role |
|---|---|
| `supabase/functions/fetch-prices/index.ts` | **Orchestrator** — single endpoint the frontend pings and the daily cron forces. Runs FX step → Yahoo step → TEFAS step → (cron only) snapshot/intraday trigger. Self-throttles per asset. |
| `supabase/functions/fetch-historical-rate/index.ts` | On-demand TCMB fetch for **one past date** (non-USD transactions). Walks back ≤7 days to the nearest published rate; upserts `exchange_rates`. |
| `supabase/functions/_shared/yahoo.ts` | `fetchYahooQuote(symbol)` — single Yahoo chart-endpoint quote; requests `interval=5m&range=1d&includePrePost=true` and derives the price via the pure `pickLatestPrice` (newer of `regularMarketPrice@regularMarketTime` vs the last non-null intraday close@its candle time — so pre/after-hours prints surface); reads `meta.currency`; never throws (returns `{ status, quote: null }` on failure). Unit-tested in `src/lib/queries/yahoo.test.ts`. |
| `supabase/functions/_shared/tefas.ts` | `fetchTefasQuote(fonKodu)` — single TEFAS fund NAV (latest of `periyod:1`); always TRY; never throws. |
| `supabase/functions/_shared/currency.ts` | `splitPrice(price, currency, rates)` → `{ price_usd, price_try }` per source currency; `null` for unsupported (e.g. `GBp`). `categoryForQuote`. |
| `supabase/functions/_shared/constants.ts` | `HOME_TIMEZONE` (`Europe/Istanbul`, for BIST hours), `TROY_OZ_GRAMS` (oz→gram gold). |
| `supabase/functions/_shared/client.ts` | `getServiceClient()` — service-role Supabase client. |
| `supabase/functions/_shared/cors.ts` | `corsHeaders(origin)`. |
| `src/contexts/PricesContext.tsx` | App-wide shared price store + the presence-gated polling loop. |
| `src/hooks/usePrices.ts` | Thin re-export of `usePricesContext` as `usePrices` (preserves the original import path). |
| `src/lib/priceId.ts` | `canonicalizeTicker`, `derivePriceId(ticker, category, source)` — key resolution = `price_id ?? ticker`. |
| `src/lib/prices.ts` | Formatters + staleness: `formatCurrency`, `gainLossClass`, `formatSignedCurrency`, `formatSignedPercent`, `isStale`, `getStalenessLevel`. Plus `priceMapsEqual` / `ratesEqual` — value-equality used by the poll's no-op-`setState` guard (see polling loop). |
| `src/lib/queries/prices.ts` | `fetchPrices()` (→ map keyed by fetch-key), `fetchPrice(key)`. |
| `src/lib/queries/exchangeRates.ts` | `fetchLatestRates`, `fetchRateForDate` (nearest ≤ date), `ensureHistoricalRate`, `ensureHistoricalRatesForDates`. |
| `src/components/prices/PriceDisplay.tsx` | Price + colored staleness dot + tooltip. |
| `src/components/prices/PriceRefreshButton.tsx` | "Updated 5m ago" label + spinner; calls `refreshPrices`. |

## Data layer — edge functions, price cache, rates tables

**Sources (current reality — drift from older docs):**

- **TCMB** = central-bank FX. `fetch-prices` pulls `today.xml`, regex-parses
  USD/TRY + EUR/TRY (ForexBuying), derives `eur_usd`, and upserts both
  `exchange_rates` (the dated history) and the `USD`/`EUR`/`TRY` rows of
  `price_cache`. Gram-gold: TCMB dropped its `XAU` line, so it now falls back to
  Yahoo `GC=F` (USD/oz ÷ `TROY_OZ_GRAMS`) and writes the `XAU_GRAM` row.
- **Yahoo Finance** = the engine for **stocks (BIST + US), crypto, AND
  tokenized gold** (`BTC-USD`, `ETH-USD`, `PAXG-USD`, `XAUT-USD`). All assets
  with `price_source = 'yahoo'` flow through one loop (`refreshYahooPrices`).
- **CoinGecko is no longer called** by any edge function. `price_source =
  'coingecko'` remains a valid value and stablecoins (`tether`, `usd-coin`)
  still nominally map to it, but the crypto-pricing migration moved BTC/ETH/
  PAXG/XAUT to Yahoo (see
  `docs/superpowers/specs/2026-05-30-asset-price-id-and-yahoo-design.md`). There
  is no longer a `fetch-coingecko` / `fetch-tcmb` / `fetch-yahoo` function — they
  were consolidated into `fetch-prices` + `_shared/`. **The component `README.md`
  index and tech-stack lines still list the old split functions + CoinGecko —
  stale.**
- **TEFAS** = Turkish mutual / money-market funds ("PPF") — **live**. Turkish
  funds (e.g. a *Para Piyasası Fonu* / money-market fund
  such as `TP2` — TERA PORTFÖY PARA PİYASASI (TL) FONU) are not on Yahoo. Their
  daily **NAV** (net asset value = the fund's per-unit price, quoted in **TRY**)
  comes from **TEFAS** (`tefas.gov.tr`), the official Turkish fund platform.
  Verified working endpoint (the legacy `BindHistoryInfo` API was retired in 2026
  and returns `"Method not found or disabled!"`):
  ```
  POST https://www.tefas.gov.tr/api/funds/fonFiyatBilgiGetir
  Content-Type: application/json
  body: {"fonKodu":"TP2","dil":"TR","periyod":1}
  → { resultList: [ { tarih:"YYYY-MM-DD", fiyat:<NAV, in TRY>, fonUnvan }, ... ] }
  ```
  - Current price = the latest `resultList` entry's `fiyat`. `periyod` (months) is
    restricted to `{1,3,6,12,36,60}` and the response is the daily NAV series over
    that window (so it also feeds snapshot backfill). No token / signup.
  - Needs a **server-side fetch** like the others: TEFAS sends no CORS headers and
    WAF-blocks non-browser requests, so `_shared/tefas.ts` sends browser headers
    plus a `Referer` to the fund's analysis page.
  - NAV is TRY-quoted, so it slots through `splitPrice(nav, "TRY", rates)` exactly
    like a BIST quote. `price_source = 'tefas'` assets are handled by the
    `refreshTefasPrices` step in `fetch-prices` (via `_shared/tefas.ts` →
    `fetchTefasQuote`), keyed by `price_id ?? ticker` = the `fonKodu`; cadence
    `FUND_CADENCE_MS` (6h), no market-hours gate. (`fetch-prices` only does the
    live latest-NAV fetch; snapshot **backfill** of past NAV is not wired.)

**Tables:**

- `price_cache` — **key column is literally named `ticker` but now holds
  `price_id` values** (re-keyed by migration, no schema change). Columns:
  `price_usd`, `price_try`, `source`, `updated_at`. UPSERT `onConflict: ticker`
  from edge functions; client does a plain `SELECT *`.
- `exchange_rates` — UPSERT `onConflict: date,source`. Columns: `date`,
  `source`, `usd_try`, `eur_try`, `eur_usd`, `gold_gram_try`.

**Key resolution (`price_id ?? ticker`).** Both the Yahoo loop and the client
map are keyed by `price_id ?? ticker`. `derivePriceId` only auto-fills the
mechanical Yahoo cases (BIST → append `.IS`; US stock → ticker as-is); crypto/
gold/fiat keys are set explicitly and otherwise left untouched.

**Currency from the source.** `fetchYahooQuote` returns `meta.currency`;
`splitPrice` keeps the native column raw and derives the other from `usdTry` /
`eurUsd`. Unsupported currency → upsert skipped + error pushed (never mislabeled
USD). When the FX step is skipped/failed, `ensureConversionRates` loads the last
`usd_try`/`eur_usd` from `exchange_rates` so conversions still resolve.

**Orchestrator throttling (the heart of "demand-driven, not a cron"):**

- `loadFreshness` reads every cached `updated_at` in one query.
- **Global guard** `FETCH_GUARD_MS = 20s` — a non-forced call within 20s of the
  last fetch no-ops (collapses concurrent device/tab pings).
- **Per-asset cadence** — crypto/gold `30s`, stocks `60s`, FX `15min`. A symbol
  is fetched only if older than its cadence. BIST symbols additionally gated by
  `isBistOpen` (Mon–Fri 10:00–18:10 `Europe/Istanbul`).
- Yahoo fetches are **1s apart** (only counting symbols actually fetched — a run
  that only refreshes crypto stays fast).
- **`force`** (cron only, gated on a matching `X-Cron-Token` / `CRON_TOKEN`)
  bypasses guard + cadence + market hours and refetches everything. The cron may
  then chain a snapshot writer (Component 10): `snapshot=true` chains
  `take-snapshots` (daily EOD), `intraday=true` chains `take-intraday-snapshots`
  (hourly totals). Both go through the shared `triggerChainedFunction`
  fire-and-forget helper. Public/frontend pings can **only** trigger a normal
  throttled refresh — they can't force or chain a snapshot.

**Client polling loop (`PricesContext`):** `PricesProvider` hoists the old
per-call `usePrices` hook into one shared instance. While a tab is **visible**
and a user is signed in:

- re-read `price_cache` every `PRICE_POLL.readMs` (`10s`, cheap SELECT) so
  figures stay current;
- ping `fetch-prices` every `PRICE_POLL.triggerMs` (`30s`) — the function decides
  per-asset what's due, so most pings are near-free.

Both pause when `document.visibilityState !== "visible"`; a `visibilitychange`
listener fires an immediate refresh on regaining focus, and one fires on mount.
A logged-out or backgrounded app burns **zero** Supabase/Yahoo calls. The
background ping (`backgroundRefresh`) deliberately does **not** toggle
`refreshing`, so the manual-refresh spinner doesn't blink every cycle; the manual
`refreshPrices` does. `staleAssets` is computed via `isStale` (>30min) and keyed
by `price_id` (internal-only list).

- **No-op-`setState` guard (anti-flicker).** Each `readMs` poll re-fetches the
  cache, but most reads return value-identical rows. `loadPrices` compares the
  fresh data against current state (`priceMapsEqual` / `ratesEqual`, and a plain
  `===` on the newest `updated_at`) via functional updates and **keeps the old
  reference when nothing changed**. Without this, every 10s tick replaced
  `prices`/`rates` with fresh object references, cascading new identities through
  `usePnL` → `usePortfolio`'s memo chain → a full `PortfolioTable` re-render
  (and re-running `SnapshotsContext`'s effect) on every tick — the visible
  "portfolio refreshes itself" flicker. The store now only emits a new reference
  when a price/rate actually moved.

**Historical-rate backfill.** `ensureHistoricalRate` (single non-USD tx) and
`ensureHistoricalRatesForDates` (bulk import) invoke `fetch-historical-rate`
best-effort; failures leave the nearest-prior-rate fallback
(`fetchRateForDate` / `getExchangeRateForDate`) in place.

## Notes & gotchas

- **Yahoo is the only free BIST source** and runs ~15min delayed — accepted.
  Yahoo is also unofficial/fragile (browser User-Agent headers in
  `_shared/yahoo.ts`); the client never throws so one bad symbol can't sink a run.
- **Extended-hours prices come from the intraday candle series, not a meta
  field.** The chart `meta` has no `marketState`/`preMarketPrice`/`postMarketPrice`
  (those live in the crumb-gated `v7/quote` endpoint we deliberately avoid). With
  `includePrePost=true` the pre/after-hours prints appear as candles in
  `indicators.quote[0].close`; `pickLatestPrice` reads the last non-null one. `meta`
  *does* expose `hasPrePostMarketData` (whether the symbol has any) and
  `currentTradingPeriod` (pre/regular/post epoch bounds) if finer logic is ever
  needed. The selection is pure + fixture-tested; `fetchYahooQuote`'s `fetch` is
  mocked in `src/lib/queries/yahoo.test.ts`.
- **Yahoo aggressively rate-limits (HTTP 429) by source IP**, independent of
  market state — a shared/datacenter IP can be throttled even when the data is
  available. `includePrePost` does not change request *count* (still one fetch
  per symbol), only the payload, so it doesn't worsen this.
- **`price_cache.ticker` holds `price_id`, not the display ticker** — the most
  common footgun. Always look up with `prices[asset.price_id ?? asset.ticker]`.
- **Staleness thresholds live in two places**: client `isStale`/`getStalenessLevel`
  (30min / 2h, UI dots) vs. orchestrator cadences (20s/30s/60s/15min, fetch
  gating). They answer different questions — don't unify them.
- **Manual entry**: `price_source = 'manual'` is honored by routing (only
  `yahoo`/TCMB rows are auto-fetched), but there is currently **no**
  `ManualPriceEntry` component under `src/components/prices/` (only `PriceDisplay`
  + `PriceRefreshButton`); manual price values are set via the asset form path.
- **Two `HOME_TIMEZONE` definitions** (edge `_shared/constants.ts` and
  `src/lib/config.ts`) — separate runtimes, must be kept in sync.
- **Currency toggle (USD/TRY)** is a separate concern in `DisplayContext`, not in
  this engine.

## Setup / commands

None required for the client. Edge functions deploy with the rest of the Supabase
functions; the daily forced refresh + snapshot chain is wired via the cron in
Component 10 (it must send a valid `X-Cron-Token`).
