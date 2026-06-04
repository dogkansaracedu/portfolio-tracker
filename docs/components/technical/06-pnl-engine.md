# Component 6: P&L Engine — Technical (this build)

> Layer: React/Vite/Supabase implementation. Contract → [../06-pnl-engine.md](../06-pnl-engine.md)

## Stack

- Pure TypeScript compute in `src/lib/pnl/*` + `src/lib/performance.ts`; no DB
  reads inside the math (all money/quantity values are `BigNumber.js`).
- React hooks (`src/hooks/*`) wire the pure functions to context-provided data
  and memoize on `[transactions, rates, holdings, prices, snapshots]`.
- Supabase (Postgres) is the only data source — reached via `src/lib/queries/pnl.ts`.
- Nothing is computed server-side and nothing is stored; FIFO replays client-side
  on every change (fine at < 10k transactions).

## File map

### `src/lib/pnl/*` — the pure engine

| File | Role |
| --- | --- |
| `types.ts` | `CostLot`, `ConsumedLot`, `RealizedPnLEntry`, `FIFOResult`, `UnrealizedPnLResult`, `AssetPnL`, `PortfolioPnL`. |
| `fifo.ts` | `computeFIFOLots(txs, rates)` — oldest-first lot engine (buy/transfer/dividend/interest push, sell/fee consume, transfer_out P&L-neutral; fees capitalized; cash legs ignored). Also `computeTransferCostBasis()` for weighted-avg transfer cost. |
| `currency.ts` | `getExchangeRateForDate` (binary search ≤ date, earliest-rate fallback), `normalizeToUsd`, `unitPriceToUsd`, `fromUsdOnDate` (display inverse), `convertOnDate`. |
| `unrealized.ts` | `computeUnrealizedPnL(lots, currentPriceUsd, balance)` → cost basis, current value, unrealized USD + %. |
| `realized.ts` | `buildRealizedByTx(txs, rates)` → `Map<txId, RealizedPnLEntry>` over full history; groups per `asset_id|platform_id` (same composite key as `usePnL`). |
| `totals.ts` | `summarizePnLTotals({ totalCurrentValueUsd, totalInvestedUsd })` → **canonical money-weighted Total P&L** = value − net invested, % over `|invested|`. |
| `daily.ts` | `computeDailyReturn(input)` + `dailyReturnPct(returnUsd, denomUsd)` — money-weighted day P&L; returns `null` pct when `denom ≤ 0`. Carries `denomUsd` so group rollups sum and call `dailyReturnPct` once. |

### `src/lib/performance.ts` — cash-flow + time series

- `computeCurrentInvestedUsd(txs, rates)` → **net invested capital** (the
  `applyTxToInvested` convention: buy/fee +, sell/dividend/interest −, transfers
  cancel, `cash_credit`/`cash_debit` cancel their paired trade). Used both as the
  portfolio denominator and as each fiat holding's cost basis.
- `computePnLTimeSeries(snapshots, txs, rates)` → historical `{date, totalUsd,
  investedUsd, pnlUsd}` points (`snapshot.total_usd − cumulative invested`); the
  series the chart draws and the "now" anchor must reconcile with.
- Also houses `computeMonthlyReturns` (Modified Dietz), YTD/all-time/CAGR,
  drawdown, and `computeCategoryAttribution` (Component 10 territory, but
  consumes `AssetPnL`).

### `src/hooks/*` — wiring

| Hook | Role |
| --- | --- |
| `usePnL(holdings, prices)` | FIFO per (asset, platform) → aggregate to asset → `PortfolioPnL`. Fiat branch skips FIFO and uses `computeCurrentInvestedUsd` for cost basis (FX P&L → unrealized). Returns per-asset + totals **plus `transactions`, `rates`** (so callers don't refetch). Realized total is a separate `[transactions, rates]` memo over **full history** (sold-out positions have no holdings row). |
| `useCostBasis(assetId, platformId)` | Open FIFO lots + total/avg cost for one holding (asset detail views). |
| `useRealizedPnL()` | `buildRealizedByTx` over full history → `Map<txId, RealizedPnLEntry>` for the Transactions page (join by `tx.id`). |
| `usePnLSummary()` | Current-day surface for Dashboard hero + Portfolio summary: feeds `usePnL` totals into `summarizePnLTotals`, adds TRY conversion. The single shared headline. |

Data arrives via `TransactionDataContext` (transactions + rates), `useSnapshots`,
`useHoldings`, `usePrices` — never per-call-site fetches.

### `src/lib/queries/pnl.ts` — data access

- `fetchTransactionsForPnL(assetId, platformId)` — one holding, date ASC.
- `fetchTransactionsForAllAssets(userId)` — all txs, ordered asset → platform →
  date (hook does the grouping).
- `fetchAllExchangeRates()` — whole (small) rate table, date ASC, cached in memory
  for binary search.

## Notes & gotchas

- **BigNumber everywhere; `.toNumber()` only at the UI boundary.** The engine and
  `applyTxToInvested` stay in `BigNumber`; hooks convert at the very edge
  (`usePnLSummary`, the chart series). Don't introduce float math mid-pipeline.
- **This is the SINGLE P&L engine.** The headline must stay `value − net invested`
  (`summarizePnLTotals`). Do **not** reintroduce a FIFO `unrealized + realized`
  total — that historical bug made the live "now" point disagree with the
  snapshot-derived chart line whenever fiat FX was non-trivial (~$915 gap on
  2026-06-03). See [P&L Methodology](../pnl-methodology.md).
- **Fiat skips FIFO lots but still carries FX P&L** via the cash-flow invested
  path (`computeCurrentInvestedUsd` over the holding's own txs in `usePnL`'s fiat
  branch). `fifo.ts` itself ignores `cash_credit`/`cash_debit`.
- **FIFO is keyed per (asset, platform)**, then aggregated to asset — lots only
  match within a holding. Pass the **full unfiltered** tx set: matching a sell
  against the oldest open lots needs complete prior history, so running over a
  filtered (e.g. Transactions-page) view yields wrong cost bases. The aggregated
  `AssetPnL` omits `lots` (they're per-platform; use `useCostBasis`).
- **`nativePnl` / `costBasisNative` are present only when single-currency.** A
  mixed-currency holding (e.g. a USD `transfer_in` into a TRY-traded asset) drops
  to `null` — UI falls back to the USD figure.
- **Current value comes from the snapshot, not FIFO.** `usePnL` reads
  per-(ticker, platform) `price_usd` from the latest snapshot × **live** balance
  (quantity changes show immediately; prices stay snapshot-consistent), falling
  back to the live price for holdings not yet in the latest snapshot. Cost basis
  stays a pure function of `transactions` (no second source to drift against).
- **Rate lookup degrades, never errors.** Missing rate for a date → earliest
  known rate (bulk import also backfills via `ensureHistoricalRate`); a hard miss
  warns and returns the amount as-is.
