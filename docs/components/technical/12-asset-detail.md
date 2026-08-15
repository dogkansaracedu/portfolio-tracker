# Component 12: Asset Detail — Technical (this build)

> Layer: React/Vite/Supabase implementation. Contract → [../12-asset-detail.md](../12-asset-detail.md)

## Stack

- React 19 + Vite + TypeScript; Tailwind 4 + shadcn/ui (`Card`, `Table`,
  `Button`, `Badge`); Recharts for the history chart (lazy-loaded).
- BigNumber.js for all money/quantity math; `.toNumber()` only at the render
  boundary.
- Data via the shared context-backed hooks (`useAssets`, `useHoldings`,
  `usePrices`, `usePnL`, `useSnapshots`) — same sources as the Portfolio page,
  so figures can't drift. The inline transaction list reuses the Transactions
  page's server-filtered fetch (`useTransactions({ assetId })`), the accepted
  per-page pattern there.
- **No new P&L math** — the page is a view-model composition of `AssetPnL`,
  `HoldingPnL`, `computeDailyReturn`, `computeIncomeUsd`, and snapshot
  `breakdown.by_asset` entries.

## File map

### Route + page

| File | Role |
| --- | --- |
| `src/App.tsx` | Adds `<Route path="assets/:assetId" …>` (lazy, inside `AppLayout`). |
| `src/pages/AssetDetailPage.tsx` | Page shell: reads `useParams().assetId`, pulls the view-model from `useAssetDetail`, renders header → position summary → chart → income/costs → per-platform table → transaction list. Not-found state when the id resolves to no asset or an asset with no transactions and no holding. |

### View-model

| File | Role |
| --- | --- |
| `src/hooks/useAssetDetail.ts` | Composes `useAssets` + `useHoldings` + `usePrices` + `usePnL` + `useSnapshots`. Finds the asset by id; builds the same enrichment the Portfolio row gets (value = latest-snapshot `price_usd` × live balance with live-price fallback, daily return via `computeDailyReturn` with `pickBaselineSnapshot`, allocation over `totalCurrentValueUsd`) plus: per-platform slices from `holdingPnLs` (filtered to this asset, balance > 0), lifetime realized from the asset's `AssetPnL.realizedPnlUsd`, income/taxes/fees sums (below), and the chart series via `buildAssetHistory`. |
| `src/lib/portfolio/assetHistory.ts` | Pure helpers, unit-tested: `buildAssetHistory(snapshots, ticker)` → `[{ date, valueUsd, valueTry, priceUsd, amount, usdTry }]` by summing the ticker's `breakdown.by_asset` entries per snapshot (platform slices summed; `price_usd` taken from the entries; `usdTry` = the snapshot's own frozen rate); `attachCostBasis(points, transactions, rates)` — replays the asset's txs (bucketed by home-local day, per platform, matching the engine's composite key) through `computeFIFOLots` up to each point's date and sums the remaining lots' USD cost into `costBasisUsd`; `filterHistoryByRange(points, range)` — same cutoff + pre-range-anchor semantics as `filterByTimeRange` in `lib/performance.ts`, applied to history points. Dates whose snapshot lacks the ticker produce no point. |
| `src/lib/pnl/assetCosts.ts` | Pure `computeAssetCostsUsd(transactions, rates)` → `{ taxesUsd, feesUsd }`: taxes = Σ `tax`-type totals; fees = Σ `fee`-type totals + Σ the `fee` field carried on the asset's other transactions — each `normalizeToUsd` at its date. Income reuses the existing `computeIncomeUsd` (`src/lib/pnl/income.ts`) over the asset-filtered transactions. |

### Components (`src/components/asset-detail/`)

| File | Role |
| --- | --- |
| `AssetDetailHeader.tsx` | Back link, `AssetIcon` + ticker + name, category/tag `Badge`s, current price (native + USD via the shared convention), actions: "Add Transaction" (`openTransactionModal({ assetId })`) + link to `/transactions/edit/:assetId`. |
| `AssetPositionSummary.tsx` | Stat cards: quantity, value (display currency), avg cost (native + USD), unrealized return (net headline + `gross … · −… tax` annotation when `taxAccrualUsd > 0`, mirroring `PortfolioRow`), realized, daily return ("—" guards as on Portfolio), allocation. Sold-out variant: "no current position" + lifetime realized headline. |
| `AssetPlatformTable.tsx` | Per-platform `Table` from the asset's `HoldingPnL` slices: platform dot + name, quantity, cost basis, value, unrealized return. Hidden when no nonzero slice. |
| `AssetHistoryChart.tsx` | Recharts `ComposedChart`: `Area` = value (display currency), `Line type="stepAfter"` = cost basis on the **value** axis (`var(--chart-4)`; TRY display converts `costBasisUsd × usdTry` per point — each date's frozen rate, never today's), `Line` = `priceUsd` on a right-hand axis; "Cost" and "Price" toggle buttons, `TimeRangeSelector` (reused from performance) above; the live "now" point is appended by `useAssetDetail` (held positions only, with `costBasisUsd` = the engine's current figure). `< 2` in-range points → "not enough history" hint. Exported via `LazyChart.tsx` + `<Suspense>` (Recharts stays code-split). |
| `AssetIncomeCosts.tsx` | Cards for income / taxes / fees (USD, obfuscation-aware); zero-valued cards omitted. |

### Reused as-is

- `TransactionList` + `useRealizedPnL` + `fetchLinkedChildrenForParents`
  (childMap) — identical composition to `TransactionsPage`, filtered to the
  asset, newest first.
- `TimeRangeSelector`, `AssetIcon`, `gainLossClass` / `formatSignedCurrency` /
  `formatSignedPercent` / `formatCurrency` / `obfuscate` from `@/lib/prices`,
  `assetNativeCurrency`.

### Link changes

- `src/components/portfolio/PortfolioRow.tsx` — both the desktop row's and the
  mobile card's asset-identity `Link` now point to `/assets/:assetId`
  (previously `/transactions/edit/:assetId`; the editor link lives on the
  detail page's header instead).

## Notes & gotchas

- **Ticker is the snapshot key, id is the route key.** `breakdown.by_asset`
  entries carry `ticker`, not asset id — `buildAssetHistory` matches on
  `asset.ticker`. Safe because the catalog is global one-row-per-ticker.
- **Sum platform slices per date.** `by_asset` holds one entry per
  ticker×platform; a date's value/amount is the sum over the ticker's entries,
  while `price_usd` is per-unit (same across slices — take it from any entry).
- **The "now" point** uses live `currentValueUsd`/`currentPriceUsd` (and the
  live TRY value), consistent with the performance chart's convention that the
  right edge equals the live headline.
- **`filterHistoryByRange` mirrors, not imports, `filterByTimeRange`** — the
  performance helper is typed to `Snapshot[]`. Keep the two cutoff rules in
  sync (incl. the ≥1M pre-range anchor point).
- **Taxes card ≠ tax accrual.** The card sums booked `tax` transactions
  (stopaj already taken); `taxAccrualUsd` (pending at-source accrual) appears
  only inside the return annotation, as on the Portfolio row.
- **Daily figures are USD-only**, matching the Portfolio page's return column.
- **Sold-out assets**: `AssetPnL` exists only for assets with holdings entries;
  a fully-exited asset may have no `assetPnLs` row — realized P&L then comes
  from the engine's full-history realized entries, and the position summary
  renders the sold-out variant. Never index `assetPnLs` unguarded.
- **Not-found guard**: resolve the asset from `useAssets()` (which includes
  inactive rows); only 404 when the id genuinely isn't in the catalog or the
  user has no transactions *and* no holding for it.
