# Component 6: P&L Engine

## Status: Done

## Recent updates

- **Cash flow linkage (2026-05-09):** added two paired transaction types — `cash_credit` (auto-paired to a sell, lands cash on the trading platform) and `cash_debit` (auto-paired to a platform-funded buy, deducts cash from any platform). Linked to the parent via `transactions.linked_tx_id` (FK with `ON DELETE CASCADE`). FIFO **ignores** these types — they have no `case` arm in the switch, so they don't push lots or consume them. Cash is the medium of exchange, not a tradeable position; including cash rows would create meaningless lots on USD/TRY/EUR. See `docs/cash-flow-feature-design.md`.
- **`applyTxToInvested` (`src/lib/performance.ts`) extended (2026-05-10):** the dashboard's net-invested-capital calculation now accounts for `cash_credit` (`+totalUsd`) and `cash_debit` (`-totalUsd`). Without this, modern sells double-counted: their proceeds left "invested" via the `sell` rule but stayed on-platform via the auto-paired `cash_credit` row in the snapshot, producing a +$1,176 dashboard-vs-portfolio P&L gap.
- **`usePnL` reads `currentValueUsd` from the snapshot (2026-05-10):** per-(asset, platform) value now comes from `snapshot.breakdown.by_asset` keyed on `(ticker, platform_name)`. `balance × live price` is the fallback only when the snapshot has no entry for the lookup. Cost basis stays FIFO-from-`transactions` because it has no second source to drift against.

## Overview
Implement the FIFO cost basis calculation engine for realized and unrealized P&L. Build the currency normalization layer that converts all transaction prices to USD using historical exchange rates. Pure computation layer — no new UI pages, provides data consumed by Dashboard, Portfolio, and Transactions pages.

## Dependencies
- Component 4 (Transaction System)
- Component 5 (Price Engine)

## File Structure
```
src/
├── lib/
│   ├── pnl/
│   │   ├── fifo.ts                     # FIFO cost basis engine
│   │   ├── unrealized.ts               # Unrealized P&L calculator
│   │   ├── currency.ts                 # Currency normalization
│   │   └── types.ts                    # CostLot, PnLResult, AssetPnL types
│   └── queries/
│       └── pnl.ts                      # Queries for P&L data
├── hooks/
│   ├── usePnL.ts                       # Computes P&L for asset or portfolio
│   └── useCostBasis.ts                 # Gets FIFO lots for an asset
```

## Tasks
1. **P&L types** (`lib/pnl/types.ts`):
   - `CostLot`: { id, date, amount, unitPriceOriginal, priceCurrency, unitPriceUsd }
   - `RealizedPnLEntry`: { transactionId, date, amount, proceedsUsd, costBasisUsd, realizedPnlUsd, lots[] }
   - `AssetPnL`: { assetId, ticker, costBasisUsd, currentValueUsd, unrealizedPnlUsd, unrealizedPnlPct, realizedPnlUsd, lots[] }

2. **FIFO engine** (`lib/pnl/fifo.ts`):
   - `computeFIFOLots(transactions[]): { lots: CostLot[], realized: RealizedPnLEntry[] }`
   - Takes single-asset transactions sorted by date ASC
   - Buy/transfer_in/dividend/interest: push new CostLot
   - Sell: pop lots FIFO, compute realized P&L per consumed lot
   - Transfer_out: pop lots FIFO (no P&L — lots move to destination)
   - Transfer_in: push lot with **original cost basis** from linked transfer_out
   - Fee: treated as realized loss

3. **Currency normalization** (`lib/pnl/currency.ts`):
   - `normalizeToUsd(amount, currency, date, exchangeRates)`: Convert to USD using rate for given date
   - `getExchangeRateForDate(date, rates)`: Binary search for closest rate on or before date
   - Handles: TRY->USD (÷ usd_try), EUR->USD (via eur_try/usd_try), USD->USD (identity)

4. **Unrealized P&L** (`lib/pnl/unrealized.ts`):
   - `computeUnrealizedPnL(lots, currentPriceUsd, balance)`: Returns costBasisUsd, currentValueUsd, unrealizedPnlUsd, unrealizedPnlPct
   - Handle division by zero for costBasis

5. **P&L queries** (`lib/queries/pnl.ts`):
   - `fetchTransactionsForPnL(assetId)`: All transactions for asset, date ASC
   - `fetchAllExchangeRates()`: All rates, date ASC (cached in memory)
   - `fetchTransactionsForAllAssets(userId)`: All transactions with asset join, grouped by asset_id then date ASC

6. **usePnL hook**:
   - `usePnL(assetId?)`: If assetId, compute for one asset. If not, compute for all active assets
   - Returns { assetPnLs[], totalCostBasisUsd, totalCurrentValueUsd, totalUnrealizedPnlUsd, totalRealizedPnlUsd, loading }
   - Depends on transactions, prices, exchange rates
   - Memoized (recalculates when deps change)

7. **useCostBasis hook**:
   - `useCostBasis(assetId)`: Returns { lots[], totalCostUsd, avgCostUsd, loading }
   - Used for asset detail views

8. **Transfer cost basis propagation**:
   - When creating a transfer (Component 4), compute weighted average cost of transferred lots
   - Store as `unit_price` on the transfer_in transaction
   - FIFO engine treats transfer_in like a buy at that cost
   - **Update Component 4's transfer flow** to call FIFO engine for cost calculation

9. **Fiat asset P&L**: Skip P&L for `category === 'fiat'`. Just show current value, return zero P&L

## Key Decisions
- **FIFO runs client-side**: With <10,000 transactions, fast enough in browser. No server computation needed
- **Exchange rates fetched once and cached**: Small table, binary-search for lookups
- **Transfer cost basis via weighted average**: Simplified for MVP. Accurate enough, avoids cross-asset lot tracking complexity
- **Fiat P&L skipped**: Computing TRY/USD/EUR P&L is complex and low-value for MVP
- **Fee transactions = realized losses**: `fee_amount * current_price_usd` keeps balance math correct
- **No P&L stored in DB**: Computed on-the-fly. Avoids staleness and complex invalidation

## Acceptance Criteria
- [ ] Buy sequence correctly produces cost lots in FIFO order
- [ ] Sell after multiple buys computes correct realized P&L using FIFO
- [ ] TRY-denominated transactions correctly convert to USD using historical rates
- [ ] Unrealized P&L uses current price vs. cost basis of remaining lots
- [ ] Transfers preserve cost basis (no realized P&L on transfer)
- [ ] usePnL returns correct data for UI components
- [ ] Fiat assets return zero P&L without errors
