# Monthly Budget / Cash Flow Feature

## Context
User wants to track monthly income (salary etc.) and expenses (credit card, rent etc.) alongside existing investment portfolio. Goal: see what % of monthly income goes to investments, expenses, and savings. Investment transactions remain separate (existing system) but their TRY equivalent is pulled into the budget view automatically.

## Data Layer

### 1. Migration: `supabase/migrations/20260403100001_create_budget_entries.sql`
```sql
CREATE TABLE public.budget_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('income', 'expense')),
  category text NOT NULL,
  amount numeric NOT NULL CHECK (amount > 0),
  date date NOT NULL,
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_budget_entries_user_date ON public.budget_entries(user_id, date);

ALTER TABLE public.budget_entries ENABLE ROW LEVEL SECURITY;
-- Standard 4 RLS policies (select/insert/update/delete) with auth.uid() = user_id
```

- `type`: "income" or "expense" (text with CHECK, not enum)
- `category`: free-text, user-defined (e.g. "Maas", "Kira", "Market")
- `amount`: always positive, always TRY
- `date`: plain date type for easy month grouping

### 2. Types: `src/types/database.ts`
Add `BudgetEntryType`, `BudgetEntry`, `BudgetEntryInsert`, `BudgetEntryUpdate` following existing pattern (lines 113-128).

### 3. Queries: `src/lib/queries/budgetEntries.ts` (new)
Standard CRUD following `src/lib/queries/transactions.ts` pattern:
- `fetchBudgetEntries(userId, filters?)` - with dateFrom/dateTo/type filters
- `createBudgetEntry(data)`, `updateBudgetEntry(id, data)`, `deleteBudgetEntry(id)`
- Also: `fetchDistinctCategories(userId)` - for autocomplete

## Hooks

### 4. `src/hooks/useBudgetEntries.ts` (new)
CRUD hook following `useTransactions` pattern. Accepts `BudgetEntryFilters`, returns `{ entries, loading, error, addEntry, editEntry, removeEntry, refetch }`.

### 5. `src/hooks/useBudgetSummary.ts` (new)
Composed hook that takes a `month` string ("YYYY-MM"):
- Fetches budget entries for that month via `fetchBudgetEntries`
- Fetches buy transactions for that month via `fetchTransactions(userId, { type: "buy", dateFrom, dateTo })`
- Fetches exchange rates via `fetchAllExchangeRates` (reuse from `src/lib/queries/pnl.ts`)
- Converts each buy tx `total_cost` to TRY using `getExchangeRateForDate` from `src/lib/pnl/currency.ts`:
  - If `price_currency === "TRY"`: use directly
  - If `price_currency === "USD"`: multiply by `usd_try` rate
  - If `price_currency === "EUR"`: multiply by `eur_try` rate
- Returns: `{ totalIncome, totalExpenses, totalInvestments, savings, savingsRate, investmentRate, expenseRate, byCategory, investmentsByAsset, loading }`

## UI Components

### 6. `src/components/budget/MonthPicker.tsx` (new)
Left/right arrows + "Nisan 2026" label. Props: `month: string, onChange: (m: string) => void`. Uses date-fns for month arithmetic.

### 7. `src/components/budget/BudgetSummaryCards.tsx` (new)
4 cards in `grid-cols-2 md:grid-cols-4`: Gelir (green), Gider (red), Yatirim (blue), Kalan (conditional color). Formatted as TRY. Percentages shown as subtitle.

### 8. `src/components/budget/BudgetBreakdownChart.tsx` (new)
Recharts donut PieChart showing 3 slices: Gider %, Yatirim %, Kalan %. Follows `AllocationChart` pattern from `src/components/dashboard/AllocationChart.tsx`.

### 9. `src/components/budget/BudgetCategoryChart.tsx` (new)
Recharts horizontal BarChart showing expense categories ranked by amount. Quick visual of where money goes.

### 10. `src/components/budget/AddBudgetEntryDialog.tsx` (new)
Dialog modal following `AddTransactionModal` pattern (src/components/transactions/AddTransactionModal.tsx):
- Fields: type toggle (income/expense), category (Input with datalist autocomplete from past categories), amount, date, notes
- Validation: category non-empty, amount > 0
- Submit via `addEntry` from hook, toast on success

### 11. `src/components/budget/BudgetEntryList.tsx` (new)
Table of entries for the month. Columns: Date, Type (badge), Category, Amount (TRY), Notes, Actions (edit/delete). Following TransactionList pattern.

### 12. `src/components/budget/EditBudgetEntryDialog.tsx` (new)
Same as AddBudgetEntryDialog but pre-populated, calls `editEntry`.

## Page & Navigation

### 13. `src/pages/BudgetPage.tsx` (new)
```
Header (title + "Kayit Ekle" button)
MonthPicker
BudgetSummaryCards
Grid 2-col: [BreakdownChart | CategoryChart]
BudgetEntryList
AddBudgetEntryDialog + EditBudgetEntryDialog
```

### 14. `src/App.tsx` (modify)
Add `<Route path="budget" element={<BudgetPage />} />` inside protected routes (line 27).

### 15. `src/components/layout/Sidebar.tsx` (modify)
Add `{ to: "/budget", label: "Budget", icon: Wallet }` before Settings in navItems (line 15). Import `Wallet` from lucide-react.

## Implementation Order
1. Migration + Types + Queries (data layer)
2. Hooks (useBudgetEntries + useBudgetSummary)
3. UI components (MonthPicker, Cards, Charts, Dialogs, List)
4. Page + Route + Nav integration

## Verification
- Navigate to /budget, see empty state
- Add income entry (e.g. Maas 100,000 TL)
- Add expense entries (Kira 20,000, Market 10,000)
- See summary cards update: Gelir 100K, Gider 30K
- If buy transactions exist for the month, see Yatirim slice auto-populated
- See percentages in pie chart
- Edit/delete entries, verify list updates
- Check month navigation (prev/next)
