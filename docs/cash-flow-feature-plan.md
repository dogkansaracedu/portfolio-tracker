# Cash Flow & Buy/Sell Linkage — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make cash a first-class participant in the transactions ledger — sells auto-credit cash on the trading platform, buys can deduct cash from any platform's fiat holding (or remain external).

**Architecture:** Linked-rows storage. Every cash effect is its own `transactions` row with `type ∈ {cash_credit, cash_debit}`, paired to its parent via a `linked_tx_id` foreign key (`ON DELETE CASCADE`). `recalculateBalance` is unchanged in shape — the new types just join the existing add/subtract sets. The main transactions list filters out linked rows; asset-filtered views show them.

**Tech Stack:** React 19 + Vite + Tailwind + shadcn/ui, Supabase (Postgres + RLS + Edge Functions), TypeScript, BigNumber.js for all financial math, Recharts for charts. No automated test infrastructure — verification is manual against the spec's section 11 checklist.

**Spec:** `docs/cash-flow-feature-design.md`. **Brainstorm:** `docs/cash-flow-feature-discussion.md`.

**Coding policy** (project-wide, recently locked): no hardcoded strings. Every magic literal — type names, currency codes, error templates, dropdown labels, URLs — lives in a constants module and is imported.

---

## File Structure

**New files:**
| Path | Responsibility |
|---|---|
| `src/lib/constants/transaction-types.ts` | Single source of truth for `TransactionType` literals + helper sets (`ADD_TYPES`, `SUBTRACT_TYPES`, `POSITIVE_TYPES`, `CASH_TYPES`, `TYPES_WITH_LINKED_CHILD`). |
| `src/lib/constants/currencies.ts` | `SUPPORTED_FIAT_CURRENCIES`, currency symbol map, `isFiatCurrency()` helper. |
| `src/lib/cash.ts` | `resolveFiatAsset(currency, userId)`, `computeCashAmount(parent)`, `buildChildRow(parent, fundingPlatformId?)`, validation helpers. |
| `src/components/transactions/FundingSourceSelect.tsx` | Funding-source dropdown for the buy form. |
| `supabase/migrations/20260509100000_add_cash_linked_rows.sql` | Schema delta: enum values, `linked_tx_id` column with `ON DELETE CASCADE`, CHECK constraint, lookup index. |

**Modified files:**
| Path | Change |
|---|---|
| `src/types/database.ts` | Extend `TransactionType` union with `cash_credit` and `cash_debit`. Add `linked_tx_id: string \| null` to `Transaction`. |
| `src/lib/balance.ts` | Replace inline `addTypes`/`subtractTypes` with imports from constants. Cash types are members of those sets. |
| `src/lib/queries/transactions.ts` | Add `includeLinkedChildren?: boolean` to `TransactionFilters`. Default the main list to `false`; `true` when `assetId` is set. Add `fetchLinkedChildrenForParents(parentIds)` and `fetchLinkedChild(parentId)` helpers. |
| `src/hooks/useTransactions.ts` | Extend `addTransaction` to accept `fundingPlatformId`. Orchestrate parent + child create. Reconcile child on edit (create/update/delete). Cascade-aware `removeTransaction` recalcs both lenses. |
| `src/components/transactions/AddTransactionModal.tsx` | Insert `<FundingSourceSelect>` for buys; inline insufficient-cash validation against the selected funding platform; sale-proceeds confirmation line for sells; hydrate `fundingPlatformId` from existing child on edit. |
| `src/components/transactions/TransactionRow.tsx` | Render the linked child as a subtitle line under the parent. Replace inline `POSITIVE_TYPES` array with import from constants. |
| `src/components/transactions/TransactionTypeSelector.tsx` | Hide `cash_credit`/`cash_debit` from the user-pickable type list. Add badge styling for them (used in asset-filtered views). |

---

## Conventions & Tooling

- **Local Supabase:** `make supabase-start` boots Postgres + Studio. `make supabase-reset` drops the DB and re-runs all migrations + seed (use after editing migrations). `supabase migration up` applies new migrations incrementally without dropping data.
- **Dev server:** `make dev` (or `npm run dev`) runs Vite on `http://localhost:5173`.
- **Type-check:** `npm run typecheck` (or `make typecheck`).
- **Lint:** `make lint` (eslint).
- **No automated tests in this repo.** Verify each task by:
  1. `npm run typecheck` succeeds.
  2. The behavior listed in the task's verification step works in the running app.
  3. Then commit.
- **Commits:** small and frequent. Each task ends with a commit step. Use Conventional Commits style (`feat:`, `fix:`, `refactor:`, etc.) consistent with the repo's git log.
- **BigNumber:** all money/quantity math goes through `bn()` / `BN_ZERO` from `@/lib/config`. Never use raw `+`/`-` on amount fields.

---

## Task 1: Constants modules — transaction types and currencies

**Files:**
- Create: `src/lib/constants/transaction-types.ts`
- Create: `src/lib/constants/currencies.ts`

- [ ] **Step 1.1: Create `src/lib/constants/transaction-types.ts`**

```ts
import type { TransactionType } from "@/types/database"

export const TRANSACTION_TYPES = {
  BUY: "buy",
  SELL: "sell",
  TRANSFER_IN: "transfer_in",
  TRANSFER_OUT: "transfer_out",
  DIVIDEND: "dividend",
  INTEREST: "interest",
  FEE: "fee",
  CASH_CREDIT: "cash_credit",
  CASH_DEBIT: "cash_debit",
} as const satisfies Record<string, TransactionType>

/** Types whose `amount` adds to a holding's balance. */
export const ADD_TYPES = new Set<TransactionType>([
  TRANSACTION_TYPES.BUY,
  TRANSACTION_TYPES.TRANSFER_IN,
  TRANSACTION_TYPES.DIVIDEND,
  TRANSACTION_TYPES.INTEREST,
  TRANSACTION_TYPES.CASH_CREDIT,
])

/** Types whose `amount` subtracts from a holding's balance. */
export const SUBTRACT_TYPES = new Set<TransactionType>([
  TRANSACTION_TYPES.SELL,
  TRANSACTION_TYPES.TRANSFER_OUT,
  TRANSACTION_TYPES.FEE,
  TRANSACTION_TYPES.CASH_DEBIT,
])

/** Types rendered with a positive (green) sign in the transactions list. */
export const POSITIVE_TYPES: TransactionType[] = [
  TRANSACTION_TYPES.BUY,
  TRANSACTION_TYPES.TRANSFER_IN,
  TRANSACTION_TYPES.DIVIDEND,
  TRANSACTION_TYPES.INTEREST,
  TRANSACTION_TYPES.CASH_CREDIT,
]

/** Auto-paired child types — never directly user-creatable. */
export const CASH_TYPES = new Set<TransactionType>([
  TRANSACTION_TYPES.CASH_CREDIT,
  TRANSACTION_TYPES.CASH_DEBIT,
])

/** Parent types that may carry a linked child row. */
export const TYPES_WITH_LINKED_CHILD = new Set<TransactionType>([
  TRANSACTION_TYPES.BUY,
  TRANSACTION_TYPES.SELL,
])

/** Types selectable in the AddTransactionModal type picker. */
export const USER_PICKABLE_TYPES: TransactionType[] = [
  TRANSACTION_TYPES.BUY,
  TRANSACTION_TYPES.SELL,
  TRANSACTION_TYPES.TRANSFER_IN,
  TRANSACTION_TYPES.TRANSFER_OUT,
  TRANSACTION_TYPES.DIVIDEND,
  TRANSACTION_TYPES.INTEREST,
  TRANSACTION_TYPES.FEE,
]
```

- [ ] **Step 1.2: Create `src/lib/constants/currencies.ts`**

```ts
export const SUPPORTED_FIAT_CURRENCIES = ["USD", "TRY", "EUR"] as const

export type FiatCurrency = (typeof SUPPORTED_FIAT_CURRENCIES)[number]

export const CURRENCY_SYMBOLS: Record<FiatCurrency, string> = {
  USD: "$",
  TRY: "₺",
  EUR: "€",
}

export function isFiatCurrency(code: string): code is FiatCurrency {
  return (SUPPORTED_FIAT_CURRENCIES as readonly string[]).includes(code)
}

export const DEFAULT_CURRENCY: FiatCurrency = "USD"
```

- [ ] **Step 1.3: Verify typecheck**

Run: `npm run typecheck`
Expected: PASS. (The `satisfies` constraint relies on Task 2's `TransactionType` extension — if it fails here with "type 'cash_credit' not assignable", continue to Task 2 first then re-run.)

- [ ] **Step 1.4: Commit**

```bash
git add src/lib/constants/transaction-types.ts src/lib/constants/currencies.ts
git commit -m "feat(cash-flow): add transaction-type and currency constants modules"
```

---

## Task 2: Extend TypeScript types — `database.ts`

**Files:**
- Modify: `src/types/database.ts:3-10` (TransactionType union), `src/types/database.ts:47-63` (Transaction interface)

- [ ] **Step 2.1: Extend the `TransactionType` union**

Replace the current union (lines 3-10):

```ts
export type TransactionType =
  | "buy"
  | "sell"
  | "transfer_in"
  | "transfer_out"
  | "dividend"
  | "interest"
  | "fee"
  | "cash_credit"
  | "cash_debit";
```

- [ ] **Step 2.2: Add `linked_tx_id` to the `Transaction` interface**

Inside the existing `Transaction` interface, add the field after `related_asset_id`:

```ts
export interface Transaction {
  id: string;
  user_id: string;
  asset_id: string;
  platform_id: string;
  type: TransactionType;
  date: string;
  amount: number;
  unit_price: number;
  price_currency: string;
  total_cost: number;
  fee: number;
  fee_currency: string | null;
  related_asset_id: string | null;
  linked_tx_id: string | null;
  notes: string | null;
  created_at: string;
}
```

- [ ] **Step 2.3: Verify typecheck**

Run: `npm run typecheck`
Expected: PASS. Existing code that constructs `Transaction` objects via Supabase responses keeps working (`linked_tx_id` is `string | null`, defaults to `null` in the DB).

- [ ] **Step 2.4: Commit**

```bash
git add src/types/database.ts
git commit -m "feat(cash-flow): extend TransactionType and add linked_tx_id field"
```

---

## Task 3: Schema migration — enum values, FK column, CHECK, index

**Files:**
- Create: `supabase/migrations/20260509100000_add_cash_linked_rows.sql`

> **Postgres caveat**: `ALTER TYPE … ADD VALUE` cannot run inside a transaction in Postgres < 12, and Supabase migrations are wrapped in transactions. Two workarounds exist: (a) use a separate, single-statement migration file with `BEGIN; COMMIT;` stripped, or (b) recreate the enum (drop dependent column, drop type, recreate type with full value set, restore column). Supabase's runner since CLI v1.x supports `ALTER TYPE ADD VALUE` outside transactions when the migration file contains *only* that statement and no other DDL — confirm by running it locally (`make supabase-reset`) before merging. If it fails, fall back to recreate-enum.

- [ ] **Step 3.1: Create the migration file**

```sql
-- Add cash_credit and cash_debit to transaction_type enum.
-- See docs/cash-flow-feature-design.md for the full design.

-- ─── New enum values ──────────────────────────────────────────────
ALTER TYPE transaction_type ADD VALUE IF NOT EXISTS 'cash_credit';
ALTER TYPE transaction_type ADD VALUE IF NOT EXISTS 'cash_debit';

-- ─── Linked-row FK column ─────────────────────────────────────────
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS linked_tx_id uuid
    REFERENCES transactions(id)
    ON DELETE CASCADE;

-- Index for cascade lookups & "show me my paired row".
-- Partial index keeps the index small (most rows have NULL).
CREATE INDEX IF NOT EXISTS transactions_linked_tx_id_idx
  ON transactions(linked_tx_id)
  WHERE linked_tx_id IS NOT NULL;

-- ─── Invariant: cash rows must have a parent; non-cash must not ──
-- A cash_credit / cash_debit row is always paired to its parent.
-- A buy / sell / transfer / etc. is always a parent (linked_tx_id NULL).
ALTER TABLE transactions
  ADD CONSTRAINT cash_row_must_have_parent
    CHECK (
      (type IN ('cash_credit', 'cash_debit') AND linked_tx_id IS NOT NULL)
      OR
      (type NOT IN ('cash_credit', 'cash_debit') AND linked_tx_id IS NULL)
    );
```

- [ ] **Step 3.2: Apply the migration locally**

Run: `make supabase-reset`
Expected: Re-runs all migrations + seed. Output ends with no errors.

If the `ALTER TYPE ADD VALUE` step fails (transaction-block error):
1. Split into two files: `20260509100000_add_cash_enum_values.sql` (just the two `ALTER TYPE` statements) and `20260509100001_add_linked_tx_id_column.sql` (the column + index + CHECK).
2. Re-run `make supabase-reset`.

- [ ] **Step 3.3: Verify the schema**

Run: `supabase db diff --linked --schema public | head -80` (or open Supabase Studio → Tables → `transactions`)
Expected: `linked_tx_id` column visible; CHECK constraint listed; enum has 9 values.

Or via psql:
```bash
supabase status -o json | python3 -c "import sys,json; print(json.load(sys.stdin)['DB_URL'])"
# Connect with the printed URL, then:
\d+ transactions
SELECT unnest(enum_range(NULL::transaction_type));
```

Expected: 9 enum values, including `cash_credit` and `cash_debit`. `linked_tx_id` column with FK to `transactions(id)`. CHECK constraint `cash_row_must_have_parent`.

- [ ] **Step 3.4: Commit**

```bash
git add supabase/migrations/20260509100000_add_cash_linked_rows.sql
# or both files if split
git commit -m "feat(db): add cash_credit/cash_debit enum values + linked_tx_id FK"
```

---

## Task 4: `balance.ts` — extend type sets via constants

**Files:**
- Modify: `src/lib/balance.ts`

- [ ] **Step 4.1: Replace the inline type sets with imports**

Replace the body of `recalculateBalance` lines 25-35:

```ts
import { supabase } from "@/lib/supabase"
import { bn, BN_ZERO } from "@/lib/config"
import { ADD_TYPES, SUBTRACT_TYPES } from "@/lib/constants/transaction-types"

/**
 * Recalculate and upsert a holding's balance from its transactions.
 *
 * balance = SUM(buy + transfer_in + dividend + interest + cash_credit)
 *         - SUM(sell + transfer_out + fee + cash_debit)
 *
 * Cash rows (type=cash_credit/cash_debit) are auto-generated children of
 * buy/sell parents — they sit on the fiat asset (USD/TRY/EUR), so when
 * recalculating that fiat asset's balance, they participate naturally.
 *
 * Writes the result into the `holdings` table (upsert on user_id, asset_id, platform_id).
 */
export async function recalculateBalance(
  userId: string,
  assetId: string,
  platformId: string,
): Promise<string> {
  const { data: transactions, error } = await supabase
    .from("transactions")
    .select("type, amount")
    .eq("asset_id", assetId)
    .eq("platform_id", platformId)

  if (error) throw error

  let balance = BN_ZERO
  for (const tx of transactions ?? []) {
    if (ADD_TYPES.has(tx.type)) {
      balance = balance.plus(bn(tx.amount))
    } else if (SUBTRACT_TYPES.has(tx.type)) {
      balance = balance.minus(bn(tx.amount))
    }
  }

  const balanceStr = balance.toFixed()

  const { error: upsertError } = await supabase.from("holdings").upsert(
    {
      user_id: userId,
      asset_id: assetId,
      platform_id: platformId,
      balance: balanceStr,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,asset_id,platform_id" },
  )

  if (upsertError) throw upsertError

  return balanceStr
}
```

- [ ] **Step 4.2: Verify typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4.3: Manual smoke check**

Open the app (`make dev` if not running). Open Settings → Platforms (or wherever holdings render). Verify nothing is broken — old transactions still produce the same balances (no `cash_credit`/`cash_debit` rows exist yet, so the new types in the sets contribute nothing).

- [ ] **Step 4.4: Commit**

```bash
git add src/lib/balance.ts
git commit -m "refactor(balance): use ADD_TYPES/SUBTRACT_TYPES constants and accept cash rows"
```

---

## Task 5: `cash.ts` library — fiat resolver, amount computation, child-row builder

**Files:**
- Create: `src/lib/cash.ts`

- [ ] **Step 5.1: Create `src/lib/cash.ts`**

```ts
import BigNumber from "bignumber.js"
import { bn, BN_ZERO } from "@/lib/config"
import { supabase } from "@/lib/supabase"
import {
  TRANSACTION_TYPES,
  TYPES_WITH_LINKED_CHILD,
} from "@/lib/constants/transaction-types"
import { isFiatCurrency, type FiatCurrency } from "@/lib/constants/currencies"
import type { Transaction, TransactionInsert } from "@/types/database"

/**
 * Look up the seeded fiat asset row for a currency code. The seed
 * (20260402100010_seed_function.sql) creates one row per (user, fiat
 * currency) at signup, with category='fiat' and ticker matching the code.
 */
export async function resolveFiatAsset(
  currency: string,
  userId: string,
): Promise<string> {
  if (!isFiatCurrency(currency)) {
    throw new Error(`Currency ${currency} is not a supported fiat currency`)
  }
  const { data, error } = await supabase
    .from("assets")
    .select("id")
    .eq("user_id", userId)
    .eq("category", "fiat")
    .eq("ticker", currency)
    .single()
  if (error) throw error
  if (!data?.id) {
    throw new Error(`Fiat asset row missing for ${currency}; check seed`)
  }
  return data.id
}

/**
 * Compute the cash side's amount in the parent's price_currency.
 * - Sell: net proceeds (total_cost − fee, when fee is in same currency).
 * - Buy (platform_deduct): total outlay (total_cost + fee, same-currency).
 * Different fee currencies fall back to total_cost (fee stays informational).
 */
export function computeCashAmount(parent: {
  type: Transaction["type"]
  total_cost: number | string
  fee: number | string | null
  fee_currency: string | null
  price_currency: string
}): BigNumber {
  const sameCurrencyFee =
    parent.fee_currency == null || parent.fee_currency === parent.price_currency
  const feeBn = sameCurrencyFee ? bn(parent.fee ?? 0) : BN_ZERO
  const total = bn(parent.total_cost)
  if (parent.type === TRANSACTION_TYPES.SELL) {
    return total.minus(feeBn)
  }
  if (parent.type === TRANSACTION_TYPES.BUY) {
    return total.plus(feeBn)
  }
  throw new Error(`computeCashAmount called for non-pair type ${parent.type}`)
}

/**
 * Decide whether a parent transaction needs a linked cash child.
 * - Sells always create one (R1).
 * - Buys create one only when fundingPlatformId is provided (R2).
 * - Other types never do (v1).
 */
export function shouldCreateChild(
  parentType: Transaction["type"],
  fundingPlatformId: string | null | undefined,
): boolean {
  if (!TYPES_WITH_LINKED_CHILD.has(parentType)) return false
  if (parentType === TRANSACTION_TYPES.SELL) return true
  if (parentType === TRANSACTION_TYPES.BUY) return Boolean(fundingPlatformId)
  return false
}

/**
 * Build the child-row payload for a parent transaction. Caller is
 * responsible for inserting it and capturing the parent's id into
 * `linked_tx_id` (caller may also resolve the fiat asset id beforehand).
 */
export function buildChildRow(args: {
  parent: Pick<
    Transaction,
    | "user_id"
    | "platform_id"
    | "type"
    | "date"
    | "total_cost"
    | "fee"
    | "fee_currency"
    | "price_currency"
  >
  parentId: string
  fundingPlatformId: string | null
  cashAssetId: string
}): Omit<TransactionInsert, "id"> {
  const { parent, parentId, fundingPlatformId, cashAssetId } = args
  const cashType =
    parent.type === TRANSACTION_TYPES.SELL
      ? TRANSACTION_TYPES.CASH_CREDIT
      : TRANSACTION_TYPES.CASH_DEBIT
  const platformId =
    parent.type === TRANSACTION_TYPES.SELL
      ? parent.platform_id
      : (fundingPlatformId as string)
  const cashAmount = computeCashAmount(parent).toFixed()
  return {
    user_id: parent.user_id,
    asset_id: cashAssetId,
    platform_id: platformId,
    type: cashType,
    date: parent.date,
    amount: cashAmount as unknown as number,
    unit_price: 1,
    price_currency: parent.price_currency,
    total_cost: cashAmount as unknown as number,
    fee: 0,
    fee_currency: null,
    related_asset_id: null,
    linked_tx_id: parentId,
    notes: null,
  }
}

/**
 * Pure validation helper for the buy form. Returns null if OK, or an
 * error-message string. Caller passes the *current* on-platform cash
 * balance (already as BigNumber-string) plus the existing-child offset
 * if editing.
 */
export function validateFundingCash(args: {
  cashOnFunding: string
  totalCost: number | string
  fee: number | string | null
  feeCurrency: string | null
  priceCurrency: string
  existingChildOffset: string | null // null when not editing or not applicable
  fundingPlatformName: string
}): string | null {
  const sameCurrencyFee =
    args.feeCurrency == null || args.feeCurrency === args.priceCurrency
  const required = sameCurrencyFee
    ? bn(args.totalCost).plus(bn(args.fee ?? 0))
    : bn(args.totalCost)
  const offset = args.existingChildOffset ? bn(args.existingChildOffset) : BN_ZERO
  const available = bn(args.cashOnFunding).plus(offset)
  if (available.lt(required)) {
    return (
      `Insufficient ${args.priceCurrency} on ${args.fundingPlatformName} ` +
      `(${available.toFixed()} available, ${required.toFixed()} needed)`
    )
  }
  return null
}
```

The `as unknown as number` casts on `amount` and `total_cost` exist because the TS interface says `number` but Supabase's `numeric` column accepts BigNumber-toFixed() strings to preserve precision (matches the existing pattern in `useTransactions.addTransaction` → `recalculateBalance`'s string round-trip).

- [ ] **Step 5.2: Verify typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5.3: Commit**

```bash
git add src/lib/cash.ts
git commit -m "feat(cash-flow): add cash.ts utility module (fiat resolver, child-row builder)"
```

---

## Task 6: `queries/transactions.ts` — linked-row aware queries

**Files:**
- Modify: `src/lib/queries/transactions.ts`

- [ ] **Step 6.1: Extend `TransactionFilters` and `fetchTransactions`**

Replace the current contents (excluding imports) up to and including `fetchTransactions`:

```ts
import { supabase } from "@/lib/supabase"
import type {
  Transaction,
  TransactionInsert,
  TransactionUpdate,
} from "@/types/database"

export interface TransactionWithDetails extends Transaction {
  assets: { name: string; ticker: string; category: string }
  platforms: { name: string; color: string }
}

export interface TransactionFilters {
  assetId?: string
  platformId?: string
  type?: string
  dateFrom?: string
  dateTo?: string
  /** When true, include rows whose `linked_tx_id IS NOT NULL` (cash side
   *  rows). Defaults to false — main transaction list shows parents only.
   *  Asset-filtered views typically pass true so cash flow appears. */
  includeLinkedChildren?: boolean
}

export async function fetchTransactions(
  userId: string,
  filters?: TransactionFilters,
): Promise<TransactionWithDetails[]> {
  let query = supabase
    .from("transactions")
    .select("*, assets!transactions_asset_id_fkey(name, ticker, category), platforms(name, color)")
    .eq("user_id", userId)
    .order("date", { ascending: false })
    .order("created_at", { ascending: false })

  // Default: hide cash rows from the main list. When the caller is
  // viewing a specific asset (typically by passing assetId), they
  // probably want to see all rows touching that asset including the
  // auto-paired cash rows. The caller can also force include by
  // setting includeLinkedChildren explicitly.
  const showLinkedChildren =
    filters?.includeLinkedChildren ?? Boolean(filters?.assetId)

  if (!showLinkedChildren) {
    query = query.is("linked_tx_id", null)
  }

  if (filters?.assetId) {
    query = query.eq("asset_id", filters.assetId)
  }
  if (filters?.platformId) {
    query = query.eq("platform_id", filters.platformId)
  }
  if (filters?.type) {
    query = query.eq("type", filters.type)
  }
  if (filters?.dateFrom) {
    query = query.gte("date", filters.dateFrom)
  }
  if (filters?.dateTo) {
    query = query.lte("date", filters.dateTo)
  }

  const { data, error } = await query

  if (error) throw error

  return (data ?? []) as unknown as TransactionWithDetails[]
}
```

- [ ] **Step 6.2: Add the linked-child fetchers**

Append to the same file, after `fetchTransactionsByAsset`:

```ts
/**
 * Batch-fetch the linked child rows for a list of parent ids. Used by
 * the main transactions list to render the cash subtitle line under
 * each parent.
 */
export async function fetchLinkedChildrenForParents(
  parentIds: string[],
): Promise<Map<string, TransactionWithDetails>> {
  if (parentIds.length === 0) return new Map()
  const { data, error } = await supabase
    .from("transactions")
    .select("*, assets!transactions_asset_id_fkey(name, ticker, category), platforms(name, color)")
    .in("linked_tx_id", parentIds)
  if (error) throw error
  const out = new Map<string, TransactionWithDetails>()
  for (const row of (data ?? []) as unknown as TransactionWithDetails[]) {
    if (row.linked_tx_id) out.set(row.linked_tx_id, row)
  }
  return out
}

/**
 * Fetch a single linked child for a parent. Used by the edit flow to
 * reconcile parent edits with the existing child.
 */
export async function fetchLinkedChild(
  parentId: string,
): Promise<Transaction | null> {
  const { data, error } = await supabase
    .from("transactions")
    .select("*")
    .eq("linked_tx_id", parentId)
    .maybeSingle()
  if (error) throw error
  return (data as Transaction | null) ?? null
}
```

- [ ] **Step 6.3: Verify typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 6.4: Manual smoke check**

In the running app, the main transactions list should still render exactly as before (no rows with `linked_tx_id` exist yet, so the new `is("linked_tx_id", null)` filter is a no-op).

- [ ] **Step 6.5: Commit**

```bash
git add src/lib/queries/transactions.ts
git commit -m "feat(queries): linked-row aware transaction queries"
```

---

## Task 7: `useTransactions` — `addTransaction` with funding source

**Files:**
- Modify: `src/hooks/useTransactions.ts`

- [ ] **Step 7.1: Extend `addTransaction` to accept and act on `fundingPlatformId`**

Replace the existing `addTransaction` (lines 76-88) with:

```ts
const addTransaction = async (
  data: Omit<TransactionInsert, "user_id">,
  options?: { fundingPlatformId?: string | null },
) => {
  if (!user) throw new Error("Not authenticated")

  const parent = await createTransaction({ ...data, user_id: user.id })
  await ensureHistoricalRate(parent.price_currency, parent.fee_currency, parent.date)

  // Track every (asset, platform) lens we need to recalc.
  const lenses = new Set<string>()
  const addLens = (assetId: string, platformId: string) =>
    lenses.add(`${assetId}::${platformId}`)
  addLens(parent.asset_id, parent.platform_id)
  if (parent.related_asset_id) {
    addLens(parent.asset_id, parent.related_asset_id)
  }

  const fundingPlatformId = options?.fundingPlatformId ?? null
  if (shouldCreateChild(parent.type, fundingPlatformId)) {
    const cashAssetId = await resolveFiatAsset(parent.price_currency, user.id)
    const child = buildChildRow({
      parent,
      parentId: parent.id,
      fundingPlatformId,
      cashAssetId,
    })
    await createTransaction(child as TransactionInsert)
    addLens(cashAssetId, child.platform_id)
  }

  for (const lens of lenses) {
    const [assetId, platformId] = lens.split("::")
    await recalculateBalance(user.id, assetId, platformId)
  }
  await refresh()
  bumpTxVersion()
  return parent
}
```

- [ ] **Step 7.2: Add the new imports**

At the top of the file:

```ts
import { resolveFiatAsset, buildChildRow, shouldCreateChild } from "@/lib/cash"
```

- [ ] **Step 7.3: Verify typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 7.4: Manual verification — sell auto-credit**

In the running app:
1. Open Settings → Platforms (or wherever holdings render). Note Midas USD balance (likely $0 today).
2. Add a sell: AAPL on Midas, amount=1, unit_price=$200, price_currency=USD, fee=0.
3. After save, refresh holdings. Midas USD should now show **+$200.00**.
4. In Supabase Studio → Tables → `transactions`, confirm two rows for the sell: parent (`type=sell`) and child (`type=cash_credit`, `linked_tx_id` = parent.id, `asset_id` = USD asset, `platform_id` = Midas platform).
5. Delete the test sell after verifying (it'll cascade-delete the child via the FK; Task 9 makes the recalc automatic; for now manually re-run holdings view or do the cleanup at the end of Task 9).

- [ ] **Step 7.5: Commit**

```bash
git add src/hooks/useTransactions.ts
git commit -m "feat(cash-flow): addTransaction creates linked cash child for sells and platform-funded buys"
```

---

## Task 8: `useTransactions` — `editTransaction` with child reconciliation

**Files:**
- Modify: `src/hooks/useTransactions.ts`

- [ ] **Step 8.1: Replace `editTransaction` with cascade-aware version**

Replace the existing `editTransaction` (lines 90-115) with:

```ts
const editTransaction = async (
  id: string,
  data: TransactionUpdate,
  /** original asset/platform so we can recalculate balances on either side
   * if they changed. */
  original: { assetId: string; platformId: string },
  options?: { fundingPlatformId?: string | null },
) => {
  if (!user) throw new Error("Not authenticated")

  // Capture pre-edit child (if any) BEFORE the parent update — once the
  // parent's price_currency or platform changes we may need both old and
  // new lenses for the cash side.
  const existingChild = await fetchLinkedChild(id)

  const updated = await updateTransactionQuery(id, data)
  await ensureHistoricalRate(updated.price_currency, updated.fee_currency, updated.date)

  const lenses = new Set<string>()
  const addLens = (assetId: string, platformId: string) =>
    lenses.add(`${assetId}::${platformId}`)

  // Parent lenses (old + new if they differ).
  addLens(original.assetId, original.platformId)
  addLens(updated.asset_id, updated.platform_id)

  // Cash-side reconciliation.
  const fundingPlatformId = options?.fundingPlatformId ?? null
  const needsChild = shouldCreateChild(updated.type, fundingPlatformId)

  if (existingChild) {
    addLens(existingChild.asset_id, existingChild.platform_id)
  }

  if (needsChild) {
    const cashAssetId = await resolveFiatAsset(updated.price_currency, user.id)
    const childPayload = buildChildRow({
      parent: updated,
      parentId: updated.id,
      fundingPlatformId,
      cashAssetId,
    })

    if (existingChild) {
      // Update in place — covers all the moving fields (asset, platform,
      // amount, date, currency).
      await updateTransactionQuery(existingChild.id, {
        asset_id: childPayload.asset_id,
        platform_id: childPayload.platform_id,
        type: childPayload.type,
        date: childPayload.date,
        amount: childPayload.amount,
        unit_price: childPayload.unit_price,
        price_currency: childPayload.price_currency,
        total_cost: childPayload.total_cost,
        fee: childPayload.fee,
        fee_currency: childPayload.fee_currency,
      })
    } else {
      await createTransaction(childPayload as TransactionInsert)
    }
    addLens(childPayload.asset_id, childPayload.platform_id)
  } else if (existingChild) {
    // Edit removed the child requirement (e.g. buy switched from
    // platform_deduct → external). Delete the orphan.
    await deleteTransaction(existingChild.id)
  }

  for (const lens of lenses) {
    const [assetId, platformId] = lens.split("::")
    await recalculateBalance(user.id, assetId, platformId)
  }
  await refresh()
  bumpTxVersion()
  return updated
}
```

- [ ] **Step 8.2: Add the new import**

Update the existing query import to include `fetchLinkedChild`:

```ts
import {
  fetchTransactions,
  createTransaction,
  updateTransaction as updateTransactionQuery,
  deleteTransaction,
  fetchLinkedChild,
  type TransactionWithDetails,
  type TransactionFilters,
} from "@/lib/queries/transactions"
```

- [ ] **Step 8.3: Verify typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 8.4: Manual verification — edit cascades**

In the running app:
1. Add a sell: AAPL on Midas, 1 share @ $200, USD. Confirm Midas USD = $200.
2. Edit the sell: change unit_price to $250. Save. Confirm Midas USD = $250.
3. Edit the sell: change platform from Midas to Garanti (or another). Save. Confirm Midas USD = $0, Garanti USD = $250 (assuming Garanti had $0 before).
4. In Supabase Studio, confirm the child row's `platform_id` and `amount` updated in place (no new child row).
5. Delete the test sell (will cascade child).

- [ ] **Step 8.5: Commit**

```bash
git add src/hooks/useTransactions.ts
git commit -m "feat(cash-flow): editTransaction reconciles linked child on parent edit"
```

---

## Task 9: `useTransactions` — `removeTransaction` with linked-child recalc

**Files:**
- Modify: `src/hooks/useTransactions.ts`

- [ ] **Step 9.1: Replace `removeTransaction` to capture and recalc child lens**

Replace the existing `removeTransaction` (lines 117-127) with:

```ts
const removeTransaction = async (
  id: string,
  assetId: string,
  platformId: string,
) => {
  if (!user) throw new Error("Not authenticated")

  // Capture child lens BEFORE delete — Postgres ON DELETE CASCADE will
  // remove the child row alongside the parent, but we still need to
  // recalc the cash-asset balance.
  const child = await fetchLinkedChild(id)

  await deleteTransaction(id)

  const lenses = new Set<string>([`${assetId}::${platformId}`])
  if (child) {
    lenses.add(`${child.asset_id}::${child.platform_id}`)
  }
  for (const lens of lenses) {
    const [a, p] = lens.split("::")
    await recalculateBalance(user.id, a, p)
  }
  await refresh()
  bumpTxVersion()
}
```

- [ ] **Step 9.2: Verify typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 9.3: Manual verification — delete cascade**

In the running app:
1. Add a sell: AAPL on Midas, 1 share @ $200, USD. Confirm Midas USD = $200.
2. Delete the sell from the transactions list.
3. Confirm Midas USD = $0 (no orphan cash row).
4. In Supabase Studio, confirm both the parent and the `cash_credit` child rows are gone.

- [ ] **Step 9.4: Commit**

```bash
git add src/hooks/useTransactions.ts
git commit -m "feat(cash-flow): removeTransaction recalcs cash-side lens after FK cascade"
```

---

## Task 10: `FundingSourceSelect` component

**Files:**
- Create: `src/components/transactions/FundingSourceSelect.tsx`

- [ ] **Step 10.1: Create the component**

```tsx
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useHoldings } from "@/hooks/useHoldings"

import type { Asset, Platform } from "@/types/database"

export const EXTERNAL_CASH_VALUE = "__external__"

interface Props {
  value: string | null
  /** Pass null to mean "external cash" (no deduction). */
  onChange: (platformId: string | null) => void
  /** All seeded assets — used to find the fiat asset row for `priceCurrency`. */
  assets: Asset[]
  /** All user platforms. */
  platforms: Platform[]
  /** The buy's price_currency — drives which fiat asset we look up balances for. */
  priceCurrency: string
  /** When editing, the existing child's amount (so we credit it back into the
   *  available figure shown next to the platform). */
  existingChildAmount?: string | null
  /** When editing, the existing child's platform — used with existingChildAmount. */
  existingChildPlatformId?: string | null
}

export function FundingSourceSelect({
  value,
  onChange,
  assets,
  platforms,
  priceCurrency,
  existingChildAmount,
  existingChildPlatformId,
}: Props) {
  const { holdings } = useHoldings()
  const fiatAsset = assets.find(
    (a) => a.category === "fiat" && a.ticker === priceCurrency,
  )

  // Build candidate list: every platform that has a holding row for the
  // fiat asset, plus all platforms the user has (so they can fund from
  // a platform with $0 if they want — UI disables-with-message instead).
  const platformBalances = new Map<string, string>()
  if (fiatAsset) {
    for (const h of holdings) {
      if (h.asset_id === fiatAsset.id) {
        platformBalances.set(h.platform_id, String(h.balance ?? "0"))
      }
    }
  }

  const offsetForPlatform = (platformId: string): string => {
    if (
      existingChildPlatformId &&
      existingChildAmount &&
      existingChildPlatformId === platformId
    ) {
      return existingChildAmount
    }
    return "0"
  }

  return (
    <Select
      value={value ?? EXTERNAL_CASH_VALUE}
      onValueChange={(v) => onChange(v === EXTERNAL_CASH_VALUE ? null : v)}
    >
      <SelectTrigger className="w-full">
        <SelectValue placeholder="Select funding source..." />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={EXTERNAL_CASH_VALUE}>
          External cash (no deduction)
        </SelectItem>
        {platforms.map((p) => {
          const base = platformBalances.get(p.id) ?? "0"
          // For the dropdown's display, show available + offset (the amount
          // already debited by the existing child, which we'll free up if
          // the user keeps editing on this same platform).
          const offset = offsetForPlatform(p.id)
          return (
            <SelectItem key={p.id} value={p.id}>
              <span className="flex items-center gap-2">
                <span
                  className="inline-block size-2.5 rounded-full"
                  style={{ backgroundColor: p.color }}
                />
                {p.name} — {base} {priceCurrency}
                {offset !== "0" && (
                  <span className="text-xs text-muted-foreground">
                    {" "}(+{offset} from this edit)
                  </span>
                )}
              </span>
            </SelectItem>
          )
        })}
      </SelectContent>
    </Select>
  )
}
```

- [ ] **Step 10.2: Verify typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 10.3: Commit**

```bash
git add src/components/transactions/FundingSourceSelect.tsx
git commit -m "feat(cash-flow): add FundingSourceSelect component"
```

---

## Task 11: Wire `FundingSourceSelect` and validation into `AddTransactionModal`

**Files:**
- Modify: `src/components/transactions/AddTransactionModal.tsx`

- [ ] **Step 11.1: Add new state and imports**

At the top of the file, alongside the existing imports, add:

```tsx
import { FundingSourceSelect, EXTERNAL_CASH_VALUE } from "./FundingSourceSelect"
import { fetchLinkedChild } from "@/lib/queries/transactions"
import { validateFundingCash } from "@/lib/cash"
import { TRANSACTION_TYPES } from "@/lib/constants/transaction-types"
import { CURRENCY_SYMBOLS, type FiatCurrency } from "@/lib/constants/currencies"
import { bn } from "@/lib/config"
```

In the component body, alongside the existing state hooks, add:

```tsx
const [fundingPlatformId, setFundingPlatformId] = useState<string | null>(null)
const [existingChild, setExistingChild] = useState<{
  amount: string
  platformId: string
} | null>(null)
const [fundingError, setFundingError] = useState<string | null>(null)
```

- [ ] **Step 11.2: Hydrate `fundingPlatformId` from existing child on edit**

Inside the existing `useEffect` (the one that hydrates from `editing`), in the `if (editing) { ... }` branch, append:

```tsx
// Look up existing child to repopulate the funding-source selector
;(async () => {
  if (editing.type !== TRANSACTION_TYPES.BUY) {
    setFundingPlatformId(null)
    setExistingChild(null)
    return
  }
  const child = await fetchLinkedChild(editing.id)
  if (child) {
    setFundingPlatformId(child.platform_id)
    setExistingChild({
      amount: String(child.amount),
      platformId: child.platform_id,
    })
  } else {
    setFundingPlatformId(null)
    setExistingChild(null)
  }
})()
```

In the `else` branch (new transaction), reset:

```tsx
setFundingPlatformId(null)
setExistingChild(null)
setFundingError(null)
```

- [ ] **Step 11.3: Pull `holdings` from `useHoldings`**

The funding-source validation needs a holdings lookup keyed by the **fiat** asset, not the trade asset. The existing destructure only pulls `getTotalBalance` and `getHoldingsForAsset`. Update it to expose `holdings`:

```tsx
const { holdings, getTotalBalance, getHoldingsForAsset } = useHoldings()
```

- [ ] **Step 11.4: Run validation when relevant fields change**

Add a `useEffect` after the existing hydration one:

```tsx
useEffect(() => {
  if (type !== TRANSACTION_TYPES.BUY || !fundingPlatformId) {
    setFundingError(null)
    return
  }
  const fiatAsset = assets.find(
    (a) => a.category === "fiat" && a.ticker === priceCurrency,
  )
  if (!fiatAsset) {
    setFundingError(null)
    return
  }
  const fiatHolding = holdings.find(
    (h) => h.asset_id === fiatAsset.id && h.platform_id === fundingPlatformId,
  )
  const cashOnFunding = String(fiatHolding?.balance ?? "0")
  const fundingPlatformName =
    platforms.find((p) => p.id === fundingPlatformId)?.name ?? "platform"
  const offset =
    existingChild && existingChild.platformId === fundingPlatformId
      ? existingChild.amount
      : null
  const err = validateFundingCash({
    cashOnFunding,
    totalCost: parsedAmount * parsedPrice,
    fee: parseFloat(fee) || 0,
    feeCurrency: fee ? feeCurrency : null,
    priceCurrency,
    existingChildOffset: offset,
    fundingPlatformName,
  })
  setFundingError(err)
}, [
  type,
  fundingPlatformId,
  priceCurrency,
  parsedAmount,
  parsedPrice,
  fee,
  feeCurrency,
  assets,
  platforms,
  existingChild,
  holdings,
])
```

- [ ] **Step 11.5: Render the selector and the error**

In the JSX, find the section after the Fee fields and before Notes. Insert (visible only when `type === "buy"`):

```tsx
{type === TRANSACTION_TYPES.BUY && (
  <div className="space-y-2">
    <Label>Funding source</Label>
    <FundingSourceSelect
      value={fundingPlatformId}
      onChange={setFundingPlatformId}
      assets={assets}
      platforms={platforms}
      priceCurrency={priceCurrency}
      existingChildAmount={existingChild?.amount ?? null}
      existingChildPlatformId={existingChild?.platformId ?? null}
    />
    {fundingError && (
      <p className="text-xs text-destructive">{fundingError}</p>
    )}
  </div>
)}
```

For sells, insert a read-only confirmation line in the same area (visible only when `type === "sell"` and `parsedAmount > 0` and `parsedPrice > 0`):

```tsx
{type === TRANSACTION_TYPES.SELL && parsedAmount > 0 && parsedPrice > 0 && (
  <div className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
    Sale proceeds: {CURRENCY_SYMBOLS[priceCurrency as FiatCurrency] ?? ""}
    {(parsedAmount * parsedPrice - (parseFloat(fee) || 0)).toLocaleString(
      undefined,
      { minimumFractionDigits: 2, maximumFractionDigits: 2 },
    )}{" "}
    → credited to{" "}
    {platforms.find((p) => p.id === platformId)?.name ?? "the trading platform"}{" "}
    {priceCurrency}
  </div>
)}
```

- [ ] **Step 11.6: Block submit on funding error and pass `fundingPlatformId` through**

Update `canSubmit`:

```tsx
const canSubmit =
  assetId &&
  platformId &&
  parsedAmount > 0 &&
  !isOverBalance &&
  !fundingError &&
  !submitting &&
  (showPriceFields ? parsedPrice > 0 : true) &&
  (isTransfer && !isEdit ? destPlatformId && destPlatformId !== platformId : true)
```

Update the calls to `addTransaction` and `editTransaction` to pass the funding option:

```tsx
if (isEdit && editing) {
  await editTransaction(
    editing.id,
    payload,
    { assetId: editing.asset_id, platformId: editing.platform_id },
    { fundingPlatformId },
  )
  toast.success("Transaction updated")
} else {
  await addTransaction(payload, { fundingPlatformId })
  // ...existing transfer-pair logic stays unchanged.
  if (isTransfer && destPlatformId) {
    // unchanged
  }
  toast.success("Transaction recorded")
}
```

- [ ] **Step 11.7: Verify typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 11.8: Manual verification — funding source UX + validation**

In the running app:
1. Open Add Transaction → Buy. Confirm "Funding source" dropdown appears, defaulting to "External cash".
2. Set asset=AAPL, platform=Midas, amount=4, unit_price=$250, fee=$1.50, USD. Total = $1,000.
3. Submit with funding = External. Confirm AAPL on Midas = +4, no cash effect.
4. Add a transfer_in of $5,000 USD onto Bank platform. Confirm Bank USD = $5,000.
5. Add another buy: AAPL on Midas, 4 @ $250, fee $1.50, USD, **funding = Bank**. Submit. Confirm: AAPL on Midas = +8, Bank USD = $3,998.50.
6. Try a buy with funding = Bank, amount creating total > $3,998.50. Confirm inline error appears: "Insufficient USD on Bank (...)".
7. Edit the platform-funded buy from step 5: change funding from Bank → External. Confirm the cash row disappears (Bank USD goes back to $5,000) and AAPL on Midas stays at +8.
8. Switch to Sell. Confirm: no funding selector appears; "Sale proceeds" preview shows.

- [ ] **Step 11.9: Commit**

```bash
git add src/components/transactions/AddTransactionModal.tsx
git commit -m "feat(cash-flow): wire funding-source selector + validation into AddTransactionModal"
```

---

## Task 12: `TransactionRow` — render cash subtitle on parent rows

**Files:**
- Modify: `src/components/transactions/TransactionRow.tsx`
- Modify: `src/pages/TransactionsPage.tsx` (or whichever component fetches and maps transactions to rows — find the call site of `<TransactionRow>` and update it to also pass the linked-child map)

- [ ] **Step 12.1: Replace `POSITIVE_TYPES` inline with constants import**

In `TransactionRow.tsx`, remove the local definition (line 29):
```ts
const POSITIVE_TYPES: TransactionType[] = ["buy", "transfer_in", "dividend", "interest"]
```

Replace with:
```ts
import { POSITIVE_TYPES } from "@/lib/constants/transaction-types"
```

- [ ] **Step 12.2: Accept the linked child as a prop**

Update the `Props` interface and the function signature:

```tsx
import { CURRENCY_SYMBOLS, type FiatCurrency } from "@/lib/constants/currencies"
import { TRANSACTION_TYPES } from "@/lib/constants/transaction-types"

interface Props {
  transaction: TransactionWithDetails
  linkedChild?: TransactionWithDetails | null
  currency: "USD" | "TRY"
}

export function TransactionRow({ transaction, linkedChild }: Props) {
  // ... existing body
```

- [ ] **Step 12.3: Render the subtitle line under the existing row**

After the closing `</TableRow>` of the main row but inside the `<>` fragment, insert a second `<TableRow>` for the cash subtitle (or use a CSS-only subtitle line below the amount). Simplest: put the subtitle inside the existing Notes cell or as a small `div` under the asset cell. Below is a minimal subtitle injected as a second-row underneath:

Actually — the existing layout uses one `<TableRow>` per transaction with cells across. Adding a sub-row would break the table grid. Cleaner: put the subtitle as a small line below the asset name in the Asset cell.

Replace the Asset cell:
```tsx
<TableCell>
  <div className="flex flex-col">
    <span className="font-medium">{tx.assets?.name ?? "Unknown"}</span>
    <span className="text-xs text-muted-foreground">
      {tx.assets?.ticker ?? ""}
    </span>
    {linkedChild && (
      <span className="text-xs text-muted-foreground italic">
        {linkedChild.type === TRANSACTION_TYPES.CASH_CREDIT
          ? `+${CURRENCY_SYMBOLS[linkedChild.price_currency as FiatCurrency] ?? ""}${Number(linkedChild.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${linkedChild.price_currency} → ${linkedChild.platforms?.name ?? "platform"}`
          : `−${CURRENCY_SYMBOLS[linkedChild.price_currency as FiatCurrency] ?? ""}${Number(linkedChild.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${linkedChild.price_currency} from ${linkedChild.platforms?.name ?? "platform"}`}
      </span>
    )}
    {tx.type === TRANSACTION_TYPES.BUY && !linkedChild && (
      <span className="text-xs text-muted-foreground italic">
        external cash
      </span>
    )}
  </div>
</TableCell>
```

- [ ] **Step 12.4: Pass the linked-child map from the page**

Open `src/pages/TransactionsPage.tsx`. Find where `<TransactionRow>` is rendered. Above the render loop, fetch the linked-children map:

```tsx
import { useEffect, useState } from "react"
import { fetchLinkedChildrenForParents, type TransactionWithDetails } from "@/lib/queries/transactions"
// ... other imports

// inside the component:
const [childMap, setChildMap] = useState<Map<string, TransactionWithDetails>>(new Map())

useEffect(() => {
  ;(async () => {
    const parentIds = transactions
      .filter((t) => t.linked_tx_id == null)
      .map((t) => t.id)
    if (parentIds.length === 0) {
      setChildMap(new Map())
      return
    }
    setChildMap(await fetchLinkedChildrenForParents(parentIds))
  })()
}, [transactions])
```

In the row mapping, pass `linkedChild={childMap.get(tx.id) ?? null}`.

If `TransactionsPage.tsx` delegates rendering through another component (e.g., `TransactionLog` or `TransactionList`), follow the chain and add the prop at the actual `<TransactionRow>` call site. The page-level fetch above is the right place for the map either way.

- [ ] **Step 12.5: Verify typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 12.6: Manual verification — list rendering**

In the running app:
1. Add a sell on AAPL/Midas with cash credit. Open Transactions page.
2. The AAPL sell row should show a subtitle line under the asset name, e.g., `+$998.50 USD → Midas`.
3. Add a platform-funded buy of AAPL on Midas, funded from Bank. Verify the buy row's subtitle reads e.g. `−$1,001.50 USD from Bank`.
4. Add an external buy. Verify subtitle reads `external cash`.
5. Confirm no extra rows for cash-side appear in the main list.

- [ ] **Step 12.7: Commit**

```bash
git add src/components/transactions/TransactionRow.tsx src/pages/TransactionsPage.tsx
git commit -m "feat(cash-flow): render linked cash effect as subtitle on parent row"
```

---

## Task 13: `TransactionTypeSelector` — handle new types

**Files:**
- Modify: `src/components/transactions/TransactionTypeSelector.tsx`

- [ ] **Step 13.1: Hide cash types from the type picker**

Find the source-of-truth array of selectable types in `TransactionTypeSelector` (e.g., a `const TYPES = [...]` or similar). Replace it with the import from constants:

```tsx
import { USER_PICKABLE_TYPES } from "@/lib/constants/transaction-types"
```

Use `USER_PICKABLE_TYPES` everywhere a list of types was previously hardcoded.

- [ ] **Step 13.2: Add badge styling for cash types**

In `TransactionTypeBadge`, add `cash_credit` and `cash_debit` cases to the type → variant/label map. Cash credit gets a green/positive style; cash debit gets a red/negative style. Use the same visual cues as `dividend`/`interest` (positive) and `fee` (negative) respectively — consult the existing badge map.

If the badge map looks like:
```tsx
const VARIANT: Record<TransactionType, ...> = { buy: "...", sell: "...", ... }
```

Add:
```tsx
cash_credit: { label: "Cash credit", variant: "positive" as const },
cash_debit:  { label: "Cash debit",  variant: "negative" as const },
```

(Use whatever variant names the existing map uses.)

- [ ] **Step 13.3: Verify typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 13.4: Manual verification**

1. Open Add Transaction. Confirm `cash_credit` and `cash_debit` do NOT appear in the type picker.
2. Open Transactions page. Filter by asset = USD (a fiat asset). Confirm the linked cash rows now appear and their badges render with correct color/label.

- [ ] **Step 13.5: Commit**

```bash
git add src/components/transactions/TransactionTypeSelector.tsx
git commit -m "feat(cash-flow): TransactionTypeSelector hides cash types and badges them"
```

---

## Task 14: Final E2E manual verification

**Files:** (none — verification only)

This task runs the full verification checklist from `docs/cash-flow-feature-design.md` Section 11 in a fresh state. Skip any item already verified in earlier tasks; pay extra attention to multi-edit cascades, snapshot/dashboard impact, and FIFO P&L preservation.

- [ ] **Step 14.1: Reset to a clean test state**

Reset the local DB with `make supabase-reset` (re-applies migrations + seed). Sign in as the test user.

- [ ] **Step 14.2: Sell + auto-credit**

1. Add a transfer_in of 10 AAPL onto Midas at $200 unit price (`price_currency=USD`).
2. Sell 4 AAPL on Midas at $250, fee $1.50.
3. **Verify:**
   - AAPL on Midas = 6.
   - Midas USD = $998.50.
   - Transactions list shows one row for the sell with subtitle `+$998.50 USD → Midas`.
   - Supabase Studio: parent + child rows exist; child has `linked_tx_id` and `type=cash_credit`.

- [ ] **Step 14.3: Buy with platform_deduct from a different platform**

1. Add a transfer_in of $5,000 USD onto Bank.
2. Add a buy of 4 AAPL on Midas at $250, fee $1.50, **funding source = Bank**.
3. **Verify:**
   - AAPL on Midas = 10.
   - Bank USD = $3,998.50.
   - Midas USD = $998.50 (unchanged from step 14.2).
   - Transactions list shows one row for the buy with subtitle `−$1,001.50 USD from Bank`.

- [ ] **Step 14.4: Buy with external (default)**

1. Add a buy of 1 AAPL on Midas at $250, fee $0, funding = External.
2. **Verify:**
   - AAPL on Midas = 11.
   - No cash effect anywhere.
   - Subtitle in list reads `external cash`.

- [ ] **Step 14.5: Insufficient cash rejection**

1. Try to add a buy of 100 AAPL on Midas at $250, funding = Bank. Required = $25,000; Bank has $3,998.50.
2. **Verify:** Form blocks submit with inline error `Insufficient USD on Bank ($3998.50 available, $25000 needed)`.

- [ ] **Step 14.6: Edit cascade — funding platform change**

1. Open the buy created in 14.3 (Bank-funded). Edit funding source: Bank → Midas. Save.
2. **Verify:**
   - Bank USD increased by $1,001.50 → $5,000.
   - Midas USD decreased by $1,001.50 → −$3 (998.50 − 1001.50). **This goes negative because Midas had only $998.50 from the sell.** Form should NOT have allowed this — return to step 14.6 expectation: the validation in step 11 should block it with "Insufficient USD on Midas". If it doesn't, that's a bug — the validation must run on edit too.
3. If the bug is real, file it; otherwise: close the modal without saving the bad edit.

- [ ] **Step 14.7: Edit cascade — external → platform_deduct**

1. Open the buy from 14.4 (external). Edit funding source: External → Bank. Save.
2. **Verify:** New cash_debit child appears for Bank ($250); Bank USD = $4,750.

- [ ] **Step 14.8: Delete cascade**

1. Delete the sell from 14.2.
2. **Verify:**
   - AAPL on Midas back to 10.
   - Midas USD back to $0.
   - The cash_credit child is gone from the DB (Supabase Studio).
   - Transactions list no longer shows the sell row.

- [ ] **Step 14.9: FIFO P&L unaffected by cash rows**

1. Open the AAPL P&L view. Verify realized/unrealized numbers match what you'd expect from buy/sell on AAPL alone (cost basis includes capitalized fees, sell proceeds net of fees).
2. The presence of `cash_credit`/`cash_debit` rows on USD must NOT affect AAPL's P&L numbers.

- [ ] **Step 14.10: Settings → Platforms shows fiat balances**

1. Open Settings → Platforms (or the platforms detail view). Verify Bank, Midas, etc. now list their USD/TRY/EUR holdings alongside non-fiat holdings.

- [ ] **Step 14.11: Daily snapshot includes cash**

1. Trigger the daily snapshot manually (the app's existing button or run the cron once).
2. **Verify:** The new snapshot's `total_usd` reflects the fiat cash balances (a step-up vs the previous day's snapshot, which is documented expected behavior).

- [ ] **Step 14.12: Final type-check + lint**

```bash
npm run typecheck
make lint
```
Both must pass cleanly.

- [ ] **Step 14.13: Final commit (optional)**

If any small fixes were needed during verification, commit them. Otherwise no commit.

```bash
git status   # confirm clean tree
```

---

## Self-Review Notes (for the engineer)

- **Spec coverage:** Every requirement in `docs/cash-flow-feature-design.md` Sections 4–10 is implemented in Tasks 1–13. Section 11 (manual testing) is Task 14.
- **No magic strings:** Tasks 1, 4, 11, 12, 13 explicitly extract or import from the constants modules. While editing files in later tasks, watch for inline strings (URLs, type names, currency codes, error templates) and lift them — feedback memory `feedback_no_hardcoded_strings.md`.
- **BigNumber:** All new arithmetic on `amount`, `total_cost`, `fee` goes through `bn()`. See `src/lib/cash.ts` and `validateFundingCash`.
- **No new test infra:** This project has no automated tests. Each task ends with manual verification followed by commit. Don't introduce vitest/jest as part of this feature — that's scope creep.
- **Migration caveat:** Task 3's enum + column + CHECK in one file may fail in Supabase's transaction-wrapped migration runner. Fall back to splitting the file as documented in the task.
- **Ordering:** Tasks 1 and 2 are interdependent (constants depend on the extended union). Apply Task 2 first if Task 1's `satisfies` constraint complains; otherwise Task 1 first works fine.
