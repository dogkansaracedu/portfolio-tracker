# Component 3: Platform & Asset Management

## Status: Done

## Overview
CRUD UI for managing platforms and global assets. Assets are global (one per ticker per user) with `holdings` table for per-platform balances. Category is free-form text, with tags array for cross-cutting allocation and price_source to specify which API fetches the price.

## Dependencies
- Component 2 (Database Schema & Auth)

## File Structure
```
src/
├── hooks/
│   ├── usePlatforms.ts
│   └── useAssets.ts
├── components/
│   ├── platforms/
│   │   ├── PlatformList.tsx
│   │   ├── PlatformForm.tsx
│   │   └── PlatformCard.tsx
│   └── assets/
│       ├── AssetList.tsx
│       ├── AssetForm.tsx
│       └── AssetRow.tsx
├── lib/
│   └── queries/
│       ├── platforms.ts
│       └── assets.ts
├── pages/
│   ├── SettingsPage.tsx                # Platform/asset management tabs
│   └── PortfolioPage.tsx               # Shows real assets
```

## Tasks
1. **Platform query functions** (`lib/queries/platforms.ts`): fetchPlatforms, createPlatform, updatePlatform, deletePlatform
2. **Asset query functions** (`lib/queries/assets.ts`): fetchAssets (with platform join), fetchAssetsByPlatform, createAsset, updateAsset, deactivateAsset
3. **usePlatforms hook**: Fetches on mount. Exposes platforms, loading, error, addPlatform(), editPlatform(), removePlatform(), refetch()
4. **useAssets hook**: Fetches on mount. Exposes assets, loading, error, addAsset(), editAsset(), deactivateAsset(), refetch(). Optional platformId filter
5. **PlatformForm**: Dialog with name (Input) + color (preset palette of 8-10 colors as clickable swatches). Submit calls add/edit
6. **PlatformList**: Grid of PlatformCard components. "Add Platform" button
7. **PlatformCard**: Card with name, color dot, asset count, actions dropdown (Edit, Delete)
8. **AssetForm**: Dialog with category (text), ticker (Input), display name (Input), tags (multi-value), price_source (Select: tcmb/coingecko/yahoo/manual)
9. **AssetList**: Table with columns: Name, Ticker, Category (Badge), Tags, Price Source, Status. Row actions: Edit, Deactivate
10. **AssetRow**: Single table row with category shown as color-coded Badge
11. **Settings page**: Tabs for "Platforms" and "Assets", each rendering respective list component
12. **Quick Add Asset** on Portfolio page: button that opens AssetForm directly
13. **Preset platform suggestions**: Common names (IBKR, Midas, Paribu, OKX, Ziraat, Garanti, Fiziksel Altin) as quick-select chips
14. **Category-to-ticker helper**: Hints when user selects category (e.g., Crypto -> "Use CoinGecko ID like bitcoin")
15. **Confirmation dialogs**: Warn when deleting platform with assets, or deactivating asset with balance > 0

## UI Components
- **shadcn/ui**: Dialog, Select, Table, Tabs, DropdownMenu, AlertDialog, Badge, Input, Label, Button
- **Custom**: PlatformList, PlatformCard, PlatformForm, AssetList, AssetRow, AssetForm

## Database
- **Tables**: platforms (CRUD), assets (CRUD)
- **Key query**: `supabase.from('assets').select('*, platforms(name, color)').eq('user_id', userId)`

## Key Decisions
- **Platform management in Settings**: Low-frequency action, doesn't need its own page
- **Soft delete for assets**: `is_active = false` (transactions reference assets, can't hard delete)
- **Hard delete for platforms**: Only if no assets reference it
- **Color picker**: Preset palette (8-10 colors), no fancy color picker library
- **Balance on asset creation**: Convenience field for initial setup. Later replaced by buy transactions

## Acceptance Criteria
- [ ] Create a new platform with name and color from Settings
- [ ] Edit a platform's name and color
- [ ] Delete a platform (only if no assets)
- [ ] Create a new asset with platform, category, ticker, name
- [ ] Edit an asset's details
- [ ] Deactivate an asset (soft delete)
- [ ] All changes persist across page refreshes
- [ ] Assets display with platform's color indicator
- [ ] Preset platform suggestions appear on platform creation
