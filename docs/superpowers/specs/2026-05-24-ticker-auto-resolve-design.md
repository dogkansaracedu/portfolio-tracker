# Ticker Auto-Resolution for Bulk Transaction Insert

**Date:** 2026-05-24
**Status:** Design approved, ready for implementation plan

## Problem

When importing transactions in bulk (Midas PDF, paste-from-Excel, CSV upload), any row whose ticker is not yet in the user's `assets` table triggers `ResolveAssetsStepper` — a modal that walks the user through every unknown ticker one at a time. For each one the user has to fill in category, display name (required), tags, and price source.

For a typical Midas PDF with 3–10 new tickers, that's 3–10 manual confirmations before the bulk insert can complete. The display name in particular is pure friction: the user types "Apple Inc." for AAPL, "Türk Hava Yolları A.O." for THYAO.IS — data that Yahoo Finance returns for free on the same endpoint the app already calls.

## Goal

For US and BIST stocks, make ticker entry the only required input. When Yahoo recognizes the ticker, the asset is auto-created during save with no modal. The stepper only opens for tickers Yahoo can't resolve (typos, manual categories like `ARABA`, illiquid listings).

## Non-goals

- Auto-resolving crypto, fiat, or gold. CoinGecko uses a different ticker convention (`bitcoin`, not `BTC`); resolving against it is a separate, larger change.
- Replacing the existing manual `AssetForm` in Settings → Assets. That stays for non-stock and edge-case entry.
- Atomic "create assets + transactions" rollback semantics. Today's stepper already creates assets one at a time via `addAsset` and leaves them in the DB if the user cancels mid-flow. The new flow inherits the same behavior — out of scope to fix here.

## Architecture

### New Edge Function: `resolve-tickers`

Path: `supabase/functions/resolve-tickers/index.ts`

Method: `POST` with body `{ tickers: string[] }`, max 20 per call. Cap exists because the per-ticker 1s rate-limit delay (below) makes the worst-case wall time `tickers.length * 1s`; 20 keeps the upper bound at ~20s for a user-facing save.

For each ticker:

1. Normalize the input — `trim()`, preserve case after the `.IS` test (Yahoo is case-insensitive for the symbol but the canonical form is uppercase for US, mixed for BIST suffixes).
2. Call `https://query1.finance.yahoo.com/v8/finance/chart/{ticker}?interval=1d&range=1d` — same endpoint the existing `fetch-yahoo` function uses.
3. From the response, extract:
   - `meta.longName || meta.shortName` → display name
   - `meta.currency` → used internally for cross-rate computation
   - `meta.quoteType` → must equal `"EQUITY"` to count as resolved (filters out crypto pairs like `BTC-USD` and futures)
   - `meta.regularMarketPrice` → cached if present
4. Infer category from ticker shape: `.IS` suffix → `stock_bist`, otherwise `stock_us`.
5. If `currency === "TRY"`, fetch the latest `usd_try` from `exchange_rates` and compute `price_usd = price_try / usd_try`. Otherwise `price_usd = regularMarketPrice` and `price_try = price_usd * usd_try`.
6. Upsert into `price_cache` with `source: "yahoo"` — same shape `fetch-yahoo` writes.
7. Insert a 1-second delay between Yahoo calls within the batch — matches the existing rate-limit pattern in `fetch-yahoo` and avoids Yahoo throttling.

Response shape:

```ts
{
  resolved: Array<{
    ticker: string             // canonical form to store on the asset
    name: string               // e.g., "Apple Inc.", "Türk Hava Yolları A.O."
    category: "stock_us" | "stock_bist"
    price_source: "yahoo"
    currency: string           // Yahoo's currency for the listing (used by caller as info only)
  }>
  unresolved: Array<{
    ticker: string
    reason: "not_found" | "http_error" | "not_equity"
  }>
}
```

CORS, auth, and error-envelope conventions match the other edge functions in `supabase/functions/`. The function runs with the service-role client only to write `price_cache`; no per-user data is touched on the server.

### Client orchestration

The save handler in `TransactionsSheetGrid.tsx` adds a resolve step **before** opening the stepper:

```
User clicks Save
  ↓
Collect sentinels from rows  →  ["new:AAPL", "new:RKLB", "new:WAT"]
  ↓
Extract tickers  →  ["AAPL", "RKLB", "WAT"]
  ↓
POST /resolve-tickers { tickers: [...] }
  ↓
Response  →  { resolved: [AAPL, RKLB], unresolved: [{ticker: "WAT", reason: "not_found"}] }
  ↓
For each resolved → addAsset() sequentially
  ↓ Build sentinelMap: { "new:AAPL": "<real-uuid>", "new:RKLB": "<real-uuid>" }
  ↓
If unresolved.length > 0:
    Open ResolveAssetsStepper with ONLY the unresolved sentinels
    (existing flow — user fills name/category manually)
  ↓
After stepper completes (or no unresolved):
    Substitute all sentinels → real IDs in row data
    Call bulk_insert_transactions RPC (existing path, unchanged)
  ↓
Toasts:
    • One aggregate "Created N assets from Yahoo" on success
    • Per-ticker error toast for unresolved with the reason text
```

### Behavior details

- **Resolver HTTP failure** (entire call): fall back to opening the stepper for *all* sentinels — feature degrades to today's behavior.
- **`addAsset` duplicate-key race**: another tab inserted the same ticker between resolve and create. Look up the existing asset by ticker, use its ID, continue silently.
- **Stepper messaging**: when opened from this flow, the dialog description uses the `reason` to give better hints. For `not_found` on a Turkish-looking ticker like `THYAO` (no suffix), the hint is *"For BIST stocks add .IS suffix, e.g. THYAO.IS"*. For `not_equity` (Yahoo returned crypto-style metadata), the hint is *"Yahoo doesn't list this as a stock — pick the right category manually"*. For `http_error`, *"Couldn't reach Yahoo — fill in details manually"*. For `create_failed`, *"Yahoo found this ticker but saving the asset failed — please review and try again"*.
- **`addAsset` failure post-resolve (non-duplicate)**: a resolved ticker fails to insert (network blip, RLS edge case, validation). Don't block the rest of the batch. Treat it as if unresolved: add to the stepper queue with `reason: "create_failed"` so the user can retry interactively. The other resolved assets stay created.
- **Already-known tickers**: the existing client-side `tickerExists` check runs first. Sentinels for tickers already in `assets` get substituted with the existing ID — no resolver call, no stepper.

## Field mapping for auto-created assets

| Asset field | Value |
|---|---|
| `ticker` | Canonical form (uppercase for US, original `.IS`-suffixed for BIST) |
| `name` | `meta.longName \|\| meta.shortName` |
| `category` | `stock_bist` if `.IS` suffix else `stock_us` |
| `price_source` | `"yahoo"` |
| `tags` | `[]` — user adds later in Settings if desired |
| `is_currency` | `false` |
| `is_active` | `true` |

Yahoo's `currency` field is **not stored on the asset row**. The `assets` table has no currency column — transactions carry `price_currency` per-row. The currency is used inside the resolver only to compute the USD cross-rate for `price_cache`.

## Files touched

| File | Change |
|---|---|
| `supabase/functions/resolve-tickers/index.ts` | New file. Edge function as specified above. |
| `supabase/functions/_shared/` | No changes — reuses existing `client.ts` (service-role client) and `cors.ts`. |
| `src/lib/queries/assets.ts` | New `resolveTickers(tickers: string[])` wrapper that calls the edge function and returns the typed response. |
| `src/components/transactions/sheet/TransactionsSheetGrid.tsx` | Save handler: before opening the stepper, call `resolveTickers` for all sentinel tickers, `addAsset` each resolved, build the unresolved-only sentinel list for the stepper. |
| `src/components/transactions/sheet/ResolveAssetsStepper.tsx` | Accept an optional `reasons: Record<string, "not_found" \| "http_error" \| "not_equity" \| "create_failed">` prop keyed by sentinel; use it to vary the dialog description. Default behavior unchanged when prop is absent. |

No changes to `useTransactionsSheetState.ts`, the `bulk_insert_transactions` RPC, or the database schema.

## Edge cases

| Case | Behavior |
|---|---|
| User types lowercase (`aapl`) | Resolver normalizes to `AAPL`; canonical `AAPL` stored. |
| User types `THYAO` without suffix | Yahoo returns "not found" → `unresolved` with `reason: "not_found"`. Stepper opens with the BIST suffix hint. No silent rewrite — too magic, could mask real typos. |
| Resolved ticker but no price (illiquid stock) | Asset created, `price_cache` write skipped. Resolution still succeeds because metadata is present. Price shows up on next manual refresh. |
| Yahoo returns a non-equity (e.g. `BTC-USD`) | `meta.quoteType !== "EQUITY"` → `unresolved` with `reason: "not_equity"`. Stepper opens; user picks correct category. Prevents miscategorizing a coin as `stock_us`. |
| Ticker reused after delisting (Yahoo returns wrong company) | User edits the asset name afterward via Settings → Assets. Acceptable risk — same risk as today's manual entry. |
| User cancels stepper after some auto-creates succeeded | Auto-created assets stay in the DB. Transaction insert is aborted. User can retry; next save sees the assets as known. Consistent with today's stepper behavior. |
| Yahoo rate-limits mid-batch | Per-ticker `reason: "http_error"` for 429 responses; those go to the stepper. The 1s inter-call delay makes this rare. |
| Empty ticker / whitespace in `tickers` array | Filtered client-side before sending to the resolver. |
| `resolve-tickers` HTTP fails entirely | All sentinels passed to stepper — graceful degradation to today's flow. |
| `addAsset` fails for a resolved ticker | That sentinel goes to the stepper with `reason: "create_failed"`. Other resolved assets in the batch stay created. |
| Already-known ticker in input | Filtered client-side by `tickerExists` check; never reaches the resolver. |

## What this isn't

- **Not an atomic transaction.** Auto-create + bulk_insert_transactions are two separate writes. If transactions fail after assets are created, the assets persist. Acceptable — the next save retries cleanly.
- **Not a replacement for the stepper.** The stepper still handles every category outside US/BIST stocks (crypto, gold, fiat, vehicles, anything Yahoo doesn't recognize as equity).
- **Not an asset-ticker autocomplete.** This change only fires on save, not while typing in the sheet. A typeahead is a possible future improvement built on the same resolver, but explicitly out of scope here.

## Verification

Solo project, no test suite. Verification = run dev server, import a Midas PDF containing at least one fresh US ticker (e.g., `RKLB`) and one fresh BIST ticker (e.g., `ASELS.IS`), confirm:

1. Stepper does not open for those two tickers.
2. Toast appears: *"Created 2 assets from Yahoo: Rocket Lab USA Inc., Aselsan A.Ş."* (or similar).
3. After save, the new assets appear on Settings → Assets with correct name and category.
4. Within seconds, the new assets show up with a price on the portfolio page.
5. Repeating the save with a typo ticker (`WATXYZ`) still opens the stepper for that ticker only, with the friendlier message.
