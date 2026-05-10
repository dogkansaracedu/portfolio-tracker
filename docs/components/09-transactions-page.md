# Component 9: Transactions Page

## Status: Done

## Overview
Chronological log of all transactions with filtering by date range, asset, platform, and transaction type. Displays realized P&L for sell transactions. The audit trail and history view.

## Dependencies
- Component 4 (Transaction System)
- Component 6 (P&L Engine)

## File Structure
```
src/
├── pages/
│   └── TransactionsPage.tsx
├── components/
│   └── transactions/
│       ├── TransactionList.tsx
│       ├── TransactionRow.tsx            # Enhanced from Component 4
│       ├── TransactionFilters.tsx
│       ├── TransactionTypeBadge.tsx
│       └── TransactionSummary.tsx
├── hooks/
│   └── useTransactionLog.ts
```

## Tasks
1. **useTransactionLog hook**: Fetch all transactions with joins. Client-side filters: dateFrom, dateTo, assetId, platformId, type. Enrich sells with realized P&L (from FIFO). "Load more" pagination (50 at a time). Returns transactions[], loading, hasMore, loadMore(), filters, setFilters(), summary stats. By default the main list filters out rows whose `linked_tx_id IS NOT NULL` (auto-paired cash children — they render as the parent row's subtitle). Asset-filtered views (e.g. viewing the USD fiat asset) include them so the user can audit "where did my Midas USD come from".

2. **TransactionFilters**: Date range (preset buttons: Last 7d, 30d, This month, This year, All + custom date pickers). Asset filter (AssetSearchSelect reuse). Platform filter (Select). Type filter (multi-select chips for all 7 types). Mobile: collapse into "Filters" button → bottom sheet

3. **TransactionRow columns**:
   - Date: formatted (e.g., "Mar 15, 2026")
   - Asset: name + ticker. For sells and platform-funded buys, a small subtitle shows the cash effect (e.g., `+$998.50 USD → Midas` for a sell auto-credit, or `−$1,001.50 USD from Bank` for a platform-funded buy). External-cash buys show `external cash`. Subtitle text comes from the linked child row (Component 4 cash-flow linkage).
   - Platform: name + color dot
   - Type: TransactionTypeBadge (color-coded)
   - Amount: quantity with +/- sign (+ for buy/transfer_in/dividend, - for sell/transfer_out/fee)
   - Unit Price: price + currency
   - Total: total_cost in selected currency
   - Realized P&L: only for sells. Green/red amount + %
   - Notes: truncated, expand on hover/click
   - Transfer rows show linked icon + destination/source platform

4. **TransactionTypeBadge**: Styled Badge by type — Buy (green), Sell (red), Transfer In (blue), Transfer Out (orange), Dividend (purple), Interest (teal), Fee (gray)

5. **TransactionSummary**: Stats for filtered transactions — count, total buy volume, total sell volume, net realized P&L, net deposit (buys-sells). Row of stat cards above list

6. **TransactionList**: shadcn Table. Sorted by date DESC (newest first). Clickable column headers for sorting. "Load more" button at bottom. Alternating row colors

7. **TransactionsPage layout**: Filters top, Summary below, List as main. "Add Transaction" button top-right

8. **Mobile**: Table → card list. Each card: Date, Asset, Type badge, Amount, Total. P&L if sell. Filters collapse to bottom sheet

9. **Realized P&L computation**: Run FIFO per asset once on load, build map `transactionId -> realizedPnL`. Look up per row. Avoids recomputing per row

10. **Edit/delete**: Click row → edit modal (AddTransactionModal pre-filled). Delete with confirmation. Both recalculate affected asset balance. Rare admin actions

## UI Components
- **shadcn/ui**: Table (full set), Badge, Calendar, Popover, Select, Input, Button, Sheet (mobile filters)
- **Custom**: TransactionList, TransactionRow, TransactionFilters, TransactionTypeBadge, TransactionSummary

## Key Decisions
- **Client-side filtering for MVP**: <5,000 transactions, fetch all, filter in JS. Add server-side later if needed
- **Realized P&L pre-computed**: FIFO per asset once, map lookup per transaction. Efficient
- **Load more over pagination**: Simpler UX, no page numbers. Load 50, button for more
- **No inline editing**: Opens modal (same as AddTransactionModal but pre-filled)

## Acceptance Criteria
- [ ] All transactions shown in reverse chronological order
- [ ] Each shows date, asset, type (color badge), amount, price, total
- [ ] Sell transactions show realized P&L
- [ ] Date range filter works (presets + custom dates)
- [ ] Asset/platform/type filters correctly narrow the list
- [ ] Summary bar shows totals for filtered set
- [ ] "Add Transaction" button opens the modal
- [ ] Mobile: card layout, filters in bottom sheet
- [ ] Edit and delete work with confirmation
