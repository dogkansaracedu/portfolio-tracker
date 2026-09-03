# Component 4: Transaction System — Technical (this build)

> Layer: React/Vite/Supabase implementation. Contract → [../04-transaction-system.md](../04-transaction-system.md)

## Stack

- **React 19 + Vite 8 + TypeScript**, Tailwind 4 + shadcn/ui for the UI.
- **BigNumber.js** for all money/quantity math (via `@/lib/config`'s `bn`).
- **Supabase** (Postgres + Auth) for persistence; bulk insert runs through a Postgres
  RPC, single writes through table mutations.
- **papaparse** — paste/CSV parsing. **pdfjs-dist** — broker PDF text extraction,
  lazy-loaded.

## File map

### Single add / edit
- `src/components/transactions/AddTransactionModal.tsx` — the type-driven add/edit
  dialog: hydrates from edit target / prefill, prefills price from cached market data,
  forces price currency to the asset's native currency, validates balance + funding
  cash (balance-limited types come from `BALANCE_LIMITED_TYPES`; a narrower guard —
  sell/transfer_out only — shows a "Max" button that fills Quantity with the platform
  balance on create),
  computes transfer cost basis via FIFO, and on submit builds the payload and
  (for `transfer_out`) the matching `transfer_in` with `linked_tx_id` pointing at the
  just-created parent. On edit the payload carries the editing row's existing
  `linked_tx_id` through unchanged (never resets it to null). Editing a linked
  `transfer_out` (`editingTransferPair`, seeded via `fetchLinkedChild`) keeps the
  Destination Platform select visible — its value is passed as
  `transferDestPlatformId` so the lockstep child update can move the destination
  side — and shows a "saving updates both sides" hint. "Save & add another"
  keeps the form open. Layout: `DialogHeader` + `DialogBody` (the only scroll
  region) + `DialogFooter`, so the actions never leave the viewport; the footer's
  Cancel is `hidden sm:inline-flex` (the sheet's own close control is the phone's
  exit). (Sub-controls `TransactionTypeSelector`, `AssetSearchSelect`,
  `FundingSourceSelect` live alongside it — see Component 3 / 9.)

### Bulk-import subsystem — `src/components/transactions/sheet/`
- `TransactionsSheetGrid.tsx` — the spreadsheet grid. Loads existing rows (or starts
  empty in add-only mode), renders typed cells per row with status tint, and drives the
  save pipeline: validate → auto-resolve sentinels → (stepper for leftovers) → commit.
  Commits dirty rows via per-row update, new rows via the bulk RPC, deletes via per-row
  remove; lifts `Controls` up to the page chrome.
- `ImportPopover.tsx` — paste-from-spreadsheet + upload-CSV tabs; parses, shows a
  summary (rows / unknown tickers / unknown platforms), appends parsed rows to the grid.
- `MidasPdfImportButton.tsx` — file picker + parse-progress + summary for the Midas PDF
  importer; appends parsed rows. After parsing it fetches existing Midas-platform
  transactions for the statement's date range (`fetchTransactions`) and drops
  duplicates via `dedupeImportedRows` (unsaved grid rows passed in as `gridRows`
  count as existing; saved ones don't — they'd double-count with the DB fetch);
  a failed lookup aborts the import instead of skipping the check. The fetch passes
  `includeLinkedChildren: true`: a `transfer_in` linked to its `transfer_out` must
  stay in the dedup set or re-imports would duplicate it. Cash legs in that fetch
  can't false-match — parsed rows never carry `cash_credit`/`cash_debit` types.
- `dedupeImportedRows.ts` — pure count-based duplicate filter keyed on
  date|asset|type|amount|unitPrice|currency (`bn()`-normalized numbers, sentinel
  assets never match). Vitest: `dedupeImportedRows.test.ts`.
- `ResolveAssetsStepper.tsx` — modal stepper that walks each unresolved `new:TICKER`
  one at a time (category / ticker / display name / tags / price source), creates the
  asset, and reports its id + native currency back; defaults the fetch id to the ticker.
- `useTransactionsSheetState.ts` — reducer hook: row buffer, per-row status
  (clean/new/dirty/invalid), `pendingDeletes`, dirty-vs-clean diffing against an
  `original` snapshot, sentinel substitution, counts, discard.
- `parseImport.ts` — `parseClipboard`: TSV/CSV → `ParsedRow[]` via papaparse;
  header-alias + positional column detection, locale-tolerant date/number/currency/type
  normalization, ticker/platform lookup, unresolved-set collection.
- `parseMidasPdf.ts` — geometry-based Midas statement parser (see gotchas); emits
  `ParsedRow[]`, encoding unknown trade symbols as `new:TICKER` sentinels. Reads all
  three statement tables — YATIRIM İŞLEMLERİ (trades), HESAP İŞLEMLERİ (cash ops),
  TEMETTÜ İŞLEMLERİ (dividends). Pure, exported, unit-tested pieces:
  `headerKindForLabels` (labels → `MidasTableKind`), `buildMidasRowContext`
  (ticker→asset + currency→fiat-asset lookups, Midas platform id, unresolved sets,
  error set), and one cells→`ParsedRow` mapper per kind — `tradeCellsToRow`,
  `accountCellsToRow`, `dividendCellsToRow`. Vitest: `parseMidasPdf.test.ts`.
- `validation.ts` — `validateField` / `validateRow`: required fields, ISO date (not
  future), numeric checks, price-required-by-type, supported currency; sentinel asset
  ids pass as valid intermediates.
- `sentinel.ts` — `new:` prefix helpers (`isNewAssetSentinel`, `makeNewAssetSentinel`,
  `tickerFromSentinel`); canonicalizes the ticker.
- `autoResolveSentinels.ts` — for each sentinel: reuse an existing asset, else resolve
  via Yahoo (`resolveTickers`) and create it; returns resolved map + leftovers + a
  duplicate-ticker race fallback.
- `types.ts` — `SheetRow`, `RowStatus`, `SheetField`, `SheetSnapshot`,
  `snapshotFromTx`. `relatedAssetId` is part of `SheetRow`/`SheetSnapshot` but **not**
  of `SheetField` — it is carried metadata (no grid column, no validation), read from
  `tx.related_asset_id` on load and written back by both save paths.

### Typed cells — `src/components/transactions/sheet/cells/`
- `CellShell.tsx` — wrapper for every editable cell; red ring + tooltip on error.
- `AssetCell.tsx` — searchable asset picker (ticker over name); read-only in per-asset
  mode; offers "Create <TICKER>" → sets a `new:` sentinel.
- `PlatformCell.tsx` — searchable platform picker with colour dot.
- `TypeCell.tsx` — type dropdown rendered as coloured uppercase label.
- `DateCell.tsx` — native date input.
- `NumberCell.tsx` — numeric input (amount / price / fee), right-aligned.
- `CurrencyCell.tsx` — supported-fiat dropdown.
- `TotalCostCell.tsx` — read-only derived `amount × unit_price`, symbol + digits
  from `settlementAmount.ts`.

### Domain logic
- `src/lib/balance.ts` — `recalculateBalance(userId, assetId, platformId)`: sums
  `ADD_TYPES − SUBTRACT_TYPES` over a holding's transactions and upserts `holdings`.
- `src/lib/cash.ts` — cash-leg pairing: `resolveFiatAsset`, `computeCashAmount`
  (`total − fee` sell / `total + fee` buy, same-currency only), `shouldCreateChild`,
  `buildChildRow` (takes the settlement asset's id — fiat or stablecoin — as
  `cashAssetId`; legs always carry `unit_price: 1` in the parent's price
  currency, which *is* the $1 peg when the leg sits on USDT),
  `validateFundingCash` (with `settlementTicker` for the error message's unit).
- `src/components/transactions/settlementAmount.ts` — `settlementSymbol(unit)`,
  `formatSettlementDigits(value)` and `formatSettlementAmount(value, unit)`: the
  cash leg's figure, whose unit may be a fiat currency OR a settlement
  stablecoin, so it cannot go through `formatCurrency` (which takes a
  `FiatCurrency`). Used by the modal's Total / Cost basis / Sale proceeds lines,
  the row's cash-leg subtitle and the grid's `TotalCostCell`. Its digits follow
  the BROWSER locale, not the currency's — so a ₺ figure here groups differently
  from the same figure through `formatCurrency`; that is pre-existing and this
  module is the one place to fix it.
- `src/lib/constants/assets.ts` — `SETTLEMENT_STABLECOIN_TICKERS` (USDT) +
  `isSettlementStablecoin`: the curated set of stablecoins eligible as a
  settlement asset. Distinct from `STABLECOIN_TICKERS` (display nesting).
- `src/lib/constants/transaction-types.ts` — type enum + `ADD_TYPES`/`SUBTRACT_TYPES`,
  `TYPES_WITH_LINKED_CHILD`, `USER_PICKABLE_TYPES`, display labels/colours.
- `src/lib/constants/midas-pdf.ts` — Midas header aliases (all three tables),
  `MidasTableKind`, `MIDAS_EXECUTED_STATUS` (cash rows only), `MIDAS_TYPE_MAP`
  (Alış/Satış → buy/sell),
  `MIDAS_ACCOUNT_TYPE_MAP` (Para Yatırma/Çekme → transfer_in/out),
  `MIDAS_OTHER_INCOME_TYPE` + `MIDAS_INTEREST_DESCRIPTION_TOKEN` (Diğer Gelir whose
  description mentions *Nema* → `interest`),
  `MIDAS_OTHER_EXPENSE_TYPE` + `MIDAS_STOPAJ_DESCRIPTION_TOKEN` (Diğer Gider whose
  description mentions *Stopaj* → `tax`; the statement prints the lump negative,
  the parser stores the magnitude), `MIDAS_SECURITY_TICKER_SEPARATOR`, and
  `midasDividendNote(ticker, gross, withholding)`.
- `src/lib/queries/transactions.ts` — fetch (default hides cash-leg children but keeps
  linked `transfer_in` rows, so a destination-platform filter still matches them; all
  children included when an asset is filtered), `fetchLinkedChild(ren)`, single CRUD,
  and `bulkInsertTransactions` (the RPC wrapper) with `BulkInsertRow`/`BulkInsertResult`.
- `src/lib/pdf/loadPdfjs.ts` — lazy, memoized pdfjs loader (dynamic import + worker URL).

## Data layer

Beyond the shared `transactions` / `holdings` / `assets` schema (Component 2):

- **`bulk_insert_transactions` RPC** — one round-trip for the whole new-row batch:
  inserts parents, auto-pairs cash children (sells always; funded buys), recomputes
  every touched holding balance, **all atomic** — any error rolls back the batch. Keep
  `BulkInsertRow` in lockstep with the SQL function.
- **`linked_tx_id`** foreign key with `ON DELETE CASCADE` pairs a cash leg to its trade
  and a `transfer_in` to its `transfer_out`; deleting a parent removes its child. The
  CHECK constraint (`linked_tx_allowed`, migration `20260828120000_link_transfer_pairs`)
  enforces: cash legs **must** carry `linked_tx_id`, `transfer_in` **may** (lone
  deposits stay unlinked), every other type must not. The same migration backfilled
  links for pre-existing pairs, matched conservatively on
  (user, asset, date, amount, different platforms) with exactly one candidate on both
  sides — ambiguous pairs stayed unlinked.
- **`holdings`** is an upsert target keyed on `(user_id, asset_id, platform_id)`.

## Notes & gotchas

- **Asset-native currency is enforced in code, not just convention.** Picking/changing
  an asset resets `price_currency` to `assetNativeCurrency(...)` (or to USD when a
  cached USD price prefilled the unit price); the currency control is editable but
  always re-seeded from the asset — there is no asset-independent currency picker.
  **Exception: unresolved `new:` sentinels.** They resolve to no asset, so
  `currencyForAssetId` would answer `DEFAULT_CURRENCY` (USD) and relabel e.g. a TRY
  BIST buy as USD. The grid's `appendRows` therefore skips the re-seed for sentinel
  rows and keeps the parsed currency until `resolveAssetSentinel` supplies a real one.
- **Only `buy`/`sell` carry a linked cash child** (`TYPES_WITH_LINKED_CHILD`). Sells
  always; buys only when a funding platform is chosen. In the bulk path, **bulk buys
  debit cash on their own platform** (funding = the buy's platform) so totals don't
  inflate; sells auto-credit inside the RPC. Bulk settlement is **fiat-only** —
  stablecoin settlement exists only in the single add/edit modal.
- **Stablecoin settlement plumbing.** `FundingSourceSelect` carries a
  `FundingSource` ({platformId, assetId}) and is **same-platform-only** (takes
  the trade's `platformId`): the trade platform's fiat option plus a USDT
  option when it has a positive balance there (USD-priced buys only).
  Cross-platform funding was removed 2026-09-01 — prod had 139 funded buys,
  all same-platform, zero cross-platform. A legacy child on another platform
  still renders as an edit-lens option, and the modal leaves such a selection
  alone; otherwise changing the trade's platform re-maps the funding selection
  to the new platform (a stablecoin choice resets to external if the new
  platform holds none). The data model is unchanged — the constraint is
  UI-level (`fundingPlatformId` still flows through `useTransactionMutations`).
  `useTransactionMutations.addTransaction/editTransaction` take
  `options.settlementAssetId`: explicit id = that asset, explicit `null` = the
  price-currency fiat, omitted (bulk-sheet edits) = keep a USD-priced trade's
  existing child on its current asset so an in-place edit doesn't silently move
  a USDT leg back to USD cash (a currency change away from USD always
  re-resolves to fiat). The modal's sell form adds a "Proceeds credited as"
  select (`proceedsAssetId`, `null` = fiat), gated to USD-priced sells of
  crypto assets that aren't settlement coins themselves (or an edit already
  seeded from a stablecoin leg); it seeds from the sell's linked child on
  edit. A price-currency change re-maps any funding selection to the new
  currency's fiat row on the same platform and clears a stablecoin proceeds
  choice. Funding options are grouped (Cash / Stablecoin `SelectGroup`s) with
  balances through `formatAmount`; the collapsed trigger resolves its ticker
  from the catalog, never from the balance-filtered option list.
- **A `transfer_out`'s linked child is its `transfer_in`, not a cash leg.**
  `useTransactionMutations.editTransaction` reconciles it *before* the cash-side
  logic: shared fields (asset, date, amount, unit_price, price_currency, total_cost)
  update in lockstep, the destination platform stays the child's own, and a type
  change away from `transfer_out` deletes the child. Without this branch the cash
  reconciliation would delete the transfer_in as an "orphan". The bulk sheet's
  per-row edit strips `linked_tx_id` from its update payload for the same reason —
  its insert-shaped payload would otherwise sever an existing link — and the grid
  **never loads linked `transfer_in` rows** (`isGridEditable`): the destination side
  is managed through its parent, and showing both sides as independently editable
  grid rows would let one save silently overwrite the other.
- **Money precision at every DB boundary.** All math uses `bn(...)`; values written to
  Postgres `numeric` columns go as `.toFixed()` strings (balances in `balance.ts`, cash
  amounts in `cash.ts`, bulk payloads in the grid) because `Number` loses tail digits
  past ~15–17 significant figures. The single-write path still passes `.toNumber()` for
  read ergonomics.
- **Date is stored as local-day-as-UTC-midnight** (`YYYY-MM-DDT00:00:00Z`) so
  `date.slice(0,10)` on the backend matches the user's chosen calendar day regardless of
  timezone.
- **pdfjs is lazy-loaded** (`loadPdfjs`) so the PDF engine isn't in the main bundle; the
  worker URL is wired on first use.
- **Midas PDF parsing is geometry-based.** Text fragments are grouped into rows by `y`,
  merged into phrases by `x`-gap, and assigned to columns by the **midpoint** between
  header `x`-starts (tolerates data text starting a few px left of its header). Header
  labels vary between statement variants, so each field accepts an alias list.
- **One page holds several stacked tables.** The page loop doesn't stop at the first
  header: every row is tested with `detectHeader`, a match switches the **active
  layout + kind**, and every subsequent row is mapped under it until the next header.
  Layouts never carry across pages (column x-positions are page-local). Kind is decided
  by a field pair unique to each table — trade `TARIH`+`SEMBOL`, account
  `ISLEM_TARIHI`+`TUTAR_YP`, dividend `ODEME_TARIHI`+`NET_TEMETTU`. The **trade** header
  is still the "is this a Midas PDF?" marker.
- **Every mapper gates on its own date column first.** Section titles
  (`HESAP İŞLEMLERİ (…)`), the `*Stopaj, …` footnote, and `Kayıt bulunmamaktadır.` all
  land under whatever layout is active; failing `parseDate` drops them silently so they
  never inflate the skipped count. Only after that gate do the fill/status/type checks run.
- **Trades are gated on filled quantity, not status.** `tradeCellsToRow` requires
  `bn(GERCEKLESEN_ADET).gt(0)`; `MIDAS_EXECUTED_STATUS` is only consulted for **cash**
  rows (which have no quantity column). Midas reports a partly filled order as
  `Kalanın Süresi Doldu` — status-gating dropped those buys while their later sells
  still imported, leaving the sell with **no FIFO cost basis**. Cancelled/expired
  orders report `0` (or `-`) filled and still fall out, counted in
  `skippedNotExecuted`.
- **Cash-side rows resolve a seeded fiat asset, never a sentinel.** The cash tables
  carry the currency inside the amount cell (`"2000,00 USD"`), split by
  `splitAmountCurrency`; the asset is the `category='fiat'` row whose ticker is that
  code. A missing one is a parse **error** (surfaced in `ParseSummary.errors`, deduped
  via a `Set`) — an import must not create fiat rows. Cash rows use `unitPrice = "1"`.
- **A dividend books the NET amount on cash** (that's what the account actually
  received, and what the same-day auto-reinvest buy spends) with `relatedAssetId` = the
  payer, matching the app's cash-dividend model (`pnl/cases.test.ts` `dividendCash`,
  `useTransactions` `addLens`). The payer ticker is the token before `" - "` in
  `Sermaya Piyasası Aracı`, canonicalized before lookup; an uncatalogued payer stays
  `null` (no `new:` sentinel) and is named in the note instead.
- **Unknown tickers flow as `new:TICKER` sentinels.** Save first auto-resolves (reuse
  existing → Yahoo `resolveTickers` → create), and only leftovers open
  `ResolveAssetsStepper`; the commit pauses until the queue empties, and Cancel aborts
  the batch leaving sentinels in the grid. A duplicate-ticker insert race is caught and
  re-looked-up.
- **`price_id` vs `ticker`.** Display uses `ticker`; price fetches use `price_id ??
  ticker`. The resolver defaults `price_id = ticker`; per-asset overrides happen in the
  asset form, not here.
- **Edit-mode validation** adds the existing cash child's amount back into available
  cash on the same funding lens so re-saving a funded buy isn't flagged as overdrawing
  itself. Balance/over-balance checks are skipped in edit mode because the row being
  edited is already counted in the holding.
- **Suppress self-inflicted reloads while saving** — each write bumps a tx-version
  signal that would otherwise reload and clobber the in-flight grid buffer; the grid
  guards with a `savingRef` and refreshes once after the bulk commit.
