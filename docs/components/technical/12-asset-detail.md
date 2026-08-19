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
| `src/pages/AssetDetailPage.tsx` | Page shell: reads `useParams().assetId`, pulls the view-model from `useAssetDetail`, renders header → position summary → chart → income/costs → per-platform table → interest positions (Component 16) → transaction list. Not-found state when the id resolves to no asset or an asset with no transactions and no holding. |

### View-model

| File | Role |
| --- | --- |
| `src/hooks/useAssetDetail.ts` | Composes `useAssets` + `useHoldings` + `usePrices` + `usePnL` + `useSnapshots`. Finds the asset by id; builds the same enrichment the Portfolio row gets (value = latest-snapshot `price_usd` × live balance with live-price fallback, daily return via `computeDailyReturn` with `pickBaselineSnapshot`, allocation over `totalCurrentValueUsd`) plus: per-platform slices from `holdingPnLs` (filtered to this asset, balance > 0), lifetime realized from the asset's `AssetPnL.realizedPnlUsd`, `realizedPnlPct` (realized ÷ Σ `costBasisUsd` of the asset's `RealizedPnLEntry`s from `useRealizedPnL`; null when the consumed basis ≤ 0), the return rates via `computeAssetReturnRates` (total return + MWR chip fields), income/taxes/fees sums (below), and the chart series via `buildAssetHistory`. |
| `src/lib/portfolio/assetHistory.ts` | Pure helpers, unit-tested: `buildAssetHistory(snapshots, ticker)` → `[{ date, valueUsd, valueTry, priceUsd, amount, usdTry }]` by summing the ticker's `breakdown.by_asset` entries per snapshot (platform slices summed; `price_usd` taken from the entries; `usdTry` = the snapshot's own frozen rate); `attachCostBasis(points, transactions, rates)` — replays the asset's txs (bucketed by home-local day, per platform, matching the engine's composite key) through `computeFIFOLots` up to each point's date and sums the remaining lots' USD cost into `costBasisUsd`; `filterHistoryByRange(points, range)` — same cutoff + pre-range-anchor semantics as `filterByTimeRange` in `lib/performance.ts`, applied to history points. Dates whose snapshot lacks the ticker produce no point. |
| `src/lib/pnl/assetCosts.ts` | Pure `computeAssetCostsUsd(transactions, rates)` → `{ taxesUsd, feesUsd }`: taxes = Σ `tax`-type totals; fees = Σ `fee`-type totals + Σ the `fee` field carried on the asset's other transactions — each `normalizeToUsd` at its date. Income reuses the existing `computeIncomeUsd` (`src/lib/pnl/income.ts`) over the asset-filtered transactions. |
| `src/lib/pnl/assetReturns.ts` | Pure `computeAssetReturnRates(transactions, rates, currentValueUsd, todayIso)` → `{ totalPnlUsd, mwrCumulativePct, mwrAnnualizedPct }`. Folds the asset's txs through `applyTxToInvested` (exported from `lib/performance.ts` for this) to get net invested and the per-tx deltas as `XirrFlow`s over the **asset boundary** — NOT `externalCashFlowUsd`, whose paired-cash netting is portfolio-boundary semantics. XIRR via `solveXirrLog1p` + `deannualizeLog1p` (`lib/xirr.ts`): cumulative at any age (the headline %); annualized only when `yearsBetween(firstFlow, today) ≥ MIN_ANNUALIZATION_YEARS` (exported from `lib/mwr.ts` so the gate can't drift from the dashboard's). **No peak-based %** — the user explicitly rejected it at asset level; peak stays a portfolio-headline convention. Unit-tested (`assetReturns.test.ts`), incl. the exact `1000x²−600x−720=0 → 20%/yr, +44% cumulative` case. |

### Components (`src/components/asset-detail/`)

| File | Role |
| --- | --- |
| `AssetDetailHeader.tsx` | Back link, `AssetIcon` + ticker + name, category/tag `Badge`s, current price (native + USD via the shared convention), actions: "Add Transaction" (`openTransactionModal({ assetId })`) + link to `/transactions/edit/:assetId`. |
| `AssetPositionSummary.tsx` | Stat cards: quantity, value (display currency), avg cost (native + USD), allocation, **total return** (amount + `mwrCumulativePct` as the headline %, with a muted `≈+Y%/yr` line only when `mwrAnnualizedPct` is non-null), unrealized return (net headline + `gross … · −… tax` annotation when `taxAccrualUsd > 0`, mirroring `PortfolioRow`), realized (amount + `realizedPnlPct`), daily return ("—" guards as on Portfolio). Sold-out variant: "no current position" + the total-return and realized cards. |
| `AssetPlatformTable.tsx` | Per-platform `Table` from the asset's `HoldingPnL` slices: platform dot + name, quantity, cost basis, value, unrealized return. Hidden when no nonzero slice. |
| `AssetHistoryChart.tsx` | Recharts `ComposedChart`: `Area` = value (display currency), `Line type="stepAfter"` = cost basis on the **value** axis (`var(--chart-4)`; TRY display converts `costBasisUsd × usdTry` per point — each date's frozen rate, never today's), `Line` = `priceUsd` on a right-hand axis; "Cost" and "Price" toggle buttons, `TimeRangeSelector` (reused from performance) above; the live "now" point is appended by `useAssetDetail` (held positions only, with `costBasisUsd` = the engine's current figure). `< 2` in-range points → "not enough history" hint. Exported via `LazyChart.tsx` + `<Suspense>` (Recharts stays code-split). |
| `AssetIncomeCosts.tsx` | Cards for income / taxes / fees (USD, obfuscation-aware); zero-valued cards omitted. |
| `AssetInterestSection.tsx` | **Component 16's** management home, rendered between the platform table and the transaction list: this asset's open interest positions with add / edit / close / reopen / delete, a "Show N closed" history toggle, display-time `$/yr` + per-term estimates, and a cross-link to `/campaigns` when the latest research run still has live rows for this ticker. Reads `InterestContext`; writes nothing to holdings, transactions or P&L. See [technical/16-interest.md](16-interest.md). |

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
