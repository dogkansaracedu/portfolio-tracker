# Component 5: Price Engine

## Status: Done

## Overview
Build the price fetching system: Supabase Edge Functions that fetch from TCMB (exchange rates + gold), CoinGecko (crypto), and Yahoo Finance (stocks). Prices cached in `price_cache` and `exchange_rates` tables. Client reads from cache and triggers refresh when stale. Manual price entry as fallback.

## Dependencies
- Component 2 (Database Schema & Auth)
- Component 3 (Platform & Asset Management) recommended — need assets with tickers

## File Structure
```
supabase/
├── functions/
│   ├── fetch-prices/index.ts           # Orchestrator
│   ├── fetch-tcmb/index.ts             # TCMB XML fetch
│   ├── fetch-coingecko/index.ts        # CoinGecko API
│   └── fetch-yahoo/index.ts            # Yahoo Finance
src/
├── hooks/
│   └── usePrices.ts
├── lib/
│   ├── queries/
│   │   ├── prices.ts
│   │   └── exchangeRates.ts
│   └── prices.ts                       # Formatting + staleness utilities
├── components/
│   ├── prices/
│   │   ├── PriceDisplay.tsx
│   │   ├── ManualPriceEntry.tsx
│   │   └── PriceRefreshButton.tsx
│   └── common/
│       └── CurrencyToggle.tsx
├── contexts/
│   └── DisplayContext.tsx               # Currency preference (USD/TRY)
```

## Tasks
1. **TCMB edge function**: Fetch `https://www.tcmb.gov.tr/kurlar/today.xml`. Parse XML for USD/TRY, EUR/TRY, XAU gram TRY. Upsert exchange_rates + price_cache for XAU_GRAM + fiat tickers (USD, EUR, TRY)
2. **CoinGecko edge function**: Query distinct crypto tickers from assets table. Fetch `https://api.coingecko.com/api/v3/simple/price?ids={ids}&vs_currencies=usd`. Upsert price_cache. Derive price_try from exchange rates. Handle 429 rate limits
3. **Yahoo Finance edge function**: Query distinct stock tickers. Fetch per ticker (1 req/sec throttle). Determine currency from ticker (.IS = TRY, else USD). Upsert price_cache. Handle API instability
4. **Orchestrator edge function** (`fetch-prices`): Call TCMB first (need rates), then CoinGecko + Yahoo in parallel. Return summary `{ updated, errors, stale }`. Uses service role key
5. **Price cache queries** (`lib/queries/prices.ts`): fetchPrices (all, returns map), fetchPrice (single), upsertManualPrice (source='manual')
6. **Exchange rate queries** (`lib/queries/exchangeRates.ts`): fetchLatestRates, fetchRateForDate (nearest prior date)
7. **usePrices hook**: Fetch all prices on mount. Check staleness (>30 min). Auto-trigger refresh if stale. Expose prices (map), rates, loading, refreshing, lastUpdated, refreshPrices(), staleAssets
8. **PriceDisplay component**: Shows price in preferred currency. Amber warning if >30 min old, red if >2 hours
9. **ManualPriceEntry**: Dialog to set price manually. Fields: ticker (read-only), Price USD, Price TRY (auto-derived if possible). Source set to 'manual'
10. **PriceRefreshButton**: Shows "Updated 5m ago", triggers refreshPrices() on click, spinner while refreshing
11. **CurrencyToggle**: Toggle in Header (USD/TRY). Store in DisplayContext
12. **DisplayContext**: Stores `currency: 'USD' | 'TRY'`, provides `toggleCurrency()`, persists to localStorage
13. **Price formatting** (`lib/prices.ts`): `formatCurrency(value, currency)` with $/₺, proper decimals. `isStale()`, `getStalenessLevel()` utilities
14. **Test edge functions locally**: `npx supabase functions serve fetch-prices --env-file .env.local`

## UI Components
- **shadcn/ui**: Dialog, Input, Label, Button, Toggle/Switch, Tooltip
- **Custom**: PriceDisplay, ManualPriceEntry, PriceRefreshButton, CurrencyToggle

## Database
- **price_cache**: UPSERT from edge functions, SELECT from client
- **exchange_rates**: UPSERT from TCMB function, SELECT from client

## Key Decisions
- **Edge functions, not client-side**: Avoids CORS (TCMB, Yahoo), keeps logic server-side, centralizes fetching
- **Single orchestrator**: One endpoint for client + one entry for pg_cron
- **Fiat in price_cache**: USD/EUR/TRY each get a row. Simplifies: every asset value = `balance * price_cache[ticker].price_usd`
- **Staleness is UI-only**: Visual indicator, stale prices still used for calculations
- **Yahoo Finance fragility**: Manual price entry is the critical fallback
- **Edge functions on Deno**: Use string parsing for TCMB XML. CoinGecko/Yahoo return JSON
- **Single shared price store**: All consumers (header, snapshot writer, dashboard, portfolio) read from one app-wide instance. A manual refresh propagates to every consumer at once; the staleness/auto-refresh check runs once per app session, not once per consumer.

## Known Limitations

- **CoinGecko free tier returns ~365 days of price history.** The historical backfill fetches with `days=365`, so crypto positions held longer than ~12 months won't be priced for dates outside that rolling window. Affected snapshots are skipped by the unpriceable-holdings guard (Component 10) rather than written with a wrong total. Workarounds: pay for CoinGecko Pro tier (~$129/mo, overkill), mirror crypto prices from another source (CryptoCompare or Yahoo `BTC-USD`-style tickers), or accept that long-history charts will have visible gaps in older crypto periods until those dates fall within the rolling window.

## Acceptance Criteria
- [ ] `supabase.functions.invoke('fetch-prices')` populates price_cache
- [ ] Exchange rates appear in exchange_rates table after TCMB fetch
- [ ] Crypto prices appear after CoinGecko fetch
- [ ] Stock prices appear after Yahoo fetch (if API is up)
- [ ] usePrices auto-triggers refresh if stale
- [ ] PriceRefreshButton shows last update time and refreshes on click
- [ ] CurrencyToggle switches between USD and TRY across the app
- [ ] ManualPriceEntry dialog works for any asset
- [ ] Staleness indicators show amber/red warnings
