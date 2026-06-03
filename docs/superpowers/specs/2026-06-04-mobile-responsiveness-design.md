# Mobile Responsiveness Improvements — Design

Date: 2026-06-04

## Goal

Fix the screens that break on a ~375px phone. The app shell (sidebar →
bottom `MobileNav`, adaptive `Header`) is already fine and is out of scope.
The transactions **edit** spreadsheet (`/transactions/edit`) is explicitly
**out of scope** for a mobile rewrite — only its overflowing toolbar gets a
light wrap fix.

Principle (per project convention): reuse shared logic, never duplicate. A
separate mobile component is fine when it keeps the code readable and easy to
follow, but the *derivation* logic must be shared.

## Scope (audit items addressed)

| # | Area | Severity | Treatment |
|---|------|----------|-----------|
| 2 | Transactions list table | high | Mobile card fallback (the one substantive piece) |
| 3 | Portfolio filters toolbar | high | `flex-wrap` |
| 4 | Performance header + TimeRangeSelector | high | wrap header + wrap selector |
| 1b| Transactions edit toolbar | med | `flex-wrap` only (no grid rewrite) |
| 7 | Over-wide popovers | med | cap to viewport width |
| 6 | Large headline text | low | responsive font scaling |
| 5 | CategoryAttribution table | low | already scrolls via `<Table>` — verify only |

## A. Transactions list → mobile card (substantive)

Follow the existing, proven Portfolio pattern
(`PortfolioTable.tsx`: `hidden sm:block` table + `sm:hidden` card list using
`PortfolioRowCard`).

**Files:** `src/components/transactions/TransactionList.tsx`,
`src/components/transactions/TransactionRow.tsx`.

`TransactionRow` currently bundles three things: ~50 lines of display
derivation (realized P&L native/USD, currency conversion, colors, flags), the
table-cell markup, and the actions menu (dropdown + delete `AlertDialog`).
A mobile card needs the same derivation and the same actions but different
markup. To avoid duplication, extract:

1. **`deriveTransactionDisplay(tx, currency, realized, rates)`** — a pure
   function returning the computed display fields (sign, amountColor,
   nativeCurrency, convertedTotal, convertedUnitPrice, realized sub-line
   pieces, flags). Lives in the transactions folder (e.g.
   `transactionRowModel.ts`). No JSX, no hooks.
2. **`<TransactionRowActions tx={...} />`** — shared component owning the
   dropdown menu + delete `AlertDialog` + its local `useState`/mutation. Used
   by both the table row and the card.
3. **`TransactionRow`** (table) and **new `TransactionRowCard`** (card) both
   call `deriveTransactionDisplay` and render `<TransactionRowActions>`. The
   table keeps its `<TableRow>`/`<TableCell>` layout; the card is a `rounded-lg
   border` block.

`TransactionList` renders the `<Table>` wrapped in `hidden sm:block`, plus a
`sm:hidden` `flex flex-col gap-2` list of `TransactionRowCard`.

**Card layout (sm:hidden):**
- Top row: date (muted) on the left · type badge + `TransactionRowActions` on the right
- Middle row: asset icon + ticker (+ linked-child / "external cash" sub-line) · platform dot + name
- Bottom row: amount (signed, colored) · unit price (muted) · total (+ realized P&L sub-line when present)

**Color note (do NOT fix here):** `TransactionRow` uses `text-green-600 /
text-red-600`, while the canonical palette is `gainLossClass`
(emerald-600 / red-500). The card matches the existing row's colors so the
table and card look identical; unifying to `gainLossClass` is a separate
cleanup, tracked but not done in this change.

## B. Toolbars that don't wrap → `flex-wrap`

- **`PortfolioFilters.tsx:54`** — inner control cluster
  `<div className="flex items-center gap-3">` → add `flex-wrap` (and
  `justify-end` so it stays right-aligned on desktop) so the two `ToggleGroup`s
  and the `w-[130px]` `Select` drop to a new line instead of clipping.
- **`PerformancePage.tsx:66`** — header `flex items-center justify-between` →
  `flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between` so the
  title block and the range selector stack on mobile.
- **`TimeRangeSelector.tsx:12`** — `flex gap-1` → `flex flex-wrap gap-1` so the
  6 range buttons wrap instead of overflowing.
- **`TransactionsEditPage.tsx`** header (~`:40`) and footer (~`:99`) toolbars →
  add `flex-wrap` so controls don't clip. No grid/spreadsheet changes.

## C. Over-wide popovers → cap to viewport

- **`AssetSearchSelect.tsx:50`** — `PopoverContent className="w-[350px] p-0"` →
  add `max-w-[calc(100vw-2rem)]` so it never exceeds the screen.
- **Edit-only** `ImportPopover` (`w-[560px]`) and `MidasPdfImportButton`
  (`w-[480px]`) — same `max-w-[calc(100vw-2rem)]` cap (cheap, done while
  touching the edit page).

## D. Headline text scaling (cosmetic)

- **`DashboardHero.tsx:388`** — `text-3xl ... md:text-4xl` →
  `text-2xl sm:text-3xl md:text-4xl`.
- **`NetWorthCard.tsx:36`** — `text-3xl` → `text-2xl sm:text-3xl`.

## E. CategoryAttribution

The shadcn `<Table>` already provides `overflow-x-auto`, so the 5-column table
scrolls horizontally without breaking layout. No change; verify visually only.

## Verification

- `npm run typecheck` and `npm run build` pass clean.
- No automated tests (project convention).
- Visual confirmation via the live-prod flow (commit → push → check on phone).

## Out of scope

- Transactions edit spreadsheet grid mobile rewrite (card editor / column
  hiding) — only its toolbar wrap is in scope.
- Unifying transaction-row colors to `gainLossClass` (tracked separately).
