# Component 4: Transaction System

## Status: Done

## Overview
Build the transaction recording system: an "Add Transaction" modal with support for all transaction types (buy, sell, transfer, dividend, interest, fee). Plus the cash-flow linkage: every sell auto-credits cash on the trading platform, and a buy can optionally deduct cash from any platform that holds the buy's currency. On transaction creation, recalculate the affected `(asset, platform)` balances. This is the core data-entry workflow.

## Dependencies
- Component 3 (Platform & Asset Management)

## Cash-flow linkage

### The problem this solves
Without linkage, transactions describe one-sided effects on a single `(asset, platform)` lens. Sells remove shares but produce no cash; buys add shares but draw from nowhere. A `transfer_in` of $2,000 USD onto Midas, followed by a $1,000 buy on Midas, leaves the database still claiming $2,000 USD on Midas. Either the user never tracks cash (portfolio total understates by uninvested capital) or they track it manually and each buy double-counts. The linkage feature makes cash a first-class participant.

### Requirements
- **R1 — Auto-credit on sell.** Every sell creates a cash credit on the same platform in the sell's `price_currency`. No manual second step.
- **R2 — Funding source on buy.** Every buy has an explicit funding source: either external cash (no deduction, current behavior) or "deduct from cash on platform X". X may be the trading platform, a separate bank/cash platform, or any platform holding the buy's `price_currency`.
- **R3 — Single-row UI.** A sell or platform-funded buy appears as one entry in the main transactions list. The cash side renders as a subtitle on the parent row, not a separate line. (See Component 9 for the rendering rules.)

### Storage shape: linked rows
Each cash effect is its own `transactions` row, paired to its parent via a `linked_tx_id` foreign key with `ON DELETE CASCADE`. Two new transaction types — `cash_credit` (paired to a sell) and `cash_debit` (paired to a platform-funded buy) — encode the cash side. Rationale: matches conventional ledger practice (one row, one effect), keeps balance recalculation arithmetically simple (cash rows are just rows that happen to sit on a fiat asset), and surfaces cash flow as proper transaction history.

A CHECK constraint enforces the invariant: `cash_credit`/`cash_debit` rows must have a `linked_tx_id`; non-cash rows must not.

The presence or absence of a child row, plus its `platform_id`, encodes both the mode (external vs platform_deduct) and the funding platform. There is no separate `cash_effect` column.

### Pairing rules per parent type

| Parent type                | Funding source | Paired row created? | Paired row type   | Paired `(asset, platform)`                       | Paired `amount`                                            |
|----------------------------|----------------|---------------------|-------------------|--------------------------------------------------|------------------------------------------------------------|
| `buy` (default)            | external       | No                  | —                 | —                                                | —                                                          |
| `buy` (platform_deduct)    | platform X     | Yes                 | `cash_debit`      | `(price_currency_asset, X)`                      | `total_cost + fee` if fee currency = price currency, else `total_cost` |
| `sell`                     | (always)       | Yes                 | `cash_credit`     | `(price_currency_asset, parent's platform)`      | `total_cost − fee` if fee currency = price currency, else `total_cost` |
| `transfer_in` / `transfer_out` | n/a        | No                  | —                 | —                                                | —                                                          |
| `dividend` / `interest`    | n/a (v1)       | No                  | —                 | —                                                | —                                                          |
| `fee` (standalone)         | n/a            | No                  | —                 | —                                                | —                                                          |

### UI rules
- **Buy form** shows a "Funding source" dropdown: "External cash (no deduction)" + every platform that holds the fiat asset for the buy's `price_currency`. Default is External. On edit, prefilled from the existing child if any.
- **Sell form** has no funding selector — cash always lands on the trading platform. Display a confirmation line: `Sale proceeds: $X → credited to {platform} {currency}`.
- **Insufficient cash on a platform_deduct buy** is rejected inline with the message `Insufficient {currency} on {platform} (X available, Y needed)`. No silent overdraw, no warn-and-confirm. For margin/credit cases the user records a synthetic `transfer_in` of cash first.
- **Edit-mode validation** adds back the existing child's amount when computing available cash on the same funding lens, so editing a row in place isn't falsely flagged as overdrawing because of itself.

### Edit/delete cascade
When a parent (sell or platform-funded buy) is edited, the child is reconciled against the post-edit parent:

| Existing child | Post-edit needs child | Action                                                                 |
|----------------|-----------------------|------------------------------------------------------------------------|
| No             | No                    | Nothing.                                                               |
| No             | Yes                   | Create new child.                                                      |
| Yes            | No                    | Delete child (e.g. buy switched from platform_deduct → external).      |
| Yes            | Yes                   | Update child fields in place: `asset_id`, `platform_id`, `date`, `amount`, etc. No delete/recreate. |

After reconciliation, every touched `(asset, platform)` lens is recalculated: old parent, new parent, old child (if any), new child (if any).

When a parent is deleted, Postgres' `ON DELETE CASCADE` removes the child automatically. The application captures the child's `(asset, platform)` *before* the delete and recalculates that lens explicitly afterwards.

### Non-goals (v1)
- Auto-credit for `dividend` / `interest` (current semantics preserved).
- Forex conversions modeled as `sell` of one fiat for another.
- Settle-currency override (e.g., a USD-denominated trade on a crypto exchange that physically settles in USDT).
- Editing the cash row independently of its parent.
- Migration of historical transactions — they keep their pre-feature semantics (no cash effect).
- Negative cash via "warn" or "silent allow" — only "reject with inline error".

### Selected edge cases
- Edit a sell's `price_currency` from USD to TRY → child's `asset_id` flips. Recalc both old USD and new TRY balances.
- Edit a buy's funding platform Bank → Midas → child's `platform_id` updates. Recalc both Bank and Midas USD balances.
- Inline fee in a different currency than `price_currency` → fee stays informational only; the cash row carries `total_cost` unmodified.
- Funding from a platform with exactly the required cash → allowed (insufficiency check uses `<`, not `≤`).


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
