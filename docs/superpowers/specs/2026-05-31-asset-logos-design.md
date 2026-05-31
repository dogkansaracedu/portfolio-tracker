# Asset logos (stock icons) — Design

**Date:** 2026-05-31
**Status:** Implemented (code in working tree; pending migration apply + deploy)

## Problem

Assets render as text only (`ticker` + `name`). There is no visual identity per
asset, which makes scanning the portfolio, transactions, and dashboard slower
and less recognizable. We want a way to get a logo for a stock automatically
from its ticker — "type the ticker, get the icon" — with a manual override for
the cases automation can't cover, and a graceful fallback when there's nothing.

## Goals

- **Automatic logos for US + BIST stocks** from the ticker alone — no per-asset
  configuration, no tokens, no signup, no backend service to run.
- **Manual override** per asset for anything automation misses or gets wrong.
- **Graceful fallback** (a monogram) so an asset always renders something sane.
- **Long-term-friendly:** deterministic static URLs on a public CDN, with a
  clear path to full control (forking) if a source ever changes.
- **Break nothing.** Purely additive: one nullable column, one new component.

## Non-goals (YAGNI)

- **Crypto, fiat, and physical gold logo sourcing are parked.** The component
  must handle these categories gracefully (override or monogram), but we are
  *not* wiring automated sources for them in this pass. Crypto in particular
  needs its own icon source (the `spothq` CDN path tried during design 404'd);
  that is a follow-up.
- No edge function, no logo cache table, no `logoid` resolution, no TradingView
  (pricing stays exactly as-is on Yahoo/CoinGecko/TCMB).
- No bulk icon-management UI. Override is per-asset in `AssetForm`.

## The model

A stock's logo URL is **fully deterministic from its ticker + category**, so
resolution happens client-side with zero network round-trips beyond loading the
image itself. Three public GitHub repos (by `ahmeterenodaci`, actively
maintained as of 2026-05) are served free over the jsDelivr CDN — no token, no
rate limit:

| Category | Repo | URL pattern | Verified |
|---|---|---|---|
| `stock_bist` | `Istanbul-Stock-Exchange--BIST--including-symbols-and-logos` | `…/logos/{TICKER}.png` | `THYAO`, `ASELS` → 200 |
| `stock_us` (Nasdaq) | `Nasdaq-Stock-Exchange-including-Symbols-and-Logos` | `…/logos/_{TICKER}.png` | `_AAPL` → 200 |
| `stock_us` (NYSE) | `New-York-Stock-Exchange--NYSE--including-Symbols-and-Logos` | `…/logos/_{TICKER}.png` | `_KO`, `_JPM` → 200 |

Notes that drove the design:

- **US repos require a leading `_`** in the filename (`_AAPL.png`); BIST does not.
- A `stock_us` asset doesn't record Nasdaq vs NYSE, so US tickers **try Nasdaq,
  then NYSE**, then fall back. US tickers are unique across the two exchanges,
  so "try both" can never fetch the *wrong* company's logo — at most one repo
  has the file.
- **Coverage:** BIST is near-complete (536 logo files for ~537 symbols). US
  covers the liquid names; gaps fall to the monogram. (The repos' `without_logo`
  JSON is *not* a missing-logo list — it's the symbol list without the URL
  column — so it is not used.)

### Resolution order (per asset)

1. `asset.icon_url` (manual override) — always wins if set.
2. Category-specific candidate URL(s) from the table above.
3. Monogram fallback (rendered when all image candidates fail to load).

## Data model changes

### `assets` table
- Add column `icon_url text` (nullable). When set, it overrides automatic
  resolution. When null, the resolver builds the URL from ticker + category.
- No backfill needed (null = "auto-resolve", which is the desired default).
- TS (`src/types/database.ts`): add `icon_url: string | null` to `Asset`;
  add `icon_url?: string | null` to `AssetUpdate`; include in the `AssetInsert`
  omit/optional set (same pattern already used for `price_id`).

## Code changes

### New: `src/lib/constants/assetIcons.ts`
Holds the three jsDelivr base URLs and the icon size classes as named constants
(per the project's no-hardcoded-strings rule). Pin a tag/commit in the base URL
rather than `@latest` for stability (e.g. `@main` or a specific ref).

### New: `src/lib/assetIcons.ts`
- `getAssetIconCandidates(asset): string[]` — pure function returning the ordered
  image-URL candidates (override first, then category URLs). Normalizes the
  ticker: trim, uppercase, strip a trailing exchange suffix (e.g. `.IS`) so a
  BIST asset stored as `THYAO.IS` still resolves to `THYAO.png`. Returns `[]` of
  category URLs for parked categories (crypto/fiat/gold) — they get only the
  override (if any) then the monogram.
- `monogramFor(asset): { initials, bgColor }` — first 1–2 chars of the ticker
  and a deterministic background color hashed from the ticker (e.g. hue from a
  simple string hash → `hsl(h, 60%, 45%)`, white text). Branding only — does not
  use the gain/loss palette.

### New: `src/components/common/AssetIcon.tsx`
- Props: `{ asset, size?, className? }` where `asset` carries at minimum
  `{ ticker, category, icon_url }`. `size`: `"sm" | "md" | "lg"`.
- Renders an `<img loading="lazy">` of the current candidate in a fixed-size,
  `rounded-md` chip with a light background (so transparent/dark PNGs stay
  visible in dark mode), `object-contain`. On `onError`, advance to the next
  candidate; when candidates are exhausted, render the monogram chip (same size,
  hashed bg color, centered initials).
- Fixed box dimensions avoid layout shift.

### Threading `icon_url` (+ `category`) to render sites
- `EnrichedAsset` (`src/hooks/usePortfolio.ts`): add `icon_url: string | null`;
  populate from `asset.icon_url` in the enrichment map (~line 208).
- `TopMover` (`src/hooks/useDashboard.ts`): add `icon_url` and `category` so
  `TopMovers` can render the icon.
- Transaction list join: the query that selects `assets(...)` for transactions
  must include `icon_url` and `category` so `TransactionRow` can render the icon.
- `Asset`-typed consumers (`AssetRow`, `AssetForm`, `AssetSearchSelect`) already
  receive the full row, so they get `icon_url` for free once the column exists.

## UI changes

- **`<AssetIcon size="sm">` is added before the ticker** in: `PortfolioRow`
  (desktop) and `PortfolioRowCard` (mobile), `AssetRow` (asset list),
  `TransactionRow`, `TopMovers`, and the `AssetSearchSelect` command items.
- **`AssetForm` gains an optional "Icon URL" field** (near the ticker), with a
  small live `<AssetIcon>` preview reflecting the current ticker/category/URL.
  Hint: "Leave blank to auto-resolve from the ticker. Paste an image URL to
  override." On submit, empty string coalesces to `null`. In edit mode it
  hydrates from `asset.icon_url`. `onSubmit`'s data type gains
  `icon_url: string | null`; `AssetList` passes it through `addAsset`/`editAsset`.

## Rollout

1. Apply migration: `ALTER TABLE assets ADD COLUMN icon_url text;` (Supabase).
2. Regenerate / update `Asset` TS types.
3. Implement constants, resolver, `AssetIcon`; thread `icon_url`/`category`
   through `EnrichedAsset`, `TopMover`, and the transaction join.
4. Add `<AssetIcon>` to the render sites and the `AssetForm` field + preview.
5. Push to prod (project's standard loop) and verify on live.

## Risks / mitigations

- **Third-party repo goes stale or disappears.** Mitigation: deterministic URLs
  keep working as long as files exist; monogram + override are always-available
  safety nets. Optional long-term hardening: fork the repos into the user's own
  GitHub and point jsDelivr at the fork (pinned) — also becomes the bulk way to
  add missing logos (drop `{TICKER}.png`). Not done now; documented as the
  escape hatch.
- **NYSE/Nasdaq coverage gaps / parked categories.** Expected; degrade to
  monogram, overridable per asset.
- **Ticker stored with exchange suffix (`.IS`).** Handled by normalization in
  `getAssetIconCandidates`.
- **Layout shift / request spray.** Fixed-size box + `loading="lazy"`.
- **CORS.** `<img>` rendering is not CORS-gated; jsDelivr also sends permissive
  headers. No issue.

## Verification

- A BIST holding (e.g. `THYAO`) and a US holding (e.g. `AAPL` Nasdaq, `KO` NYSE)
  render real logos across portfolio rows, transactions, dashboard movers, and
  search.
- An asset with no available logo (e.g. a parked-category or uncovered ticker)
  renders a stable monogram.
- Setting "Icon URL" on an asset overrides the auto logo everywhere; the form
  preview reflects it live.
- No layout shift as logos load; dark mode shows logos clearly.
