# Component 8: Portfolio Page

## Overview
Full portfolio page showing all assets in a rich table with grouping (by platform or category), search/filter, current values, and P&L columns. The detailed asset view complementing the dashboard's summary.

## Dependencies
- Component 5 (Price Engine)
- Component 6 (P&L Engine)
- Component 3 (Platform & Asset Management)

## File Structure
```
src/
├── pages/
│   └── PortfolioPage.tsx
├── components/
│   └── portfolio/
│       ├── PortfolioTable.tsx
│       ├── PortfolioRow.tsx
│       ├── PortfolioGroupHeader.tsx
│       ├── PortfolioSummaryBar.tsx
│       ├── PortfolioFilters.tsx
│       └── AssetDetailSheet.tsx          # Optional for MVP
├── hooks/
│   └── usePortfolio.ts
```

## Tasks
1. **usePortfolio hook**: Combines useAssets + usePrices + usePnL. For each active asset computes: currentPrice, currentValue, unrealizedPnl, costBasis, allocation %. Returns enrichedAssets[], totals, groupedByPlatform, groupedByCategory. Supports sorting (value, P&L, name, allocation) and filtering (search string, platform, category)

2. **PortfolioFilters**: Search Input (with icon), Group by toggle (Platform/Category), Category filter chips, Platform filter dropdown, Sort by dropdown

3. **PortfolioGroupHeader**: Full-width row with group name (e.g., "IBKR" or "Crypto"), subtotal (value + P&L), collapse toggle. Color indicator from platform. Distinct background

4. **PortfolioRow columns**:
   - Asset: name + ticker (small) + category badge
   - Platform: name (when not grouping by platform)
   - Quantity: balance (2 decimals stocks, 8 crypto, 0 fiat)
   - Price: current price + staleness indicator
   - Value: current value (bold)
   - Cost Basis: total cost
   - P&L: unrealized amount + %. Green/red
   - Allocation: % of total + tiny bar
   - Row click: opens AssetDetailSheet
   - Row actions: Record Transaction, Edit Asset, Deactivate

5. **PortfolioTable**: Groups (PortfolioGroupHeader) with child rows (PortfolioRow). shadcn Table. Sticky header. Mobile: card layout instead of table

6. **PortfolioSummaryBar**: Above table. Total value, total unrealized P&L (amount + %), active asset count, platform count

7. **AssetDetailSheet** (optional MVP): shadcn Sheet from right. Full asset details, FIFO lots table, recent transactions (last 5), quick actions. Can defer

8. **PortfolioPage layout**: SummaryBar top, Filters below, Table as main. "Add Asset" button top-right

9. **Mobile responsiveness**: Table → card list on <640px. Each card: asset name, value, P&L (colored), platform. Tap to expand

10. **Hide inactive assets**: Default: only is_active=true. Toggle "Show inactive" reveals deactivated (grayed out)

11. **Zero-balance handling**: Show assets with balance=0 if they have transactions. Dimmed or in "Closed positions" section

## UI Components
- **shadcn/ui**: Table (full set), Input, Select, ToggleGroup, Badge, Sheet, Collapsible, DropdownMenu
- **Custom**: PortfolioTable, PortfolioRow, PortfolioGroupHeader, PortfolioSummaryBar, PortfolioFilters, AssetDetailSheet

## Key Decisions
- **Grouping is client-side**: All assets fetched, enriched, grouped in JS. <100 assets = instant
- **Card layout on mobile**: Tables don't work on small screens. Cards below 640px
- **Group collapse in local state**: Not persisted. All start expanded
- **P&L = unrealized only**: Portfolio shows current holdings. Realized P&L on Transactions page
- **AssetDetailSheet optional**: Nice but not essential for MVP

## Acceptance Criteria
- [ ] All active assets shown in table with price, value, P&L columns
- [ ] Group by platform shows platform headers with subtotals
- [ ] Group by category shows category headers with subtotals
- [ ] Search filters by name or ticker in real time
- [ ] Values display in selected currency (USD/TRY toggle)
- [ ] P&L color-coded green/red
- [ ] Mobile: card layout
- [ ] "Add Asset" opens asset creation form
- [ ] Row actions allow recording a transaction for that asset
- [ ] Summary bar shows total value and overall P&L
