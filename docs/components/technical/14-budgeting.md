# Component 14: Budgeting — Technical (this build)

> Layer: React/Vite/Supabase implementation. Contract → [../14-budgeting.md](../14-budgeting.md)

## Stack

- React 19 + Vite + TypeScript; Tailwind 4 + shadcn/ui; Recharts for the trend
  chart.
- BigNumber.js everywhere money moves; `.toNumber()` only at the render
  boundary.
- The derivation engine (`src/lib/budget/`) is pure and UI-free, Vitest-covered
  — same discipline as the P&L (`computePortfolioPnL`) and retirement engines.

## Data model (Supabase)

Migration `supabase/migrations/20260815200000_budgeting.sql`, all tables
user-scoped with owner-only RLS (mirrors `retirement_scenarios`):

| Table | Role |
| --- | --- |
| `cashflow_entries` | One row per income event: `date`, `type` (CHECK: `income` only for now — relax the CHECK when the expense ledger lands), `amount`, `currency`, `note`. Never touches holdings/P&L. |
| `income_defaults` | Salary schedule: `amount`, `currency`, `effective_from` (`YYYY-MM-01`). Append-only in spirit; the latest `effective_from` ≤ month wins. |
| `budget_targets` | Reserved for plan-vs-actual (Phase C): `monthly_invest_target`, `spend_ceiling`, `currency`, `effective_from`. Shipped unused so C needs no migration. |

## Derivation engine (`src/lib/budget/`)

`computeMonthlyBudget({ entries, incomeDefaults, transactions, rates, fromMonth,
toMonth })` → `MonthlyBudgetRow[]` (month, incomeUsd/incomeTry, investedUsd/…,
spent…, savingsRate, incomeSource: `entry | default | none`).

- **invested** — the month's delta of net invested capital, computed by folding
  `applyTxToInvested` (exported from `src/lib/performance.ts`; previously
  private — budgeting reuses it, never re-implements the pairing rules) over the
  month's transactions.
- **income** — sum of the month's `income` entries, else the applicable salary
  default, else null.
- **spent** = income − invested; **savingsRate** = invested ÷ income; both null
  when income is unknown (and rate null when income ≤ 0).
- Currency: USD via `normalizeToUsd` at each transaction/entry date; TRY view
  converts with the same per-date rates.

Tests in `src/lib/budget/*.test.ts`: residual math, salary-schedule resolution
across raises, null-income months, negative-invested months, currency
conversion, month bucketing off `date.slice(0, 7)`.

## Data flow

`BudgetContext` (`src/contexts/BudgetContext.tsx`, mounted in `main.tsx`) is
the single fetch point for `cashflow_entries` + `income_defaults` (queries in
`src/lib/queries/budget.ts`, thin CRUD like `retirementScenarios.ts`) — per the
app-wide rule: shared server data through context providers, no per-call-site
fetch-on-mount. `useBudget` (`src/hooks/useBudget.ts`) composes it with
`TransactionDataContext` (transactions + rates) into `computeMonthlyBudget`
rows, newest first, windowed from the earliest data month through
`homeDayIso()`'s month. The page reads the app-wide display currency from
`DisplayContext` (`useDisplayCurrency`, incl. obfuscation) — no page-local
toggle.

## Route + UI file map

| File | Role |
| --- | --- |
| `src/App.tsx` | `<Route path="budget">` (lazy, inside `AppLayout`). |
| `src/components/layout/Sidebar.tsx` | `/budget` nav item (`navItems`, shared with `MobileNav`). |
| `src/pages/BudgetPage.tsx` | Composition: chart (table's default window, oldest-left) + table + salary card. Its title block is the shared `PageHeading` (`src/components/common/PageHeading.tsx`, `hidden md:block`) — on a phone the app header is the only page title. |
| `src/components/budget/constants.ts` | Series order/labels, per-theme chart palette (validated light AND dark — dark is its own steps), placeholders, `DEFAULT_VISIBLE_MONTHS`, inline-entry default currency (TRY). |
| `src/components/budget/display.ts` | `monthLabel("YYYY-MM")`, `legFor(row, field, currency)` — the USD/TRY leg picker. |
| `src/components/budget/BudgetTrendChart.tsx` | Grouped Recharts bars, theme-aware colors; null legs omitted, not drawn as zero; one axis (no rate line), `width={56}`. Both money surfaces read `obfuscated` from `useDisplayCurrency()` (the table's own edge). A labelled axis over to-scale bars gives the hidden figures back, so under privacy the Y axis drops its labels rather than masking each tick — `tick={obfuscated ? false : {…}}` / `width={obfuscated ? 0 : 56}`, the same idiom as `AssetHistoryChart`'s price axis below `md` (scale kept, labels dropped). Masking each tick instead rendered five identical 11px dot-rows that read as stray gridlines and held 56px of a 390px chart (measured: the plot goes 260px → 316px without them). `tickFormatter` therefore stays the plain `formatCompactCurrency` — it never runs while masked. The tooltip is `formatMoney`. |
| `src/components/budget/MonthlyBudgetTable.tsx` | The monthly table + inline income editing (0 entries → create on the 1st; 1 → update amount / clear deletes; **>1 → the `MultiEntryDialog`**, an `EntryRow` per entry with its own amount input and a delete guarded by an `AlertDialog`, since the cell's figure is their total; a `Dialog` rather than an in-cell panel because the table is `overflow-x-auto` on a phone). Copy in `INCOME_EDIT_COPY` (`components/budget/constants.ts`). The Income `TableHead` carries one `HintPopover` (`INCOME_EDIT_COPY.columnHint`, `align="start"` so the panel opens over Invested rather than over the Income figures it is describing) instead of a per-cell `title=`: a `title` never fires on touch, and the cell's own tap starts the edit, so the explainer needs a trigger of its own — one at the head, not twelve down the column. The delete confirmation's amount goes through `formatCurrency(entry.amount, entry.currency)` — the entry's own currency, grouped (it was `${symbol}${amount}` string concatenation) and deliberately **not** masked: the `EntryRow` inputs beside it hold the same raw figures and an `<input value>` cannot mask, so masking here would buy no privacy while stripping the confirmation of the field that identifies the row. Below `sm` the Invested column is `hidden sm:table-cell` and rides under Income as a caption, cells lose their side padding and both heads and cells may wrap (`max-sm:[&_td]:whitespace-normal`) — which is what lets the four remaining columns fit 326px in USD *and* TRY without a sideways scroll. |
| `src/components/budget/SalaryScheduleCard.tsx` | `income_defaults` list + append/delete. Row amounts render through `formatMoney(d.amount, d.currency, obfuscated)` — the row's own currency, masked with the rest of the page. |

## Reserved, not built

Phase C (targets/adherence/retirement cross-link) and the expense ledger are
specified in the behavioral doc's Future work; only `budget_targets` storage
exists today.
