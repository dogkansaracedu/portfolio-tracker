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
| `supabase/functions/fetch-historical-rate/index.ts` | On-demand TCMB fetch for **one past date** (non-USD transactions). Walks back ≤7 days to the nearest published rate; upserts `exchange_rates`. Signed-in users only (401 otherwise; no cron caller). |
| `supabase/functions/_shared/caller.ts` + `_shared/auth.ts` | Edge-function caller check. `verify_jwt` is **not** an auth check here — the anon key is a valid JWT and ships in the public bundle. `authorizeRequest(req, { allowCron })` resolves the caller to the cron (`X-Cron-Token` = `CRON_TOKEN`, only when allowed) or a signed-in user (`auth.getUser(jwt)`); anything else is `denied` → `unauthorizedResponse` (401). `getCallerClient(req, jwt)` is a client acting as that user through RLS. The pure decision (`caller.ts`) is unit-tested in `src/lib/queries/caller.test.ts`. |
| `supabase/functions/_shared/yahoo.ts` | `fetchYahooQuote(symbol)` — single Yahoo chart-endpoint quote; requests `interval=5m&range=1d&includePrePost=true` and derives the price via the pure `pickLatestPrice` (newer of `regularMarketPrice@regularMarketTime` vs the last non-null intraday close@its candle time — so pre/after-hours prints surface); reads `meta.currency`; never throws (returns `{ status, quote: null }` on failure). Unit-tested in `src/lib/queries/yahoo.test.ts`. |
| `supabase/functions/_shared/tefas.ts` | `fetchTefasQuote(fonKodu)` — single TEFAS fund NAV: the newest `periyod:1` row **with a positive `fiyat`** (`pickLatestNav`; TEFAS lists today's row as `fiyat: 0` until the NAV is published, and a zero booked as a price froze every snapshot writer behind the unpriced guard, 2026-09-17/18). `fetchTefasHistory` drops zero rows the same way (`hasNav`). Always TRY; never throws. Unit-tested in `src/lib/queries/tefas.test.ts`. |
| `supabase/functions/_shared/currency.ts` | `splitPrice(price, currency, rates)` → `{ price_usd, price_try }` per source currency; `null` for unsupported (e.g. `GBp`). `categoryForQuote`. |
| `supabase/functions/_shared/constants.ts` | `HOME_TIMEZONE` (`Europe/Istanbul`, for BIST hours), `TROY_OZ_GRAMS` (oz→gram gold). |
| `supabase/functions/_shared/client.ts` | `getServiceClient()` — service-role Supabase client. |
| `supabase/functions/_shared/cors.ts` | `corsHeaders(origin)`. |
| `supabase/functions/widget-data/index.ts` | **Home-screen widget feed** (read-only, `GET`). Caller-JWT auth, reads via RLS; see "Widget feed" below. |
| `supabase/functions/_shared/widget.ts` | Pure helpers for it: `quoteCurrency`, `baselinePrices`, `buildWidgetAssets`, `computeTodayChange`, `newestHeldUpdateMs`, `pickLatestTotal`, `buildWatchlist` (also used by the watchlist page). Unit-tested in `src/lib/queries/widget.test.ts`. |
| `src/contexts/PricesContext.tsx` | App-wide shared price store + the presence-gated polling loop. |
| `src/hooks/usePrices.ts` | Thin re-export of `usePricesContext` as `usePrices` (preserves the original import path). |
| `src/lib/priceId.ts` | `canonicalizeTicker`, `derivePriceId(ticker, category, source)` — key resolution = `price_id ?? ticker`. |
| `src/lib/prices.ts` | Formatters + staleness: `formatCurrency` (symbol prefixed, minus leading, grouping per `CURRENCY_CONFIG` locale), `gainLossClass` / `gainLossToneClass`, `formatSignedCurrency` (the same string as `formatCurrency` — kept as the call-site marker for a P&L figure), `formatMoney` / `formatSignedMoney` (the same pair under the privacy toggle — `obfuscate` over the format, which is the composition every money surface used to write out), `formatSignedPercent`, `formatCompactCurrency`, `isStale`, `getStalenessLevel` (returns `StalenessLevel` from `lib/constants/prices`). Quantities format through `DISPLAY_LOCALE` (`lib/constants/app`). Plus `priceMapsEqual` / `ratesEqual` — value-equality used by the poll's no-op-`setState` guard (see polling loop). |
| `src/lib/queries/prices.ts` | `fetchPrices()` (→ map keyed by fetch-key), `fetchPrice(key)`. |
| `src/lib/queries/exchangeRates.ts` | `fetchLatestRates`, `fetchRateForDate` (nearest ≤ date), `ensureHistoricalRate`, `ensureHistoricalRatesForDates`. |
| `src/components/prices/PriceDisplay.tsx` | Price + colored staleness dot + tooltip. |
| `src/components/prices/PriceRefreshButton.tsx` | "Updated 5m ago" label from `sm` up + spinner; calls `refreshPrices`. Below `sm` it renders the compact age instead (`formatCompactAge` — "2m"/"3h"/"2d", `NO_PRICE_DATA_AGE` when there is nothing), toned by `getStalenessLevel` through `PRICE_STALENESS_TONE_CLASS`. |
| `src/lib/constants/prices.ts` | `PRICE_STALENESS_TONE_CLASS` (fresh/warning/stale — status tones, not the gain/loss palette) + `NO_PRICE_DATA_AGE`. |

## Data layer — edge functions, price cache, rates tables

**Sources:**

- **One function, not one per source.** All live fetching runs through the single
  `fetch-prices` orchestrator plus the `_shared/` modules (`yahoo.ts`,
  `tefas.ts`, `currency.ts`); there are no per-source edge functions.
  `PRICE_SOURCES` (`src/lib/constants/assets.ts`) is `yahoo` / `tcmb` / `tefas` /
  `manual`.
- **TCMB** = central-bank FX. `fetch-prices` pulls `today.xml`, regex-parses
  USD/TRY + EUR/TRY (ForexBuying), derives `eur_usd`, and upserts both
  `exchange_rates` (the dated history) and the `USD`/`EUR`/`TRY` rows of
  `price_cache`. Gram-gold: the XML's `XAU` line is tried first (no-cost path)
  and falls back to Yahoo `GC=F` (USD/oz ÷ `TROY_OZ_GRAMS`); either way the
  `XAU_GRAM` row is written, with `source` set to whichever path produced it.
- **Yahoo Finance** = the engine for **stocks (BIST + US), crypto, AND
  tokenized gold** (`BTC-USD`, `ETH-USD`, `PAXG-USD`, `XAUT-USD`). All assets
  with `price_source = 'yahoo'` flow through one loop (`refreshYahooPrices`).
- **Which keys get priced**: `loadPricedSymbols(source)` unions `assets` and
  every user's `watchlist_items` with that `price_source` (Yahoo and TEFAS
  steps), deduped on key with the asset's category winning. A failed
  `watchlist_items` read lands in `errors` and never blocks assets. The forced
  hourly/nightly cron runs go through the same loaders, so watched symbols are
  in them too.
- **TEFAS** = Turkish mutual / money-market funds ("PPF") — **live**. Turkish
  funds (e.g. a *Para Piyasası Fonu* / money-market fund
  such as `TP2` — TERA PORTFÖY PARA PİYASASI (TL) FONU) are not on Yahoo. Their
  daily **NAV** (net asset value = the fund's per-unit price, quoted in **TRY**)
  comes from **TEFAS** (`tefas.gov.tr`), the official Turkish fund platform.
  Endpoint:
  ```
  POST https://www.tefas.gov.tr/api/funds/fonFiyatBilgiGetir
  Content-Type: application/json
  body: {"fonKodu":"TP2","dil":"TR","periyod":1}
  → { resultList: [ { tarih:"YYYY-MM-DD", fiyat:<NAV, in TRY>, fonUnvan }, ... ] }
  ```
  - Current price = the latest `resultList` entry **whose `fiyat` is positive** (a `0` is a not-yet-published placeholder, not a price). `periyod` (months) is
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

- `price_cache` — **key column is literally named `ticker` but holds
  `price_id` values**. Columns:
  `price_usd`, `price_try`, `source`, `updated_at`, `baseline_usd`,
  `baseline_try`. UPSERT `onConflict: ticker` from edge functions; client does a
  plain `SELECT *`. The baseline columns are trigger-maintained
  (`price_cache_roll_baseline`, `BEFORE UPDATE`): on the first write of a new
  `Europe/Istanbul` date the outgoing price becomes the baseline, otherwise the
  old baseline is kept whatever the writer sent. See
  [19-watchlist](19-watchlist.md#day-change--price_cache-day-baseline).
- `exchange_rates` — UPSERT `onConflict: date,source`. Columns: `date`,
  `source`, `usd_try`, `eur_try`, `eur_usd`, `gold_gram_try`.

**Key resolution (`price_id ?? ticker`).** Both the Yahoo loop and the client
map are keyed by `price_id ?? ticker`. `derivePriceId` only auto-fills the
mechanical Yahoo cases (BIST → append `.IS`; US stock → ticker as-is); crypto/
gold/fiat keys are set explicitly and otherwise left untouched.

**Currency from the source (`_shared/currency.ts`).** The currency a quote is
denominated in comes from the source, never from a ticker-suffix guess:
`fetchYahooQuote` reports Yahoo's `meta.currency`, `fetchTefasQuote` reports
`TRY` (NAVs are always TRY), and the TCMB step writes its FX/gold rows directly.
Every quote then goes through `splitPrice(price, currency, { usdTry, eurUsd })`,
which fills the `price_usd` / `price_try` columns and keeps the **native** side
raw:

| Source currency | `price_usd` | `price_try` |
|---|---|---|
| `USD` | `p` (raw) | `p × usdTry` |
| `TRY` | `p ÷ usdTry` | `p` (raw) |
| `EUR` | `p × eurUsd` | `p × eurUsd × usdTry` |

Any other currency (e.g. `GBp` = pence) returns `null` — the caller **skips the
upsert and pushes an error** into the response rather than mislabeling a foreign
price as USD. A missing rate yields `null` for only the column it can't compute.
`categoryForQuote(currency)` in the same module classifies a quote as
`stock_bist` (TRY) vs `stock_us` (anything else). When the FX step is
skipped/failed, `ensureConversionRates` loads the last `usd_try`/`eur_usd` from
`exchange_rates` so conversions still resolve.

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
  fire-and-forget helper. A signed-in user's ping (the app's poll, the widget
  feed) can **only** trigger a normal throttled refresh — it can't force or
  chain a snapshot. Any other caller (no token, the public anon key, a service
  key) gets **401** before any work: `authorizeRequest(req, { allowCron: true })`
  from `_shared/auth.ts`.

**Client polling loop (`PricesContext`):** `PricesProvider` owns the single
shared price store; `usePrices` is a thin consumer of it, never a per-call-site
fetch. While a tab is **visible** and a user is signed in:

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
  reference when nothing changed**, so the store only emits a new reference when
  a price/rate actually moved. Without the guard, every 10s tick would replace
  `prices`/`rates` with fresh object references, cascading new identities through
  `usePnL` → `usePortfolio`'s memo chain → a full `PortfolioTable` re-render
  (and re-running `SnapshotsContext`'s effect) on every tick — a visible
  "portfolio refreshes itself" flicker.

**Historical-rate backfill.** `ensureHistoricalRate` (single non-USD tx) and
`ensureHistoricalRatesForDates` (bulk import) invoke `fetch-historical-rate`
best-effort; failures leave the nearest-prior-rate fallback
(`fetchRateForDate` / `getExchangeRateForDate`) in place.

## Widget feed — `widget-data`

`GET {SUPABASE_URL}/functions/v1/widget-data` with `Authorization: Bearer <user
access token>` + `apikey: <anon key>` (the Android widget signs in with
`signInWithPassword`, like the PWA). `verify_jwt = true` in `config.toml`, but
the anon key passes that too, so the function calls `_shared/auth.ts` →
`authorizeRequest(req, { allowCron: false })` (401 unless the Auth server
accepts the token as a user) and builds the client with `getCallerClient(req,
jwt)` (anon key + the caller's token), so **every read goes through RLS as that
user** — no service role, no extra secrets. Writes nothing.

Response:
```json
{ "asOf": "…", "pricesRefresh": "none|done|background",
  "total": { "valueTry", "valueUsd", "changeTry", "changePct", "snapshotAt" },
  "assets": [ { "ticker", "name", "price", "priceCurrency", "changePct",
                "valueTry", "updatedAt", "stale" } ],
  "watchlist": [ { "ticker", "name", "price", "priceCurrency", "changePct",
                   "updatedAt", "stale" } ] }
```

- **Assets**: active `holdings` with `balance > 0`, summed per ticker across
  platforms; price from `price_cache[price_id ?? ticker]` (TRY falls back to
  `price_usd × latest usd_try`); `priceCurrency` mirrors `assetNativeCurrency` +
  the portfolio row's EUR→USD fallback; `valueTry = quantity × price_try` (stale
  prices still count); `stale` = `updated_at` older than 30 min (`isStale`'s
  default). Sorted by `valueTry` desc.
- **Total**: `pickLatestTotal` of the latest `intraday_snapshots` row
  (`captured_at`) and the latest `snapshots` row (`created_at` — the daily row
  has no updated-at, so this is its first write); `snapshotAt` is that time.
  Not recomputed from holdings × prices (dashboard rule). `null`s when the user
  has no snapshot yet.
- **Change**: baseline = latest `snapshots` row with `snapshot_date < today`
  (`HOME_TIMEZONE`), per ticker from `breakdown.by_asset` — TRY unit price =
  `value_try ÷ amount` (falls back to `price_usd × rates.usd_try`), USD =
  `price_usd`. `computeTodayChange` = Σ qty × (now − prev) in TRY over tickers
  with a baseline; `changePct` ÷ Σ qty × prev. Per-asset `changePct` compares in
  `priceCurrency`. `price_cache` keeps no previous close, so the snapshot is the
  only baseline.
- **Watchlist**: `watchlist_items` (RLS, `order sort_order, created_at`) →
  `buildWatchlist`: price from `price_cache[price_id]` in the item's stored
  `currency` (TRY falls back to `price_usd × usd_try`), `changePct` against the
  row's own `baseline_usd/try` in that currency (null without one), same
  `stale` rule. A read error → `[]` (logged). `price_cache` is read with `*` so
  the feed survives a deploy that precedes the migration.
- **Freshness**: if the newest `updated_at` among held prices is older than
  `REFRESH_AFTER_MS` (15 min), POST `fetch-prices` with the caller's own headers
  (no cron token → the normal throttled refresh) and wait up to
  `REFRESH_WAIT_MS` (3.5 s). Done in time → re-read `price_cache`
  (`pricesRefresh: "done"`); else hand the promise to `EdgeRuntime.waitUntil`
  and answer from cache (`"background"`). With the app closed the hourly cron
  keeps prices ≤ ~1 h old, and a full refresh (Yahoo 1 s apart per due symbol)
  usually exceeds the wait, so the *next* poll gets the fresh prices. The total
  stays at the last snapshot until the next hourly intraday write.

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
- **Manual entry has no dedicated component.** `price_source = 'manual'` is
  honored by routing (only `yahoo` / `tcmb` / `tefas` rows are auto-fetched), but
  `src/components/prices/` holds only `PriceDisplay` + `PriceRefreshButton`;
  manual price values are set via the asset form path.
- **Two `HOME_TIMEZONE` definitions** (edge `_shared/constants.ts` and
  `src/lib/config.ts`) — separate runtimes, must be kept in sync.
- **Currency toggle (USD/TRY)** is a separate concern in `DisplayContext`, not in
  this engine.

## Setup / commands

None required for the client. Edge functions deploy with the rest of the Supabase
functions; the daily forced refresh + snapshot chain is wired via the cron in
Component 10 (it must send a valid `X-Cron-Token`).
