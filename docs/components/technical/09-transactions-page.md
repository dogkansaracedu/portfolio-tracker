# Component 9: Transactions Page — Technical (this build)

> Layer: React/Vite/Supabase implementation. Contract → [../09-transactions-page.md](../09-transactions-page.md)

## Stack

- React 19 + Vite + TypeScript; Tailwind 4 + shadcn/ui (`Table`, `Card`, `Badge`,
  `Select`, `Popover`, `Calendar`, `Command`, `DropdownMenu`, `AlertDialog`,
  `Button`).
- BigNumber.js for all money math; realized P&L and FX conversions stay in
  BigNumber and only `.toNumber()` at the render boundary.
- Data via React Context + hooks (no react-query). Two distinct contexts back this
  page — see the split below.
- Display currency from `DisplayContext`; the record/edit modal + a tx-version
  signal from `TransactionContext`.
- Supabase Postgres for storage; queries live in `src/lib/queries/transactions.ts`.

## File map

**Pages**
- `src/pages/TransactionsPage.tsx` — the log page shell. Pulls
  `{ transactions, loading, filters, setFilters, summary }` from `useTransactionLog`,
  the `transaction → realized` map from `useRealizedPnL`, and the modal opener from
  `TransactionContext`. Header has **Add Transaction** (opens modal) and **Bulk add**
  (links to `/transactions/edit`). It separately fetches the linked-child map for the
  visible parents (`fetchLinkedChildrenForParents`) and threads it to the list.
- `src/pages/TransactionsEditPage.tsx` — the **bulk-import / spreadsheet** page (full
  viewport, rendered outside the app layout). `/transactions/edit` = blank bulk-add
  canvas; `/transactions/edit/:assetId` = that asset's existing rows, editable, asset
  column locked. This is the **import entry surface**, owned by Component 4 — it hosts
  `sheet/TransactionsSheetGrid` plus `sheet/ImportPopover` and
  `sheet/MidasPdfImportButton`. (NB: single-transaction edits do **not** happen here —
  they use the modal; see gotchas.)

**Components** (`src/components/transactions/`)
- `TransactionList.tsx` — branches desktop `Table` vs mobile card list; maps rows,
  joining `childMap.get(tx.id)` and `realizedByTx.get(tx.id)` per row.
- `TransactionRow.tsx` — one desktop table row; calls `deriveTransactionDisplay(...)`
  for sign/color/converted/realized, then renders cells.
- `TransactionFilters.tsx` — date presets + two `Calendar` popovers, asset `Select`,
  platform `Select`, and the type chips; pushes changes through `onFiltersChange`.
- `TransactionSummary.tsx` — three stat `Card`s: count, buy volume, sell volume.
- `TransactionTypeSelector.tsx` — exports **both** `TransactionTypeSelector` (the
  single-pick chip row used by the editor) and `TransactionTypeBadge` (the colored
  per-row badge); config from `@/lib/constants/transaction-types`.
- `AssetSearchSelect.tsx` — searchable `Command` asset picker (used by the editor;
  the *filter* uses a plain `Select`, not this).
- `FundingSourceSelect.tsx` — funding-source `Select` for buys (platform-deduct vs
  `EXTERNAL_CASH_VALUE` = no cash leg); shows each platform's fiat balance. Editor-side.
- Supporting (not in the brief but load-bearing): `TransactionRowShared.tsx`
  (`TransactionRowActions` edit/delete menu + confirm dialog, `TransactionAssetLabel`
  subtitle, `RealizedPnLLine`), `transactionRowModel.ts` (`deriveTransactionDisplay`,
  `formatTxDate`), `TransactionRowCard.tsx` (mobile card).

**Hooks** (`src/hooks/`)
- `useTransactionLog.ts` — the page's view-model. Reads/writes filters via URL search
  params (`useSearchParams`); first visit with empty params seeds `dateFrom = Jan 1
  this year` (`thisYearStartISO`) behind a `useRef` once-guard so picking "All Time"
  doesn't bounce back. Sends date/asset/platform to the **server** query
  (`useTransactions(serverFilters)`); applies the **type** filter client-side; builds
  the `summary` (count + buy/sell volume) by `normalizeToUsd`-ing each row's total.
- `useTransactions.ts` — two exports: `useTransactionMutations()` (create/edit/delete
  only, **no fetch**) and `useTransactions(filters)` (server-filtered list + the
  mutations). The split is deliberate (see gotchas). Mutations call
  `recalculateBalance` per affected `(asset, platform)` lens, then `refresh()` +
  `bumpTxVersion()`.
- `useRealizedPnL.ts` — `useMemo` over the **global** SoT (`useTransactionData()`),
  `buildRealizedByTx(transactions, rates)` → `Map<txId, RealizedPnLEntry>`. Empty map
  while loading. Computed over full history, not the filtered slice.

**Contexts** (`src/contexts/`)
- `TransactionDataContext.tsx` — the **shared source of truth**: fetches the full
  transaction history + all exchange rates once (`fetchTransactionsForAllAssets`,
  `fetchAllExchangeRates`), exposes `{ transactions, rates, loading, refresh }`.
  Re-fetched by `refresh()` after any mutation. This is what `useRealizedPnL` and the
  log's FX-normalized summary read.
- `TransactionContext.tsx` — UI/coordination only: the add/edit **modal** state
  (`openTransactionModal({ edit })`), plus `txVersion` + `bumpTxVersion()`, a
  monotonic counter every `useTransactions` instance watches so all list slices
  refetch together after a mutation.

**Queries**
- `src/lib/queries/transactions.ts` — `fetchTransactions(userId, filters)` (server
  date/asset/platform filter + `assets`/`platforms` joins, ordered date DESC),
  `fetchLinkedChildrenForParents(ids)` → `Map<parentId, child>`, `fetchLinkedChild`,
  and the create/update/delete used by the mutations.

## Notes & gotchas

- **Why two contexts (the request-flood fix).** `TransactionDataContext` shares the
  fetched rows through a provider so consumers don't each refetch. Originally one
  combined hook both fetched the full table *and* exposed a row's delete action;
  rendering N rows mounted N copies and fired N identical full-table fetches.
  The fix: `useTransactionMutations()` exposes actions with **no** fetch, so
  `TransactionRowShared`'s per-row delete button (and the modal/sheet) take an action
  without triggering a load. Only `useTransactionLog` (one instance) fetches a slice.
  Don't reintroduce a fetch into the mutations hook or into row components.
- **Two refresh signals, both load-bearing.** After a mutation: `refresh()` refetches
  the global SoT (so P&L / summary / dashboard update), `bumpTxVersion()` nudges the
  server-filtered slices (`useTransactions`, `useHoldings`). They serve orthogonal
  consumers — keep both.
- **Server vs client filtering.** Date/asset/platform are pushed into the Postgres
  query; **type** is filtered in `useMemo` after fetch (it's cheap and multi-select).
  There is **no "Load more"** — the date-bounded server slice is rendered whole; the
  default current-year window keeps it small. Filters live in the URL, not React
  state, so they're shareable and survive reload.
- **Realized P&L join.** `useRealizedPnL` runs FIFO over the **full** history
  (global SoT) and returns a `txId → entry` map; the row looks up its own id. So
  filtering the visible log never changes a sell's realized number. The number is
  the same engine the dashboard/portfolio use (`@/lib/pnl/realized`,
  `RealizedPnLEntry`) — do not recompute locally.
- **USD is the realized source of truth.** `deriveTransactionDisplay` derives sign,
  color, and `%` from `realizedPnlUsd`; the native figure is either the engine's
  `nativePnl` (when its `nativeCurrency` matches) or `fromUsdOnDate(...)`. A lira gain
  can read red if it's a dollar loss — intended.
- **Edit is a modal, not the edit *page*.** `TransactionRowActions` → `handleEdit`
  calls `openTransactionModal({ edit: tx })`. The route literally named
  `/transactions/edit` is the **bulk sheet**, not single-row editing. The page is
  named "edit" for the spreadsheet UX; don't conflate the two.
- **Edit balance/cash reconciliation lives in the mutation, not the page.**
  `editTransaction` recalcs both old and new `(asset, platform)` lenses if they
  changed and updates/creates/deletes the linked cash child to match — including the
  subtlety that the bulk-sheet edit path passes **no** funding option, so it falls
  back to the existing child's platform for a buy (updating its `cash_debit` in place
  instead of orphaning it). Delete relies on `ON DELETE CASCADE` for the child but
  still recalcs the cash-asset balance.
- **Summary is USD-normalized.** Buy/sell volume sum `normalizeToUsd(total, ...)` per
  row using dated rates from the global SoT, so mixed-currency activity is comparable;
  it then renders in the display currency. Only 3 stats exist (count, buy, sell) —
  the old spec's "net realized / net deposit" cards were never built.
- **Linked-child subtitle is fetched separately.** `TransactionsPage` runs
  `fetchLinkedChildrenForParents(parentIds)` for the currently-visible parents and
  passes `childMap` down; `TransactionAssetLabel` reads the child's `amount` /
  `price_currency` / `platforms.name` for the subtitle — it is not recomputed from the
  parent. A buy with no child renders the `external cash` hint.
- **Colors here predate the canonical palette.** The realized line / amount sign use
  `text-green-600` / `text-red-600` directly (not `gainLossClass` /
  `formatSignedCurrency`). NOTED, not fixed — flagged for a later pass to align with
  the app-wide gain/loss helpers per the project convention.
