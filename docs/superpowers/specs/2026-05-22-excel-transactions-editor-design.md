# Excel-style Transactions Editor

**Date:** 2026-05-22
**Status:** Spec — implementation in progress (POC scope: phases 1–2)

## Problem

Two related gaps in the current app:

1. **No per-asset drill-down.** Portfolio rows show aggregates (qty, value, P&L) but there's no way to click a row and see the full transaction history for that asset, the way SimplyWallSt's portfolio page does. The Transactions page can filter by asset, but it's a separate navigation and the original `AssetDetailSheet` was deferred.
2. **No bulk entry.** All transactions are added one at a time via `AddTransactionModal`. The user has years of trades in Excel; migrating them by clicking through the modal is impractical.

## Goals

- Provide a SimplyWallSt-style drill-down: clicking an asset row opens a wide view of that asset's transactions in a spreadsheet-like grid.
- Let the user edit transactions inline (every cell editable), add new rows, delete rows.
- Buffer edits locally and commit via an explicit **Save changes** action — Excel-like, no "did I save?" anxiety.
- Provide a bulk path for entering / importing many transactions at once, including paste-from-Excel and CSV upload.
- After import, resolve unknown tickers/platforms via a popup before saving.
- Match the rest of the app visually — shadcn primitives, no foreign data-grid styling.

## Non-goals

- xlsx file upload (CSV + paste-from-Excel covers it; xlsx parsing adds ~400 KB for a personal use case).
- Real-time multi-user editing / locks (solo-user app).
- Undo/redo history. Discard is the escape hatch.
- Inline copy/paste *between cells* in the grid (paste-into-import handles the bulk case).
- Editing the auto-paired cash counterpart rows directly. They're derived and flow through the parent.
- Inline editing on mobile (`< 640px`). Mobile falls back to the existing modal flow.
- Exporting current grid view to CSV (Settings → Export is already specced for that).

## Design

### Library choice

- **`@tanstack/react-table`** (~15 KB gz) for column defs, row models, sorting, virtualization headroom. Headless — we own the cell rendering.
- **Existing shadcn primitives** for all cell editors (Combobox via `command` + `popover`, `calendar`, `select`, `input`, `textarea`).
- **`papaparse`** (~45 KB gz) for CSV parsing — already specced in Component 11.

Rejected: `react-data-grid` (style seam vs shadcn), `AG Grid` (size, foreign look), `handsontable` (license footgun), `glide-data-grid` (canvas-based — can't host shadcn comboboxes/popovers).

### Architecture — one component, two containers

```
src/components/transactions/sheet/
├── TransactionsSheet.tsx         # the editable grid component
├── columns.tsx                   # TanStack column defs + cell editors
├── useTransactionsSheetState.ts  # buffered row state reducer
├── ImportDialog.tsx              # CSV upload + paste-from-Excel
├── ResolveUnknownsDialog.tsx     # popup for unmapped assets/platforms
└── cells/
    ├── DateCell.tsx
    ├── AssetCell.tsx             # Combobox over existing assets
    ├── PlatformCell.tsx          # Combobox over existing platforms
    ├── TypeCell.tsx              # Select w/ USER_PICKABLE_TYPES
    ├── NumberCell.tsx            # amount / unit_price / fee
    └── TextCell.tsx              # notes
```

Containers:
- **Per-asset Sheet** — opens from a Portfolio row click. shadcn `Sheet side="right"` with wide max-width. Asset column locked. Container: `src/components/portfolio/AssetTransactionsSheet.tsx`.
- **Full-page bulk editor** — new route `/transactions/edit`. Same `TransactionsSheet` unscoped (all transactions, asset column editable). Container: `src/pages/TransactionsEditPage.tsx`. Entered from a new "Bulk Edit / Import" button on `TransactionsPage`.

`AddTransactionModal`, the Transactions list, and the Portfolio table are otherwise untouched. The modal remains the one-off add path; the sheet/page is the bulk path.

### Row state (the buffered "Save changes" model)

```ts
type RowStatus = "clean" | "dirty" | "new" | "deleted" | "invalid"

interface SheetRow {
  rowKey: string                   // client-side UUID, stable across edits
  txId: string | null              // DB id; null for new rows
  date: string
  assetRef: AssetRef               // { kind: "existing", id } | { kind: "unresolved", ticker, name? }
  platformRef: PlatformRef         // same shape
  type: TransactionType
  amount: string                   // strings — parsed to BigNumber on save
  unitPrice: string
  currency: string
  fee: string | null
  notes: string | null
  status: RowStatus
  original: Snapshot | null        // for dirty-rollback + diff on save
  errors: Partial<Record<keyof SheetRow, string>>
}
```

Reducer-driven (`useTransactionsSheetState`): `loadRows`, `editCell`, `addBlankRow`, `deleteRow`, `appendImportedRows`, `validateAll`, `discardAll`, `commitSaveSuccess`.

Why string-backed numerics: matches the BigNumber-everywhere rule. We never let the buffer hold a float for monetary fields. Parse to BigNumber on validation / save only.

### Data flow

**Load.** Per-asset: `fetchTransactions({ assetId, includeLinkedChildren: true })`. Bulk: `fetchTransactions({ includeLinkedChildren: false })`. Linked cash children are filtered out — they're derived and rebuilt on save by the existing tx helpers.

**Edit.** All edits stay local. Status badges render via a colored left border + small icon column. A footer bar shows `N new · M dirty · K deleted · J invalid` and the Save/Discard buttons.

**Import.** ImportDialog with two tabs (Upload CSV, Paste from Excel) → papaparse → auto-mapped to columns (with manual remap fallback) → per-row lookup of asset by ticker (case-insensitive) and platform by name → flag duplicates `(asset_id, date, type, amount, unit_price)` against existing rows → preview table (first 10 rows + counts) → confirm → `appendImportedRows()` adds them as `new` rows. Unresolved refs auto-open `ResolveUnknownsDialog`.

**Resolve unknowns.** One dialog, one entry per unresolved ref (e.g., "BTC asset — 12 rows reference this"). Two actions: **Map to existing** (combobox), or **Create new** (inline mini-form mirroring the existing asset/platform forms; on confirm, creates the entity and back-fills referring rows). Save is gated until everything resolves.

**Save.** `validateAll()` first. Build three batches: deletes (status `deleted` + `txId`), updates (status `dirty` + `txId`), inserts (status `new`). Execute deletes → updates → inserts via the existing `deleteTransaction` / `updateTransaction` / `createTransaction` helpers — *not* direct Supabase calls — so the cash-pairing rule has exactly one implementation. After each batch, `recomputeBalanceForAsset` once per affected asset (deduped). Toast on completion; partial failures keep failed rows `invalid` with `errors._save = <server msg>`.

**Discard.** Reset buffer to last-loaded state (`original` snapshots). New rows dropped. No network.

### Validation

Single validation function set (plain TypeScript guards — Zod is not in deps and we won't add it just for this), applied two places:
- **Live** per cell on edit (only the changed field).
- **Bulk** on Save (entire buffer).

Rules mirror the existing `TransactionInsert` constraints + the new `transfer_in_has_cost` DB CHECK:
- `date`: required ISO `YYYY-MM-DD`, ≤ today
- `assetRef`, `platformRef`: required + resolved (no unresolved refs at save time)
- `type`: one of `USER_PICKABLE_TYPES`
- `amount`: BigNumber > 0 (≥ 0 for fee)
- `unit_price`: BigNumber ≥ 0
- `currency`: must match `SUPPORTED_FIAT_CURRENCIES` constant from `src/lib/constants/currencies.ts` (no hardcoded codes)
- `fee`: optional ≥ 0
- `notes`: ≤ 500 chars

### Edge cases

| Concern | Approach |
|---|---|
| Auto-paired cash rows (`linked_tx_id`) | Filtered out on load. Recreated by existing tx helpers on save. Sheet never edits them directly. |
| Transfer cost (per the 2026-05-15 spec) | The shared tx helpers already auto-fill cost for currency transfers and paired non-currency transfers. Sheet inherits this. |
| FIFO / balance recompute | After save batch: `recomputeBalanceForAsset(assetId)` once per touched asset. Same hook the modal uses. |
| Mobile (`< 640px`) | Per-asset Sheet renders read-only (existing TransactionRow cards) + "Add Transaction" button → modal. `/transactions/edit` shows a banner "Bulk edit is desktop-only." Import hidden on mobile. |
| Empty asset | "No transactions yet." + "Add row" button. |
| New asset/platform created mid-resolve | Caches in-flight so the next "create new" combobox sees it. |

## Component impact

| File | Change |
|---|---|
| `src/components/transactions/sheet/*` | New. Editable grid + reducer + import + resolve. |
| `src/components/portfolio/AssetTransactionsSheet.tsx` | New. Wraps `TransactionsSheet` in a shadcn Sheet. |
| `src/pages/TransactionsEditPage.tsx` | New. Wraps `TransactionsSheet` full-page. |
| `src/App.tsx` | Add `/transactions/edit` route, lazy-loaded. |
| `src/components/portfolio/PortfolioRow.tsx` | Asset name click → open `AssetTransactionsSheet` (state lifted to a context or page-level). |
| `src/pages/TransactionsPage.tsx` | New "Bulk Edit / Import" button in the header. |
| `package.json` | Add `@tanstack/react-table`. `papaparse` + `@types/papaparse` added in phase 4. |

Validation, tx helpers, FIFO, snapshots, dashboard: untouched.

## Verification

No automated tests (per CLAUDE.md). Manual walkthrough on POC scope:

1. Click an asset row on the Portfolio page → per-asset Sheet opens with that asset's transactions loaded.
2. Edit a unit_price cell → row goes `dirty`, footer count updates.
3. Discard → reverts.
4. Add new row → defaults sensible (today, asset prefilled in per-asset mode, currency from asset).
5. Delete an existing row → struck-through, footer count updates, Save commits the delete.
6. Save with a mix of new/dirty/deleted → all commit in batched order, toast shows success, balance recomputed.
7. Save with one invalid row → other rows save, invalid one stays dirty with toast and visible error reason.
8. Open `/transactions/edit` from the Transactions page → all transactions, asset column editable.
9. Import → paste 5 rows from Excel → preview shows duplicates / unknowns / valid counts.
10. Resolve an unknown ticker → asset created in DB, row back-filled, Save now enabled.

## Rollout — phased POC

Each phase ships independently.

1. **Phase 1 — Per-asset read-only Sheet.** Wire Portfolio row → Sheet → existing transactions list. No editing. Smallest viable drill-down.
2. **Phase 2 — Inline editing + Save/Discard.** Add the TanStack grid, cell editors, row state reducer, Zod validation, batched save. Per-asset only.
3. **Phase 3 — Bulk full-page route.** `/transactions/edit` reuses the same grid, unscoped. "Bulk Edit / Import" button on Transactions page.
4. **Phase 4 — Import (CSV + paste).** ImportDialog, papaparse, auto-mapping, duplicate detection, preview.
5. **Phase 5 — Resolve Unknowns.** Map-to-existing / create-new flow gating Save.

POC target for this iteration: **phases 1–2** (the SimplyWallSt-style drill-down with editing). Phases 3–5 can land in follow-up commits.

## Open questions

None at design time.
