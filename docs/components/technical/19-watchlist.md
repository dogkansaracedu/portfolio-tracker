# Component 19: Watchlist (Takip listesi) — Technical (this build)

> Layer: React/Vite/Supabase implementation. Contract → [../19-watchlist.md](../19-watchlist.md)

## File map

| Path | Role |
|---|---|
| `supabase/migrations/20261117120000_watchlist.sql` | `watchlist_items` table + owner-only RLS; `price_cache.baseline_usd/baseline_try` + the `price_cache_roll_baseline` trigger. |
| `supabase/functions/_shared/symbol-search.ts` | Pure search half: `normalizeQuery`, `isGoldQuery`, `yahooCandidates`, `isTefasCode`, `displayTicker`, `yahooCategory`, `watchCurrency`, `yahooMatch` / `tefasMatch` / `goldGramMatch` → `SymbolMatch`. Tested in `src/lib/queries/symbol-search.test.ts`. |
| `supabase/functions/resolve-tickers/search.ts` | `searchSymbols(service client, query)` — the IO half. |
| `supabase/functions/resolve-tickers/index.ts` | A `{ query }` body routes to `searchSymbols` and answers `{ results: SymbolMatch[] }`; `{ tickers }` (import) is unchanged. Both paths sit behind the same `authorizeRequest(req, { allowCron: false })` check (401 unless a signed-in user), run before the body is read. |
| `supabase/migrations/20261118000000_asset_price_sources.sql` | Adds `watchlist_items.asset_id` (→ `assets`, cascade), backfilled by price key, `not null`, `unique (user_id, asset_id)`; the old per-row pricing columns become nullable (not dropped yet). |
| `supabase/functions/fetch-prices/index.ts` | No watchlist code: watched items are catalog assets and are priced through their `asset_price_sources`. |
| `supabase/functions/_shared/widget.ts` | `buildWatchlist(items, prices, usdTry, nowMs)` — the one row formula, used by `widget-data` **and** the page. Tested in `src/lib/queries/widget.test.ts`. |
| `supabase/functions/widget-data/index.ts` | Reads `watchlist_items` joined to `assets` (RLS) and adds `watchlist` to the response; the currency is `quoteCurrency(asset)`. |
| `src/lib/constants/watchlist.ts` | Route, table, all copy (`WATCHLIST_COPY`). |
| `src/lib/queries/watchlist.ts` | `fetchWatchlist` / `addWatchlistItem` select `id, user_id, asset_id, sort_order, created_at, asset:assets(id, ticker, name, category, price_id, icon_url)` → `WatchlistRow`; insert is `{ asset_id, sort_order }`. `removeWatchlistItem`, `saveWatchlistOrder`. |
| `src/lib/watchlist.ts` | Pure: `foldSearchText` (lower-case `tr`, Turkish letters → ASCII), `filterCatalog(assets, query, watchedIds)` (active, non-currency, unwatched; exact ticker → ticker prefix → ticker/name contains), `watchItemFromAsset` (→ `WidgetWatchItem`: `price_id ?? ticker`, `quoteCurrency(asset)` — the same mapping `widget-data` uses). Tested in `src/lib/watchlist.test.ts`. |
| `src/hooks/useWatchlist.ts` | Page state; `add(assetId)`, optimistic remove/move, reload on a failed write (`useReportedWrite`). |
| `src/pages/WatchlistPage.tsx` | The page (route `/watchlist`, lazy). Rows read `item.asset`. |
| `src/components/watchlist/CatalogSearchDialog.tsx` | Add flow: `Dialog` + `Command` (`shouldFilter={false}`) over `useAssets()` filtered by `filterCatalog` on every keystroke (no server call); each result's price comes from `buildWatchlist` so it matches the row. |
| `src/lib/constants/navigation.ts` | First `secondaryNavItems` entry (icon `Binoculars`). |

## Data

`watchlist_items`: `id`, `user_id` (default `auth.uid()`), `asset_id` (not
null → `assets`, `on delete cascade`), `sort_order`, `created_at`;
`UNIQUE (user_id, asset_id)`. RLS: select/insert/update/delete only where
`auth.uid() = user_id`, to `authenticated`. Ticker, name, category and the
price key come from the joined catalog asset (readable by every signed-in
user); the price is `price_cache[price_id ?? ticker]`, priced by `fetch-prices`
like any asset.

Legacy columns from v0.26.0 — `ticker`, `name`, `category`, `price_source`,
`price_id`, `currency` and `UNIQUE (user_id, price_id)` — are still present but
nullable and neither written nor read by current code; a later migration drops
them. Migration `20261118000000` backfilled `asset_id` by matching
`coalesce(assets.price_id, assets.ticker) = watchlist_items.price_id` and
aborts if any row has no matching asset (rather than deleting it).

`XAU_GRAM` is written by the FX step on every run regardless of who holds it,
so watched gram gold needs no extra fetch.

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

`buildWatchlist` is called through a local `watchlistEntries` wrapper over
`items.map(i => watchItemFromAsset(i.asset))` (staleness is age at render time,
like `PriceDisplay`). Prices come from the shared
`usePrices` store, so the page follows the app's polling loop and the header's
manual refresh. Reorder writes only the rows whose `sort_order` changed
(their new list index). The app no longer calls the `resolve-tickers`
`{ query }` search (the old `SymbolSearchDialog` / `searchSymbols` are gone).

## Gotchas

- `widget-data` selects `price_cache` with `*` so it keeps working if deployed
  before the migration; a failed `watchlist_items` read yields `watchlist: []`.
- The search writes cache rows for every hit, including ones not picked
  (e.g. the `BTC` ETF when the coin was wanted). They are never refreshed
  unless something references the key.
