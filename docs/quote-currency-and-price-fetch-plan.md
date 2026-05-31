# Price-fetch currency handling

## What & why

Price-fetch code used to infer a price's currency from the `.IS` ticker suffix
(`.IS` → TRY, else → USD), silently mislabeling any other market — a EUR
Amsterdam ETF (`VUSA.AS`) had its euro price stored verbatim as USD. The
currency now comes from the **source** (Yahoo `meta.currency`, CoinGecko = USD,
TCMB = TRY) and is converted to USD/TRY using rates already computed.

No `quote_currency` column: which currency we *display* is derived client-side
from category (`assetNativeCurrency`); valuation stays USD-based.

## Conversion rule — `_shared/currency.ts` → `splitPrice`

| source currency | `price_usd`           | `price_try`             |
| --------------- | --------------------- | ----------------------- |
| USD             | `p` (raw)             | `p × usd_try`           |
| TRY             | `p ÷ usd_try`         | `p` (raw)               |
| EUR             | `p × eur_usd`         | `p × eur_usd × usd_try` |
| other (GBp, …)  | — `null` → skip + log — |                       |

Native value stays the truth where a column exists (USD/TRY). An unsupported
currency returns `null`; the caller skips the upsert and logs an error rather
than mislabel.

## Changes (edge functions only)

- **`_shared/yahoo.ts`** — `fetchYahooQuote(symbol)`: chart fetch + parse,
  currency from `meta.currency`. Never throws (failures → `{ status, quote: null }`).
- **`_shared/currency.ts`** — `splitPrice` + `categoryForQuote`
  (`TRY → stock_bist`, else `stock_us`).
- **`fetch-prices`** — Yahoo step uses the helpers; `eur_usd` hoisted out of the
  TCMB step (+ loaded in the fallback); `.IS` removed.
- **`resolve-tickers`** — loads `eur_usd`; category + price via the helpers;
  `.IS` removed.
- Deleted dead `fetch-tcmb`, `fetch-coingecko`, `fetch-yahoo`.
- Display (`AssetRow` + `assetNativeCurrency`, already in place): BIST & gram
  gold → ₺ `(~$ eq)`; US / crypto / tokenized gold → `$`; fiat → its own
  currency (`~$` eq beside non-USD).

## Known limits

- A GBp / other-currency asset resolves but isn't priced (shows `—` + logged
  error). Add support by extending `splitPrice`.
- No native-EUR display column — EUR-denominated assets display in USD.
- Gram gold's USD(GC=F) → TRY conversion is unchanged; making it a fixed value
  like fiat is a separate future change.
- `errors[]` isn't surfaced in the UI (`PricesContext` only checks the
  invoke-level error) — pre-existing.

## Verify (post-deploy; no local dev server — commit → push → test on prod)

1. Deploy (run by user): `supabase functions deploy fetch-prices resolve-tickers`.
2. Refresh in-app, inspect `price_cache`: US `price_usd` correct, BIST
   `price_try` correct, a EUR asset (`VUSA.AS`) `price_usd ≈ p × eur_usd`;
   `errors[]` flags any unsupported-currency symbol.
3. Resolve a new ticker → `category` comes from `meta.currency`, not the suffix.
4. `npm run typecheck` + `npm run lint` clean on touched files. (`deno check`
   N/A — Deno not installed locally; verified by review + prod.)
