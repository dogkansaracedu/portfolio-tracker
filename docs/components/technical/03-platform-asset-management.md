# Component 3: Platform & Asset Management — Technical (this build)
> Layer: React/Vite/Supabase implementation. Contract → [../03-platform-asset-management.md](../03-platform-asset-management.md)

## Stack
- React 19 + TypeScript, Vite. UI from shadcn/ui (Dialog, AlertDialog, Select, Table, Card, Badge, DropdownMenu, Input, Label, Button) + lucide-react icons + Tailwind 4.
- Data + auth via Supabase (Postgres). All reads filtered by `user_id` (RLS-backed).
- Shared server state via React Context providers (no react-query).

## File map

### Platforms
- `src/components/platforms/PlatformList.tsx` — grid of cards + "Add Platform"; owns the create/edit `PlatformForm` and the delete `AlertDialog`. Computes `assetCountByPlatform` from `useHoldings()` (counts holdings with `balance > 0`) and **blocks delete when the platform still has held assets**.
- `src/components/platforms/PlatformCard.tsx` — color dot + name + "N asset(s)" + actions menu (Edit / Delete).
- `src/components/platforms/PlatformForm.tsx` — `Dialog` with name `Input`, `PRESET_NAMES` quick-select chips (create only), and a `PRESET_COLORS` swatch palette (10 hex colors). Name is trimmed + required client-side.

### Assets
- `src/components/assets/AssetList.tsx` — splits assets into `ownedAssets` / `otherAssets` by net balance (sums `useHoldings()` balances per `asset_id` via `bn`/`BN_ZERO`, owned = `net.gt(0)`); renders owned first, the rest behind a collapsible "Not held (N)" row. Owns the `AssetForm` and the deactivate `AlertDialog`. Header shows `is_active` count / total.
- `src/components/assets/AssetRow.tsx` — one table row: `AssetIcon` + ticker/name, category `Badge` (via `CATEGORY_LABELS`), price cell, tags as outline badges, status badge, actions menu. Price = `prices[asset.price_id ?? asset.ticker]`; native currency from `assetNativeCurrency(asset)`; fiat shows `1`; non-USD shows native value + `~$` from `price_usd`. Actions menu hidden when `!is_active || is_currency`.
- `src/components/assets/AssetForm.tsx` — `Dialog` with category/price-source `Select`s, ticker, display name, icon URL (+ live `AssetIcon` preview), price id, tags `Input`. Local `CATEGORIES` / `PRICE_SOURCES` / `TICKER_HINTS` constants. On submit: requires ticker + name; `price_id` empty ⇒ `trimmedTicker`; `icon_url` empty ⇒ `null`; tags split on comma → trim → lowercase → filter; always submits `is_active: true`. Create passes `is_currency: false`.

### Common
- `src/components/common/AssetIcon.tsx` — `<img loading="lazy">` over the candidate chain from `getAssetIconCandidates`; tracks failures **by URL** in a `useState<Set<string>>` (`onError` adds the URL, advances to the next candidate); renders `monogramFor` chip when all candidates fail. Light `bg-white` + `object-contain` so transparent/dark logos stay visible. Decorative (`aria-hidden`, `alt=""`).
- `src/components/common/PlatformDot.tsx` — small colored round span (`sm`/`md`) for reuse where a full card isn't needed.
- `src/components/common/Logo.tsx` — the **app** brand mark (inline SVG); unrelated to asset icons. Listed here only to disambiguate.

### Logo resolution + constants
- `src/lib/assetIcons.ts` — `getAssetIconCandidates(asset)` (pure): override → category URL(s) → `[]`. `normalizeTicker` (upper, strip trailing `.XX` suffix) for stocks; `normalizeCryptoSymbol` (lowercase, no strip) for crypto. US tries Nasdaq then NYSE (`_TICKER.png`); BIST `TICKER.png`; crypto by lowercase symbol; fiat → circle-flag via `FIAT_FLAG_SLUG`; gold has no auto source. `monogramFor` returns initials + `hsl(hash,60%,45%)` hashed from the ticker.
- `src/lib/constants/assetIcons.ts` — `LOGO_BASE` (jsDelivr CDN base URLs — see Notes), `FIAT_FLAG_SLUG`, `AssetIconSize`, `ASSET_ICON_SIZE_CLASS`.
- `src/lib/constants/assets.ts` — `ASSET_CATEGORIES`, `PRICE_SOURCES`, `TICKER_HINTS`, `DEFAULT_PRICE_SOURCE` per category, `PHYSICAL_GOLD_TICKER` (`XAU_GRAM`), and `assetNativeCurrency()` / `currencyForAssetId()` (the native-currency rule).
- `src/lib/constants/brokers.ts` — `MIDAS_PLATFORM_NAME` (referenced by import-specific logic elsewhere).

## Data layer
Only Component-2 tables; no new schema beyond columns this component reads/writes.
- `src/lib/queries/platforms.ts` — `fetchPlatforms` (`order created_at`), `createPlatform`, `updatePlatform`, `deletePlatform`. Plain `supabase.from("platforms")` calls.
- `src/lib/queries/assets.ts` — `fetchAssets` (`select *`, `order name`), `createAsset`, `updateAsset`, `deactivateAsset` (sets `is_active = false`). Also hosts `resolveTickers()` (calls the `resolve-tickers` Edge Function) used by import elsewhere — not part of this CRUD surface.
- `src/contexts/PlatformsContext.tsx` / `src/contexts/AssetsContext.tsx` — providers holding the single shared fetch + optimistic-ish mutators (`add/edit/remove` for platforms; `add/edit/deactivate` for assets, which `refetch()` after each write). Exposed via `usePlatformsContext` / `useAssetsContext`.
- `src/hooks/useAssets.ts` / `src/hooks/usePlatforms.ts` — **thin re-exports** of the context hooks, preserving the original import paths. They are NOT fetch-on-mount hooks.

## Notes & gotchas
- **Shared fetch, not per-call-site:** assets and platforms are fetched once in the providers and shared. The hooks used to fetch-on-mount at every call site (`AppLayout`, filters, bulk sheet, settings) and fired 2-3 identical `?select=*` requests per page — a request-flood bug. Do not reintroduce per-component fetching; consume the context.
- **`price_id ?? ticker` fallback** appears in two places that must agree: `AssetForm` coalesces empty → ticker on save; `AssetRow` reads `prices[asset.price_id ?? asset.ticker]`. Keep them aligned.
- **`price_id` auto-derive:** `AssetForm` uses `derivePriceId(ticker, category, source)` (`src/lib/priceId`) and a `priceIdDirty` flag — it stays synced to the ticker until the user hand-edits the field, then their value is preserved. On open, a stored id that equals the derived value stays "clean" (keeps syncing); anything else is treated as a manual override.
- **Logos are token-free by project convention:** `LOGO_BASE` points only at public GitHub repos served over the jsDelivr CDN (ahmeterenodaci BIST/Nasdaq/NYSE logos, spothq `cryptocurrency-icons`) and HatScripts `circle-flags` for fiat — no API-key services (no logo.dev etc.). Crypto/gold may legitimately have no logo and fall to the monogram. Escape hatch if a repo goes stale: fork it and point `LOGO_BASE` at the pinned fork.
- **Native currency comes from the asset, not the price columns:** the price fetch back-fills both `price_usd` and `price_try` for every asset, so currency must be derived via `assetNativeCurrency` (see `src/lib/constants/assets.ts`), not inferred from which column is non-null.
- **Currency assets** (`is_currency`) have no edit/deactivate menu in `AssetRow` and price as `1`; they're maintained as part of the currency set, not via this CRUD.
- **Soft vs hard delete:** assets soft-delete (`is_active = false`) because transactions/holdings FK them; platforms hard-delete but only when no held asset references them (guard is computed in `PlatformList` from holdings, not enforced as a DB constraint here).
- **`AssetIcon` failure tracking is keyed by URL** (not candidate index) so a recycled component instance stays correct when a list re-renders for a different asset.
- The `coingecko` source named in the [glossary](../GLOSSARY.md#asset) is not in the shipped `PRICE_SOURCES` (`yahoo` / `tcmb` / `manual`); crypto currently prices via `yahoo`.
