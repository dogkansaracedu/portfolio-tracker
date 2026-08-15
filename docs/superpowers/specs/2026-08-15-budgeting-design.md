# Budgeting — Design Spec

**Date:** 2026-08-15
**Status:** Draft for review
**Scope:** Phase A (monthly budget view) + Phase C (plan vs. actual), with the data
model deliberately shaped so Phase B (expense ledger with categories) can be added
later without migration.

## Problem

The app tracks money *after* it becomes an investment, but knows nothing about the
month's money flow: how much was earned, how much went into the portfolio, how much
was spent. The user wants a monthly **earned / invested / spent** view with minimal
data entry — no per-expense tracking for now.

## Core idea: the residual model

Only **income** is entered by the user (typically one number per month, auto-filled
from a salary schedule). Everything else is derived:

- **Invested (month)** = net new external money into tracked platforms that month,
  derived from existing portfolio transactions. This is the monthly delta of the
  existing *net invested capital* concept (GLOSSARY): buys/deposits and their cash
  legs pair off, so only genuine external inflows/outflows move the number. Cash
  deposited onto a tracked platform but not yet deployed counts as invested-side
  (it was saved, not spent).
- **Spent (month)** = income − invested. A residual — no expense entry exists.
- **Savings rate (month)** = invested ÷ income.

**Known trade-off (accepted):** the residual absorbs every data gap. Money held
outside tracked platforms or an unrecorded deposit reads as "spent". Acceptable
given fiat holdings are reconciled to real balances (see fiat reconciliation
2026-06-12).

**Phase B compatibility:** when expense entries are added later, they *categorize
part of* the spent residual; the uncategorized remainder is shown as "other". The
residual stays the total, so A's math and B's ledger agree by construction.

## Data model

Three new user-scoped tables (RLS like existing per-user tables). All amounts are
numeric; all client-side math uses bignumber.js.

1. **`cashflow_entries`** — id, user_id, date, type (`income` now; `expense`
   reserved for Phase B; enforced by a CHECK that Phase B relaxes), amount,
   currency (ISO code, default TRY), note (nullable), created_at.
   These rows never touch holdings, balances, or P&L — fully separate from
   portfolio transactions.

2. **`income_defaults`** (salary schedule) — id, user_id, amount, currency,
   effective_from (first month it applies, `YYYY-MM-01`), created_at.
   A month's default income is the row with the latest effective_from ≤ that
   month. Raises are appended, never edited into history.

3. **`budget_targets`** (Phase C) — id, user_id, monthly_invest_target,
   spend_ceiling (nullable), currency, effective_from, created_at. Same
   effective-from semantics.

## Derivation engine

A pure function in `src/lib/budget/` (mirroring the P&L engine pattern —
`computePortfolioPnL` precedent):

```
computeMonthlyBudget({ entries, incomeDefaults, targets, transactions, rates,
                       fromMonth, toMonth }) → MonthlyBudgetRow[]
```

Per month:

- **invested** — fold the existing `applyTxToInvested` logic (currently private in
  `src/lib/performance.ts`; export/reuse it, do not duplicate) over that month's
  transactions. USD-native, converted for display.
- **income** — sum of that month's explicit `income` entries; if none, the salary
  schedule default; if neither, null.
- **spent** — income − invested when income is known, else null.
- **savingsRate** — invested ÷ income when income > 0, else null.
- **Phase C fields** — the effective target for that month, plus adherence deltas
  (invested − target, spent − ceiling).

Null semantics: months with no income data show invested only, with "—" for
spent/rate — never a fake zero.

**Currency:** the fold produces USD (per-transaction-date rates, existing
`normalizeToUsd`). The page defaults to a **TRY view** (income is earned in TRY)
with a USD toggle, following the existing currency-view convention. TRY conversion
of invested uses the same per-date rates in reverse. Income entries convert at
their entry-date rate when the view currency differs from the entry currency.

## UI — new "Budget" page

New top-level page/route alongside Dashboard/Portfolio/Retirement, added to the
main navigation.

**Phase A:**
- Monthly table, most recent first (default last 12 months, expandable to all):
  month · income · invested · spent · savings rate. Income cell is editable
  inline (creates/updates the month's `income` entry); auto-filled defaults are
  visually marked as such until overridden.
- Trend chart (Recharts, per dataviz conventions): grouped monthly bars for
  income / invested / spent, savings-rate line on a secondary axis.
- A small settings affordance for the salary schedule (list of amount +
  effective-from rows, append-only in spirit).
- Currency toggle (TRY default / USD).
- Standard gain/loss color conventions do **not** apply here (spending isn't a
  loss); neutral palette, savings rate uses the canonical emerald when ≥ target
  (Phase C) and neutral otherwise.

**Phase C (follow-up, same page):**
- Targets editor (invest target, optional spend ceiling, effective-from).
- Per-month adherence: invested vs. target and spent vs. ceiling deltas.
- Retirement planner cross-link: show "your retirement plan assumes X/month; your
  trailing 6-month average invested is Y", with a one-click way to copy the
  actual average into the planner's contribution assumption (navigates to the
  Retirement page with the value; the planner remains the owner of its state).

## Explicitly out of scope (future ideas, not in A or C)

- Expense entries and categories (Phase B).
- Inflation-adjusted ("real") trend toggle.
- Month closing/locking.
- Any change to portfolio transactions, P&L, or snapshots — this feature is
  read-only over that data.

## Error handling & edge cases

- Month with net withdrawal → invested is negative; spent exceeds income; render
  honestly with signed formatting (ASCII minus).
- Income 0 or missing → savings rate "—".
- Months before the first transaction and before the first income entry are not
  listed.
- Current (incomplete) month is shown but visually marked as in-progress.
- No rate available for a date → same fallback behavior `normalizeToUsd` already
  has; no new rate logic.

## Testing

- The derivation engine is pure and Vitest-covered (`src/lib/budget/*.test.ts`),
  same pattern as the P&L and retirement engines: worked cases for the residual
  math, salary-schedule resolution across raises, null-income months, negative
  invested months, currency conversion, and Phase C adherence.
- No UI test automation (consistent with the rest of the app).

## Documentation

- New component docs: `docs/components/14-budgeting.md` (behavioral, stack-free)
  and `docs/components/technical/14-budgeting.md`, per the two-layer convention.
- GLOSSARY: add "Cash-flow entry", "Invested (monthly)", "Spent (residual)",
  "Savings rate", cross-linking Net invested capital.

## Delivery order

1. **Phase A** — migration (all three tables can ship at once; `budget_targets`
   simply unused until C), derivation engine + tests, Budget page, docs.
2. **Phase C** — targets editor, adherence columns/indicators, retirement
   planner cross-link, docs update.
