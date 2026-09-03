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
  (links to `/transactions/edit`); its title block is the shared `PageHeading`
  (`src/components/common/PageHeading.tsx`, `hidden md:block`) so the phone
  header is the only page title. It separately fetches the linked-child map for the
  visible parents (`fetchLinkedChildrenForParents`) and threads it to the list.
- `src/pages/TransactionsEditPage.tsx` — the **bulk-import / spreadsheet** page (full
  viewport, rendered outside the app layout). `/transactions/edit` = blank bulk-add
  canvas; `/transactions/edit/:assetId` = that asset's existing rows, editable, asset
  column locked. Header and footer sit on `bg-card` + a `border-b`/`border-t`
  hairline (the old `bg-zinc-900` chrome made the outline import triggers
  invisible in light mode); Save is a plain primary `Button`, and the only exit is
  the footer's "Discard and go back" beside it. On `< sm` the header's actions are
  icon-only so it stays one row, the footer carries `pb-safe-4`, and while the
  grid holds no real rows (`counts.new + dirty + clean + deleted === 0`) the
  `<main>` is `max-sm:hidden` behind an import-first panel — `BULK_EDITOR_PHONE_INTRO`,
  a `labelled` `ImportPopover` and `MidasPdfImportButton`, and a ghost
  "…or add a row by hand" calling `controls.addBlankRow`. The grid stays
  mounted throughout: it is what publishes `controls`. This is the **import entry surface**, owned by Component 4 — it hosts
  `sheet/TransactionsSheetGrid` plus `sheet/ImportPopover` and
  `sheet/MidasPdfImportButton`. (NB: single-transaction edits do **not** happen here —
  they use the modal; see gotchas.)

**Components** (`src/components/transactions/`)
- `TransactionList.tsx` — branches desktop `Table` (`hidden xl:block`) vs card list
  (`xl:hidden`); maps rows, joining `childMap.get(tx.id)` and
  `realizedByTx.get(tx.id)` per row. The `xl` split matches `PortfolioTable`: the
  eight columns need ~930px and below 1280 the shell leaves at most 736px beside
  the 240px sidebar.
- `TransactionRow.tsx` — one desktop table row. It and `TransactionRowCard` take
  the same `TransactionRowProps` (`transactionRowModel.ts`) and get their model
  from the same `useTransactionRowDisplay(props)` (`TransactionRowShared.tsx`),
  which reads the rates off the shared store and returns
  `{ transferPair, display }` — `deriveTransactionDisplay`'s
  sign/converted/realized figures. The row then renders cells. Quantity / Unit Price / Total
  cells and their `TableHead`s carry `text-right` + `tabular-nums`; the `(~…)`
  display-currency equivalent renders as a `div` (its own second line), not an
  inline span. A linked transfer pair
  (`isTransferPair(tx, linkedChild)` — transfer_out parent + transfer_in child)
  renders combined: `TransferRoute` (source → destination with platform dots) in the
  platform cell, the `TRANSFER_PAIR_DISPLAY` "Transfer" badge, and a neutral quantity
  (`deriveTransactionDisplay`'s `transferPair` option drops sign + colour). Quantity
  column header/label says "Quantity" (matches Portfolio), not "Amount".
- `sheet/TransactionsSheetGrid.tsx` — below `sm` the row-number and Ticker cells
  carry `PINNED_ROW_NUMBER_CLASS` / `PINNED_TICKER_CLASS` (`sticky`, `left-0` /
  `left-10`, an opaque `bg-background`, and a fixed `w-10` on the row number so
  the ticker's offset matches it exactly); `AssetCell` takes a `className` for
  this. Header copies sit above the body cells (`z-30` vs `z-10`).
- `TransactionFilters.tsx` — date presets + two `Calendar` popovers, asset `Select`,
  platform `Select`, and the type chips; pushes changes through `onFiltersChange`.
  The three rows sit inside the shared `common/Disclosure` with
  `triggerClassName="sm:hidden"` / `contentClassName="… sm:block"`, so below `sm`
  they collapse behind `Filters (n)` (`activeFilterCount` = asset + platform +
  each chosen type, plus the date window only when `activePreset` differs from
  `DEFAULT_DATE_PRESET` — a fresh visit already carries "This Year", so counting
  it would mean the badge never reads 0) and from `sm` up they are always open
  with no trigger.
  The chips render `FILTERABLE_TYPES` (the user-pickable stored types **plus** the
  derived `TRANSFER_PAIR_FILTER_TYPE`, placed right after Deposit and Withdrawal) with
  `FILTER_TYPE_DISPLAY` (= `TRANSACTION_TYPE_DISPLAY` + `TRANSFER_PAIR_DISPLAY`), so
  the Transfer chip wears exactly the row badge's neutral slate. `USER_PICKABLE_TYPES`
  stays the editor/sheet's list — the pseudo-type must never be selectable there.
- `TransactionSummary.tsx` — one `figures` array rendered twice: a single
  `sm:hidden` `Card` holding a 3-column strip (label over value, `text-xs`) for the
  phone, and the three stat `Card`s from `sm` up. All render in the default
  foreground: volumes are turnover, so they never go through `gainLossClass`.
- `TransactionTypeSelector.tsx` — exports **both** `TransactionTypeSelector` (the
  single-pick chip row used by the add/edit modal) and `TransactionTypeBadge` (the
  colored per-row badge); config from `@/lib/constants/transaction-types`. The chip
  row renders `PICKABLE_TYPE_CHOICES` (an alias of `FILTERABLE_TYPES`) with
  `FILTER_TYPE_DISPLAY`, so the form offers the same nine choices the log filters
  by — including the derived `TRANSFER_PAIR_FILTER_TYPE` "Transfer" chip.
- `AssetSearchSelect.tsx` — searchable `Command` asset picker (used by the editor;
  the *filter* uses a plain `Select`, not this).
- `FundingSourceSelect.tsx` — funding-source `Select` for buys (platform-deduct vs
  `EXTERNAL_CASH_VALUE` = no cash leg); shows each platform's fiat balance. Editor-side.
- Supporting (not in the brief but load-bearing): `TransactionRowShared.tsx`
  (`TransactionRowActions` edit/delete menu + confirm dialog — pair-aware: names
  both sides when deleting a linked transfer; `TransactionAssetLabel` subtitle —
  cash legs only, a transfer child renders no subtitle; `TransferRoute`;
  `isTransferPair`; `useTransactionRowDisplay`; `RealizedPnLLine`),
  `transactionRowModel.ts`
  (`deriveTransactionDisplay` — no `amountColor` any more; the realized line's
  colour comes from `gainLossClass` and its `%` from
  `formatSignedPercent(…, DECIMALS.percentage)`; `collapseLinkedTransferIns`,
  `formatTxDate`, plus the
  derived-type filter predicates `transferPairParentIds` / `matchesFilterType` /
  `matchesAnyFilterType`),
  `TransactionRowCard.tsx` (mobile card — same pair rendering as the table row).

**Hooks** (`src/hooks/`)
- `useTransactionLog.ts` — the page's view-model. Reads/writes filters via URL search
  params (`useSearchParams`); first visit with empty params defaults to `dateFrom = Jan
  1 this year` (`thisYearStartISO`) behind a `useRef` once-guard so picking "All Time"
  doesn't bounce back. The default is applied **synchronously in the `filters` memo on
  the first render** (not only via the URL-seeding effect), so the first and only server
  fetch already carries `dateFrom`. Seeding through the effect alone would fire an
  unfiltered full-history fetch first and refetch once the param landed (two requests,
  plus a duplicate child-row fetch, per visit). Sends date/asset/platform to
  the **server** query
  (`useTransactions(serverFilters)`); applies the **type** filter client-side, then
  `collapseLinkedTransferIns` — a linked `transfer_in` whose parent survived the
  filters is folded into the parent's combined row (`AssetDetailPage` applies the
  same collapse to its asset-filtered slice). The type filter runs through
  `matchesAnyFilterType(tx, filters.types, pairParentIds)` (derived-type matching, see
  gotchas), with `pairParentIds` memoized from `transferPairParentIds(allTransactions)`
  over the **global** SoT. Builds
  the `summary` (count + buy/sell volume) by `normalizeToUsd`-ing each row's total —
  over the same post-filter rows, so the stat cards always agree with the visible list.
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
  date/asset/platform filter + `assets`/`platforms` joins, ordered date DESC; the
  default "hide children" clause is `linked_tx_id IS NULL OR type = transfer_in`, so
  linked transfer_ins stay fetchable under a destination-platform filter and are
  collapsed client-side instead), `fetchLinkedChildrenForParents(ids)` →
  `Map<parentId, child>`, `fetchLinkedChild`, and the create/update/delete used by
  the mutations.

## Notes & gotchas

- **Why two contexts, and why mutations don't fetch.** `TransactionDataContext` shares
  the fetched rows through a provider so consumers don't each refetch, and
  `useTransactionMutations()` exposes actions with **no** fetch, so
  `TransactionRowShared`'s per-row delete button (and the modal/sheet) take an action
  without triggering a load. Only `useTransactionLog` (one instance) fetches a slice.
  A single combined fetch-and-mutate hook would mount N copies for N rendered rows and
  fire N identical full-table fetches — don't reintroduce a fetch into the mutations
  hook or into row components.
- **Two refresh signals, both load-bearing.** After a mutation: `refresh()` refetches
  the global SoT (so P&L / summary / dashboard update), `bumpTxVersion()` nudges the
  server-filtered slices (`useTransactions`, `useHoldings`). They serve orthogonal
  consumers — keep both.
- **The type filter matches the derived type, not `type`.** `transactionRowModel.ts`
  owns three pure helpers: `transferPairParentIds(rows)` → the set of `transfer_out`
  ids that own a `transfer_in` child; `matchesFilterType(tx, chip, parentIds)`;
  `matchesAnyFilterType(...)` (union over the active chips). Semantics:
  `TRANSFER_PAIR_FILTER_TYPE` matches **either** side of a linked pair (the child too,
  so a destination-platform filter still surfaces the transfer as its own directional
  row); `transfer_out` matches only a `transfer_out` that is *not* a pair parent;
  `transfer_in` only one with `linked_tx_id == null`; anything else is a plain
  `tx.type ===` match. Covered by `transactionRowModel.test.ts`. Only the child row
  carries the link, so "is this internal?" is unanswerable from the parent alone —
  hence the parent-id set. **No schema change:** the linkage already encodes it.
- **Why the pair set comes from the global SoT.** `useTransactionData()` already holds
  the full unfiltered history in memory, so `transferPairParentIds` needs **no extra
  request** and no PostgREST `NOT EXISTS` workaround, and the answer can't flip when a
  date or platform filter drops the other side of a pair out of the fetched slice.
  Deriving it from `rawTransactions` instead would leak pair parents into "Withdrawal"
  whenever the destination side fell outside the window.
- **Server vs client filtering.** Date/asset/platform are pushed into the Postgres
  query; **type** is filtered in `useMemo` after fetch (it's cheap, multi-select, and
  the pair-parent test isn't expressible in PostgREST).
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
  instead of orphaning it). A transfer pair is reconciled *before* the cash logic:
  the linked `transfer_in` follows its `transfer_out` in lockstep (see Component 4
  technical). Delete relies on `ON DELETE CASCADE` for the child but
  still recalcs the child's `(asset, platform)` balance.
- **Summary is USD-normalized.** Buy/sell volume sum `normalizeToUsd(total, ...)` per
  row using dated rates from the global SoT, so mixed-currency activity is comparable;
  it then renders in the display currency. Only 3 stats exist: count, buy volume,
  sell volume.
- **Linked-child subtitle is fetched separately.** `TransactionsPage` runs
  `fetchLinkedChildrenForParents(parentIds)` for the currently-visible parents and
  passes `childMap` down; `TransactionAssetLabel` reads the child's `amount` /
  `price_currency` / `platforms.name` for the subtitle — it is not recomputed from the
  parent. A buy with no child renders the `external cash` hint.
- **Known deviation from the canonical palette.** The realized line / amount sign use
  `text-green-600` / `text-red-600` directly instead of the app-wide `gainLossClass` /
  `formatSignedCurrency` helpers.
