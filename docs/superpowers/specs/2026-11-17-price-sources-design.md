# Price sources per asset (admin-managed, prioritized, with fallback)

Date: 2026-11-17 · Branch: `feat/price-sources` · Status: approved by owner in chat ("ok go")

## Why

Yahoo is slow (1 s throttle per symbol, ~50 s for a full refresh) and its crypto
price is a USD pair converted to TL, not the price the owner actually trades at.
Paribu's public web endpoints give crypto (TL), US and BIST stocks fast and in bulk.
The owner wants to decide, per asset, where its price comes from and in what order,
with the others as fallbacks — from an admin-only screen. The display ticker the
user sees stays separate from each source's symbol.

## Decisions (from the owner)

- Assets are edited only by the admin, on an admin-panel-like page.
- Each asset has an ordered list of price sources: `(source, symbol)`. Priority 1 is
  tried first; on failure the next one is used. Fetchers are code; the admin only
  picks source + symbol per asset.
- Display ticker (`assets.ticker`) is independent from source symbols.
- Crypto from Paribu is fetched **in TL**; USD = TL ÷ our USD/TRY (the TCMB rate the
  FX step already stores).
- Watchlist (Takip listesi) can only contain assets from the catalog. Adding a symbol
  to the watchlist = picking a catalog asset. No more free Yahoo search there.
- Approach A: a separate `asset_price_sources` table (not a JSON column), so each
  source row carries its own health (last ok / last error) for the admin page.

## Approaches considered

- **A. `asset_price_sources` table (picked)** — relational rows, DB constraints,
  per-source health. Slightly more code.
- **B. JSON array on `assets`** — less code, but no per-source status and no DB
  validation. Rejected: the admin page's value is seeing which source broke.
- **Keyed by price key instead of asset** — only needed if the watchlist held
  non-catalog symbols; the owner ruled that out.

## Data model

### `public.asset_price_sources`
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| asset_id | uuid not null → assets(id) on delete cascade | |
| priority | smallint not null, ≥ 1 | unique (asset_id, priority) **deferrable initially deferred** (reorder in one tx) |
| source | text not null, check in (`paribu_crypto`,`paribu_us`,`paribu_bist`,`yahoo`,`tefas`) | |
| symbol | text not null, 1–32 chars | the source's own id (`btc`, `brk.b`, `asels`, `BTC-USD`, `TP2`) |
| last_ok_at | timestamptz | set by fetch-prices on success |
| last_error | text | set by fetch-prices on failure (short message) |
| last_error_at | timestamptz | |
| created_at | timestamptz default now() | |

Unique (asset_id, source, symbol). RLS: select for `authenticated` (catalog is
shared, like `assets_select`); insert/update/delete only `(select public.is_admin())`.
fetch-prices writes health with the service role.

TCMB (fiat, XAU_GRAM) and manual assets get **no** source rows; the FX step keeps
handling TCMB exactly as today. `assets.price_source` and `assets.price_id` stay:
`price_id ?? ticker` remains the **price_cache key** (no reader changes), and
`price_source` keeps driving history backfill (`backfill-snapshots`, Yahoo/TEFAS).

### Insert trigger on `assets`
After insert, if `price_source in ('yahoo','tefas')` and the asset has no source rows,
insert `(price_source, coalesce(price_id, ticker), priority 1)`. Keeps every existing
create path (AssetForm, transaction import stepper) working untouched.

### Seed (in the migration — generic rules only, no tickers in code; public repo)
For every existing asset with `price_source in ('yahoo','tefas')`, key = `coalesce(price_id, ticker)`:
- Paribu row at priority 1 when derivable:
  - category `crypto` or `gold` and key like `%-USD` → `paribu_crypto`, `lower(split_part(key,'-',1))`
  - category `stock_us` and key has no `.` (no foreign exchange suffix) → `paribu_us`, `lower(replace(key,'-','.'))` (BRK-B → brk.b)
  - category `stock_bist` and key like `%.IS` → `paribu_bist`, `lower(split_part(key,'.',1))`
- Existing source (`yahoo`/`tefas`, symbol = key) at priority 2 if a Paribu row was added, else 1.

Paribu rows for symbols Paribu doesn't list will simply fail and fall back; after the
first prod run the owner (or we, with approval) deletes the never-ok ones from the
admin page.

### `watchlist_items`
- Add `asset_id uuid references assets(id) on delete cascade`; backfill by
  `assets.coalesce(price_id,ticker) = watchlist_items.price_id` (all 6 prod rows match);
  then `set not null`; unique (user_id, asset_id).
- Old columns (`ticker,name,category,price_source,price_id,currency`) become nullable and
  are no longer written or read by new code. **Not dropped** in this migration, so the
  currently deployed widget-data / frontend keep working during rollout. A later
  migration drops them.

## Fetching (`fetch-prices`)

Fetchers live in `supabase/functions/_shared/price-sources/` (one module per source
family, pure parse functions unit-tested with Deno):

- `paribu_crypto`: `GET https://web.paribu.com/v2/markets/crypto/assets?category=all&pairSymbol=TL&includeDefi=false&page=1&pageSize=300` → map by `id`; `price` is TL.
  `price_try = price`, `price_usd = price / usdTry`.
- `paribu_us` / `paribu_bist`: bulk `GET https://web.paribu.com/v1/markets/{us|bist}/assets?page=N&pageSize=100&category=all&sort=popular` (pages 1–3, stop when `hasMore` false; only the top 300 are listed), then for symbols not in the bulk result
  `GET https://web.paribu.com/v1/markets/public/assets/{id}?marketType={us|bist}&pairSymbol={USD|TL}` (≤4 concurrent).
  US price is USD, BIST is TL → `splitPrice`.
- `yahoo`, `tefas`: existing `fetchYahooQuote` / `fetchTefasQuote`, Yahoo keeps its 1 s spacing.
- All Paribu requests: timeout ~8 s, browser-like User-Agent, no auth.
  Bulk lists are fetched only if at least one due asset needs that market.

Resolution per due asset (cadence + BIST market-hours gate unchanged, keyed by the
price_cache key): walk its sources by priority; first one that yields a price writes
`price_cache[key]` with `source` = the source name; failures before it record
`last_error`/`last_error_at`; the winner records `last_ok_at`. Sources after the winner
are not touched. Assets sharing a price key are fetched once. Response keeps the same
shape (`updated`, `errors`). Health writes are batched.

Watchlist symbols need no special loading anymore — they are assets.

## Frontend

- **Admin page** (`/admin`, linked from Settings/More only when `isAdmin`; non-admins
  redirected): the asset catalog (moved from Settings) + per-asset **Fiyat kaynakları**
  editor: ordered rows `source · symbol · health (son başarılı / son hata)`, move up/down,
  delete, add. Saving rewrites priorities in one go. Mobile-first.
- **Watchlist add**: search the catalog (ticker/name, client-side over the assets query),
  insert `{asset_id}`. Watchlist rows read ticker/name/category via the asset.
- Glossary/product terms per `CLAUDE.md` (add "Fiyat kaynağı" to GLOSSARY.md, constants module).
- Version: minor bump + CHANGELOG entry.

## widget-data

Watchlist query joins assets (`watchlist_items.select('sort_order, assets(ticker,name,category,price_id)')`);
the feed shape for the Android widget is unchanged (no APK change).

## Non-goals

- No change to history/backfill sources (Yahoo stays for history).
- No news, no OHLC.
- No per-user catalogs; no dropping old watchlist columns yet.
- No prod deploy without the owner: migration + functions are applied only after review.

## Rollout (prod-safe)

1. Full prod dump to `~/Backups/` before anything.
2. `db push --dry-run`, then apply migration; verify row counts unchanged
   (assets 54, holdings 63, transactions 548, snapshots, price_cache) and
   `asset_price_sources` / `watchlist_items.asset_id` populated.
3. Deploy `fetch-prices` + `widget-data`; trigger one run; check every asset priced and
   which sources failed.
4. Merge to main (Vercel deploys frontend; Supabase integration sees the migration already applied).
