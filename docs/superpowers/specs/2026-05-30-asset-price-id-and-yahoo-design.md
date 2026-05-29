# Asset `price_id` + Yahoo crypto pricing — Design

**Date:** 2026-05-30
**Status:** Awaiting review

## Problem

Two coupled issues:

1. **`ticker` is overloaded.** It is both the *display label* and the *price-fetch key*. For crypto/gold tokens the ticker is a CoinGecko id (`bitcoin`, `usd-coin`, `pax-gold`), so the UI shows ugly ids and the fetch key cannot be changed without breaking display, and vice-versa.
2. **A 420-day snapshot gap (2024-04-16 → 2025-05-27).** The backfill skips any date where a held asset is unpriced. CoinGecko's free API only returns ~365 days of daily history, so for that window — when bitcoin/ethereum were held but older than CoinGecko's window at backfill time — every weekly snapshot was dropped. (See investigation in conversation: gap starts 4 days after the first crypto purchase on 2024-04-13, ends at the first weekly grid date inside CoinGecko's 365-day window.)

## Goals

- Separate the **fetch key** (`price_id`) from the **display label** (`ticker`).
- Show **ticker only** in portfolio/transaction rows.
- Move BTC, ETH, PAXG, XAUT pricing to **Yahoo Finance**, which has multi-year daily history (verified: BTC-USD/ETH-USD/PAXG-USD/XAUT-USD all return April-2024 data), so the gap can be filled and never recurs.
- **Break nothing.** Each step is either behaviour-neutral or additive.

## Non-goals (YAGNI)

- No asset-creation/edit UI for `price_id` yet. New assets default `price_id = ticker`; the user will manage namings via a future "asset details" feature.
- Do not drop the stablecoin `$1` hardcode (USDT/USDC) for now.
- Do not delete orphaned `price_cache` rows (re-key them instead).

## The model

The canonical price-fetch identity becomes the pair **(`price_source`, `price_id`)**:

- `price_source` (existing) routes to a provider: `yahoo` | `coingecko` | `tcmb` | `manual`.
- `price_id` (new) is the identifier within that provider (`BTC-USD`, `AAPL`, `bitcoin`, `USD`, `XAU_GRAM`).
- `ticker` (existing) becomes a **display-only** shorthand (`BTC`, `AAPL`, `USDC`).

**Safety invariant:** all fetch sites read `price_id ?? ticker`. Until a row has a non-null `price_id`, behaviour is byte-identical to today. The column is **nullable** with this coalescing fallback (belt-and-suspenders), and existing rows are backfilled.

## Data model changes

### `assets` table
- Add column `price_id text` (nullable).
- Backfill: `UPDATE assets SET price_id = ticker` for all rows.
- Then update the 6 crypto/gold-token rows (table below).
- TS: add `price_id: string | null` to `Asset`; include in `AssetInsert`/`AssetUpdate`.
- Creation paths (`AssetForm`/`useAssets.addAsset`, `ResolveAssetsStepper`) pass `price_id: ticker` explicitly for now.

### Asset row mapping (only these 6 change; all others get `price_id = ticker`)

| old ticker | new ticker | price_id | price_source | fetch behaviour |
|---|---|---|---|---|
| bitcoin | BTC | BTC-USD | yahoo | Yahoo daily history — **fixes gap** |
| ethereum | ETH | ETH-USD | yahoo | Yahoo daily history — **fixes gap** |
| pax-gold | PAXG | PAXG-USD | yahoo | Yahoo daily history |
| tether-gold | XAUT | XAUT-USD | yahoo | Yahoo daily history |
| tether | USDT | tether | coingecko | **unchanged**: live via CoinGecko, backfill `$1` hardcode |
| usd-coin | USDC | usd-coin | coingecko | **unchanged**: live via CoinGecko, backfill `$1` hardcode |

Stocks (`stock_us`, yahoo): `price_id = ticker` (e.g. `AAPL`) — unchanged.
Fiat (`USD`/`EUR`/`TRY`, tcmb) and physical gold (`XAU_GRAM`, tcmb): `price_id = ticker` — unchanged; these are FX/GC=F-derived, not fetched by id.

### `price_cache` table
- No schema change. Its key column (`ticker`) now semantically holds `price_id` values.
- Migration re-keys existing crypto/gold rows so client lookups hit immediately and there is **no unpriced window**:
  - `bitcoin → BTC-USD`, `ethereum → ETH-USD`, `pax-gold → PAXG-USD`, `tether-gold → XAUT-USD`.
  - `tether`/`usd-coin` rows stay as-is (their `price_id` is unchanged).

## Code changes (fetch ⇒ `price_id ?? ticker`)

### `supabase/functions/fetch-prices/index.ts`
- CoinGecko branch: build ids from `price_id ?? ticker` (lowercased); write `price_cache` keyed by `price_id`.
- Yahoo branch: use `price_id ?? ticker` as the symbol; write keyed by `price_id`. BTC/ETH/PAXG/XAUT now flow through here automatically (their `price_source = yahoo`).
- TCMB/special rows (`USD`/`EUR`/`TRY`/`XAU_GRAM`, `GC=F`): unchanged values (their `price_id == ticker`).

### `supabase/functions/take-snapshots/index.ts`
- Build the `price_cache` lookup map keyed by `price_id`; resolve `prices[asset.price_id ?? asset.ticker]`.
- Re-key hardcoded ticker checks onto `price_id`.
- `breakdown.by_asset[].ticker` keeps storing **ticker** (display).

### `supabase/functions/backfill-snapshots/index.ts`
- Group historical fetches by `price_id` (`heldPriceIds`), `priceMaps` keyed by `price_id`.
- Yahoo list = assets with `price_source = yahoo` → stocks + BTC-USD/ETH-USD/PAXG-USD/XAUT-USD, each via `fetchYahooHistory(price_id, …)`. **This is the gap fix.**
- CoinGecko list = `price_source = coingecko` minus stablecoins → effectively empty after migration; `days=365` cap no longer affects any held asset's history.
- Re-key special-cases onto `price_id`: `USD`/`TRY`/`EUR` FX, `XAU_GRAM` (GC=F), `$1` hardcode for `tether`/`usd-coin`.

### Client (`src/lib/queries/prices.ts`, `PricesContext`, consumers)
- `price_cache` map stays keyed by its key column (now `price_id` values).
- Price lookups change from `prices[asset.ticker]` to `prices[asset.price_id ?? asset.ticker]`.
- Stale-asset detection keyed the same way.

## UI changes (ticker only)

- **Portfolio rows** (`PortfolioRow`) and **transaction rows** (`TransactionRow`), plus dashboard list displays (`TopMovers`): show **ticker** as the row identifier; stop rendering the full `name` as the row label.
- **Boundary (please confirm):** search/autocomplete (`AssetSearchSelect`, `TransactionFilters`) **keep** showing/searching `name` so assets remain findable by typing their name. "Ticker only" applies to display rows, not search affordances.
- `AssetForm` ticker hints: reword away from "Use CoinGecko ID …" since ticker is now display-only. No `price_id` input added yet.

## Rollout

1. Apply migration (add `price_id`, backfill, set the 6 rows, re-key `price_cache`).
2. Deploy edge functions + frontend.
3. Invoke `fetch-prices` once to confirm fresh `price_cache` rows under the new keys.
4. Re-run backfill (Settings → Historical Snapshots) with **overwrite = true**, monthly granularity. This:
   - inserts the previously-skipped weekly dates 2024-04-16 → 2025-05-27 (gap filled), and
   - rewrites the whole series from one consistent source (Yahoo) so there is no methodology seam where CoinGecko used to start.
5. Verify: query `snapshots`, confirm the 420-day gap is gone and counts increased.

## Risks / mitigations

- **Transient unpriced window** → avoided by re-keying `price_cache` in the migration and running `fetch-prices` before users load.
- **Yahoo symbol missing for a token** → not the case (all 4 verified); fallback would be to keep that asset on CoinGecko (`price_id = <coingecko id>`, `price_source = coingecko`).
- **New asset created without `price_id`** → `price_id ?? ticker` fallback keeps old behaviour; creation paths also set it explicitly.
- **Yahoo vs CoinGecko price differences** at the old seam → eliminated by the overwrite re-run (uniform source).

## Verification

- SQL: gap query (`LAG()` over `snapshot_date`) shows no >7-day gaps except genuinely empty-portfolio periods; snapshot count rises by ~60.
- Spot-check a mid-gap snapshot (e.g. 2024-09-01) now exists with a sensible `total_usd` and crypto in `breakdown`.
- UI: rows render ticker; assets still findable by name in search.
