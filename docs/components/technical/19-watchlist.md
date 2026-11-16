# Component 19: Watchlist (Takip listesi) — Technical (this build)

> Layer: React/Vite/Supabase implementation. Contract → [../19-watchlist.md](../19-watchlist.md)

## File map

| Path | Role |
|---|---|
| `supabase/migrations/20261117120000_watchlist.sql` | `watchlist_items` table + owner-only RLS; `price_cache.baseline_usd/baseline_try` + the `price_cache_roll_baseline` trigger. |
| `supabase/functions/_shared/symbol-search.ts` | Pure search half: `normalizeQuery`, `isGoldQuery`, `yahooCandidates`, `isTefasCode`, `displayTicker`, `yahooCategory`, `watchCurrency`, `yahooMatch` / `tefasMatch` / `goldGramMatch` → `SymbolMatch`. Tested in `src/lib/queries/symbol-search.test.ts`. |
| `supabase/functions/resolve-tickers/search.ts` | `searchSymbols(service client, query)` — the IO half. |
| `supabase/functions/resolve-tickers/index.ts` | A `{ query }` body routes to `searchSymbols` and answers `{ results: SymbolMatch[] }`; `{ tickers }` (import) is unchanged. Both paths sit behind the same `authorizeRequest(req, { allowCron: false })` check (401 unless a signed-in user), run before the body is read. |
| `supabase/functions/fetch-prices/index.ts` | `loadPricedSymbols(source)` unions `assets` and `watchlist_items` keys for the Yahoo and TEFAS steps. |
| `supabase/functions/_shared/widget.ts` | `buildWatchlist(items, prices, usdTry, nowMs)` — the one row formula, used by `widget-data` **and** the page. Tested in `src/lib/queries/widget.test.ts`. |
| `supabase/functions/widget-data/index.ts` | Reads `watchlist_items` (RLS) and adds `watchlist` to the response. |
| `src/lib/constants/watchlist.ts` | Route, table, function name, debounce, all copy (`WATCHLIST_COPY`). |
| `src/lib/queries/watchlist.ts` | `fetchWatchlist`, `addWatchlistItem`, `removeWatchlistItem`, `saveWatchlistOrder`, `searchSymbols` (`supabase.functions.invoke("resolve-tickers", { body: { query } })` — the user's session). |
| `src/hooks/useWatchlist.ts` | Page state; optimistic add/remove/move, reload on a failed write (`useReportedWrite`). |
| `src/pages/WatchlistPage.tsx` | The page (route `/watchlist`, lazy). |
| `src/components/watchlist/SymbolSearchDialog.tsx` | Add flow: `Dialog` + `Command` (`shouldFilter={false}`), debounced 500 ms, min 2 chars. |
| `src/lib/constants/navigation.ts` | First `secondaryNavItems` entry (icon `Binoculars`). |

## Data

`watchlist_items`: `id`, `user_id` (default `auth.uid()`), `ticker`, `name`,
`category` (asset vocabulary), `price_source` (`yahoo` / `tcmb` / `tefas` —
`manual` excluded), `price_id` (not null — the `price_cache` key), `currency`
(`USD` / `TRY`), `sort_order`, `created_at`; `UNIQUE (user_id, price_id)`.
RLS: select/insert/update/delete only where `auth.uid() = user_id`, to
`authenticated`. `fetch-prices` reads it with the service role (all users).

How each kind of symbol is keyed:

| Query | `price_source` | `price_id` | `category` | `currency` |
|---|---|---|---|---|
| AAPL | yahoo | `AAPL` | `stock_us` | USD |
| THYAO | yahoo | `THYAO.IS` | `stock_bist` | TRY |
| BTC | yahoo | `BTC-USD` | `crypto` | USD |
| USDTRY | yahoo | `USDTRY=X` | `fiat` | TRY |
| altın | tcmb | `XAU_GRAM` | `gold` | TRY |
| TEFAS code | tefas | the code | `fund` | TRY |

FX goes through Yahoo (`=X`, live) rather than the TCMB rows, which are the
once-a-day official buying rate. `XAU_GRAM` is written by the FX step on every
run regardless of who holds it, so watched gram gold needs no extra fetch.

## Day change — `price_cache` day baseline

`price_cache` keeps no previous close and watched symbols have no snapshot, so
the cache row carries its own baseline. The `BEFORE UPDATE` trigger
`price_cache_roll_baseline`: when `NEW.updated_at` falls on a later
`Europe/Istanbul` date than `OLD.updated_at`, `baseline_usd/try := OLD.price_usd/try`;
otherwise it keeps the old baseline (a writer can't overwrite it). Inserts set
none. The nightly 23:55 forced refresh and the hourly forced refresh price every
key, so the baseline is the previous day's last price — the moment the daily
snapshot freezes for holdings. `buildWatchlist` compares price and baseline in
the item's currency (`changePct = (price − baseline) ÷ baseline × 100`); a TRY
item priced through the `price_usd × usdTry` fallback has no change. Chosen over
the provider's previous close because it is one mechanism for all three
sources, and Yahoo's `chartPreviousClose` for a US stock in the Istanbul
morning is the close *before* the last session, not the day-start price.

## Search

`searchSymbols` normalizes the query (`toUpperCase`, no Turkish locale, so
"altın" → "ALTIN"), answers gram-gold aliases from `price_cache`, otherwise
fires every `yahooCandidates` symbol and (for three characters) one TEFAS fetch
in parallel through `fetchYahooQuote` / `fetchTefasQuote`. Hits convert through
`splitPrice` with the latest `exchange_rates` row (unsupported currency → not
offered) and are upserted into `price_cache` under their key — the same
side effect the ticker path has. Results dedupe on `price_id`. Any Yahoo
`instrumentType` is accepted (indices and futures included);
`CRYPTOCURRENCY` → `crypto`, `CURRENCY` → `fiat`, else `categoryForQuote`.

## Page

`buildWatchlist` is called through a local `watchlistEntries` wrapper (staleness
is age at render time, like `PriceDisplay`). Prices come from the shared
`usePrices` store, so the page follows the app's polling loop and the header's
manual refresh. Reorder writes only the rows whose `sort_order` changed
(their new list index).

## Gotchas

- `widget-data` selects `price_cache` with `*` so it keeps working if deployed
  before the migration; a failed `watchlist_items` read yields `watchlist: []`.
- `fetch-prices` reports a failed `watchlist_items` read in `errors` and keeps
  pricing assets.
- The search writes cache rows for every hit, including ones not picked
  (e.g. the `BTC` ETF when the coin was wanted). They are never refreshed
  unless something references the key.
