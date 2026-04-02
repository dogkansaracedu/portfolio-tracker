# Component 4: Transaction System

## Overview
Build the transaction recording system: an "Add Transaction" modal with support for all transaction types (buy, sell, transfer, dividend, interest, fee). On transaction creation, recalculate the asset's cached balance. This is the core data-entry workflow.

## Dependencies
- Component 3 (Platform & Asset Management)

## File Structure
```
src/
├── hooks/
│   ├── useTransactions.ts
│   └── useAssetBalance.ts
├── components/
│   └── transactions/
│       ├── AddTransactionModal.tsx
│       ├── TransactionTypeSelector.tsx
│       ├── AssetSearchSelect.tsx
│       ├── TransferFlow.tsx
│       └── TransactionRow.tsx
├── lib/
│   └── queries/
│       └── transactions.ts
│   └── balance.ts
├── contexts/
│   └── TransactionContext.tsx
```

## Tasks
1. **Transaction queries** (`lib/queries/transactions.ts`): fetchTransactions (with joins, filters), fetchTransactionsByAsset, createTransaction, updateTransaction, deleteTransaction
2. **Balance recalculation** (`lib/balance.ts`): `recalculateBalance(assetId)` — fetches all transactions, computes `SUM(buy+transfer_in+dividend+interest) - SUM(sell+transfer_out+fee)`, updates `assets.balance`
3. **useTransactions hook**: Fetch, filter, addTransaction (creates + recalculates balance), refetch
4. **useAssetBalance hook**: Given asset_id, computes current balance from transactions. Used for sell validation
5. **TransactionTypeSelector**: Row of color-coded chips — Buy (green), Sell (red), Transfer In (blue), Transfer Out (orange), Dividend (purple), Interest (teal), Fee (gray)
6. **AssetSearchSelect**: Searchable combobox (shadcn Command + Popover). Assets grouped by platform. Shows "BTC - Paribu", "BTC - OKX", etc.
7. **TransferFlow**: Appears on transfer_out. Source asset (selected), destination asset picker (same ticker, different platform). Creates TWO linked transactions. Option to create destination asset if it doesn't exist
8. **AddTransactionModal**: Fields change by type:
   - All: Asset, Type, Date (defaults to now), Amount, Notes
   - Buy/Sell: + Unit Price, Price Currency (USD/TRY/EUR), Fee, Fee Currency
   - Transfer: + TransferFlow sub-form
   - Dividend/Interest: + Unit Price, Price Currency
   - Live computed "Total Cost" display
   - Sell validation: can't exceed current balance
9. **TransactionContext**: Global modal state. Any page can call `openTransactionModal(prefilledAsset?)`
10. **FAB + header button**: Floating action button on mobile (bottom-right), prominent button in Header on desktop. Both trigger `openTransactionModal()`
11. **Sell validation**: Show "Insufficient balance (have: 0.5 BTC)" in red if amount exceeds balance
12. **Date picker**: shadcn Popover + Calendar (react-day-picker). Defaults to now, allows past dates
13. **Auto-compute total_cost**: `amount * unit_price`, displayed as read-only field
14. **After-submit**: Close modal, success toast (shadcn Sonner), refresh asset/transaction list

## UI Components
- **shadcn/ui**: Dialog, Command, Popover, Calendar, Input, Label, Select, Textarea, Button, ToggleGroup, Sonner/Toast, Badge
- **Install**: `npx shadcn@latest add command popover calendar sonner textarea toggle-group`
- **Custom**: AddTransactionModal, TransactionTypeSelector, AssetSearchSelect, TransferFlow, TransactionRow

## Database
- **Write**: INSERT transactions, UPDATE assets.balance
- **Read**: transactions (with joins), assets (for balance validation)
- **Key query**: `supabase.from('transactions').select('*, assets(name, ticker, platforms(name))').eq('user_id', userId)`

## Key Decisions
- **Balance is cached**: `assets.balance` is recalculated after every transaction mutation. Avoids computing from transactions on every page load
- **Transfer = two linked transactions**: `transfer_out` + `transfer_in` linked by `related_asset_id`. Each asset's balance computed independently
- **No optimistic updates**: Wait for Supabase response before updating UI
- **TransactionContext for global modal**: Most frequent action, accessible from multiple pages
- **Fee on transaction row vs separate**: Fees on buys/sells are `fee` + `fee_currency` fields on the row. The `fee` transaction type is for standalone fees (e.g., withdrawal fee)

## Acceptance Criteria
- [ ] "Add Transaction" opens from any page (FAB on mobile, header button on desktop)
- [ ] Record a Buy: select asset, enter amount/price/currency/fee. Saved to DB
- [ ] Record a Sell: validation prevents selling more than balance
- [ ] Record a Transfer: creates linked pair, both assets' balances update
- [ ] Asset balance updates after buy/sell/transfer
- [ ] All 7 transaction types are selectable
- [ ] Date picker defaults to now, allows past dates
- [ ] Success toast after creating a transaction
- [ ] Asset search groups by platform and filters as you type
