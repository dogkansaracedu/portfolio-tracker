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

`BudgetContext` (`src/contexts/BudgetContext.tsx`) is the single fetch point
for `cashflow_entries` + `income_defaults` (queries in
`src/lib/queries/budget.ts`, thin CRUD like `retirementScenarios.ts`) — per the
app-wide rule: shared server data through context providers, no per-call-site
fetch-on-mount. Transactions and rates come from the existing
`TransactionDataContext` / rates queries; the page composes them into
`computeMonthlyBudget` via a `useBudget` hook.

## Route + navigation

| File | Role |
| --- | --- |
| `src/App.tsx` | `<Route path="budget">` (lazy, inside `AppLayout`). |
| `src/components/layout/Sidebar.tsx` | `/budget` nav item. |
| `src/pages/BudgetPage.tsx` | Monthly table + trend chart + salary schedule editor + currency toggle. |

## Reserved, not built

Phase C (targets/adherence/retirement cross-link) and the expense ledger are
specified in the behavioral doc's Future work; only `budget_targets` storage
exists today.
