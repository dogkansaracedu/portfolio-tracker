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
  cash, computes transfer cost basis via FIFO, and on submit builds the payload and
  (for `transfer_out`) the matching `transfer_in`. "Save & add another" keeps the form
  open. (Sub-controls `TransactionTypeSelector`, `AssetSearchSelect`,
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
  importer; appends parsed rows.
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
  `ParsedRow[]`, encoding unknown symbols as `new:TICKER` sentinels.
- `validation.ts` — `validateField` / `validateRow`: required fields, ISO date (not
  future), numeric checks, price-required-by-type, supported currency; sentinel asset
  ids pass as valid intermediates.
- `sentinel.ts` — `new:` prefix helpers (`isNewAssetSentinel`, `makeNewAssetSentinel`,
  `tickerFromSentinel`); canonicalizes the ticker.
- `autoResolveSentinels.ts` — for each sentinel: reuse an existing asset, else resolve
  via Yahoo (`resolveTickers`) and create it; returns resolved map + leftovers + a
  duplicate-ticker race fallback.
- `types.ts` — `SheetRow`, `RowStatus`, `SheetField`, `SheetSnapshot`,
  `snapshotFromTx`.

### Typed cells — `src/components/transactions/sheet/cells/`
- `CellShell.tsx` — wrapper for every editable cell; red ring + tooltip on error.
- `AssetCell.tsx` — searchable asset picker (ticker over name); read-only in per-asset
  mode; offers "Create <TICKER>" → sets a `new:` sentinel.
- `PlatformCell.tsx` — searchable platform picker with colour dot.
- `TypeCell.tsx` — type dropdown rendered as coloured uppercase label.
- `DateCell.tsx` — native date input.
- `NumberCell.tsx` — numeric input (amount / price / fee), right-aligned, optional prefix.
- `CurrencyCell.tsx` — supported-fiat dropdown.
- `TotalCostCell.tsx` — read-only derived `amount × unit_price` with currency symbol.
- `TextCell.tsx` — free-text cell (notes).

### Domain logic
- `src/lib/balance.ts` — `recalculateBalance(userId, assetId, platformId)`: sums
  `ADD_TYPES − SUBTRACT_TYPES` over a holding's transactions and upserts `holdings`.
- `src/lib/cash.ts` — cash-leg pairing: `resolveFiatAsset`, `computeCashAmount`
  (`total − fee` sell / `total + fee` buy, same-currency only), `shouldCreateChild`,
  `buildChildRow`, `validateFundingCash`.
- `src/lib/constants/transaction-types.ts` — type enum + `ADD_TYPES`/`SUBTRACT_TYPES`,
  `TYPES_WITH_LINKED_CHILD`, `USER_PICKABLE_TYPES`, display labels/colours.
- `src/lib/constants/midas-pdf.ts` — Midas header aliases, executed-status token,
  Alış/Satış → buy/sell map.
- `src/lib/queries/transactions.ts` — fetch (parents-only by default; children when an
  asset is filtered), `fetchLinkedChild(ren)`, single CRUD, and `bulkInsertTransactions`
  (the RPC wrapper) with `BulkInsertRow`/`BulkInsertResult`.
- `src/lib/pdf/loadPdfjs.ts` — lazy, memoized pdfjs loader (dynamic import + worker URL).

## Data layer

Beyond the shared `transactions` / `holdings` / `assets` schema (Component 2):

- **`bulk_insert_transactions` RPC** — one round-trip for the whole new-row batch:
  inserts parents, auto-pairs cash children (sells always; funded buys), recomputes
  every touched holding balance, **all atomic** — any error rolls back the batch. Keep
  `BulkInsertRow` in lockstep with the SQL function.
- **`linked_tx_id`** foreign key with `ON DELETE CASCADE` pairs a cash leg to its trade
  (and the two legs of a transfer); deleting a parent removes its cash child. A CHECK
  constraint enforces that cash legs have a `linked_tx_id` and other rows don't.
- **`holdings`** is an upsert target keyed on `(user_id, asset_id, platform_id)`.

## Notes & gotchas

- **Asset-native currency is enforced in code, not just convention.** Picking/changing
  an asset resets `price_currency` to `assetNativeCurrency(...)` (or to USD when a
  cached USD price prefilled the unit price); the currency control is editable but
  always re-seeded from the asset — there is no asset-independent currency picker.
- **Only `buy`/`sell` carry a linked cash child** (`TYPES_WITH_LINKED_CHILD`). Sells
  always; buys only when a funding platform is chosen. In the bulk path, **bulk buys
  debit cash on their own platform** (funding = the buy's platform) so totals don't
  inflate; sells auto-credit inside the RPC.
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
  labels vary between statement variants, so each field accepts an alias list; only rows
  with status = executed and type ∈ {Alış, Satış} become transactions.
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
