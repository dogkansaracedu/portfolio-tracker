# Cash Flow & Buy/Sell Linkage — Design Spec

**Status:** Implemented (2026-05-10). This file is now the canonical post-implementation reference.

---

## 1. Problem

Today, `transactions` rows describe one-sided effects on a single `(asset, platform)` lens. Sells remove shares but produce no cash; buys add shares but draw from nowhere. The `holdings` table — a pure derivation of transactions — therefore mis-states cash positions:

- Sell of $1,000 AAPL on Midas → AAPL goes down, but USD on Midas does not go up.
- Buy of $1,000 AAPL on Midas → AAPL goes up, but USD on Midas does not go down.
- A `transfer_in` of $2,000 USD onto Midas, followed by a $1,000 buy, leaves the DB still claiming $2,000 USD on Midas.

Result: either the user never tracks cash (portfolio total understates by uninvested capital) or they track it but each buy double-counts. Both states are silently tolerated.

## 2. Goals

**R1 — Auto-credit on sell.** Every sell creates a cash credit on the same platform in the sell's `price_currency`. No manual second step.

**R2 — Funding source on buy.** Every buy has an explicit funding source: either external cash (no deduction, current behavior) or "deduct from cash on platform X". X may be the trading platform, a separate bank/cash platform, or any platform holding the buy's `price_currency`.

**R3 — Single-row UI.** A sell or platform-funded buy appears as **one** entry in the transactions list. The cash side renders as a subtitle on the parent row, not a separate line.

## 3. Non-goals (v1)

- Dividend/interest auto-credit (current semantics preserved — out of scope, future v2).
- Forex conversions modeled as `sell` of one fiat for another.
- Settle-currency override (e.g., crypto exchange settling a USD-denominated trade in USDT).
- Editing the cash row independently of its parent.
- Migration of historical transactions — they keep their current semantics (no cash effect).
- Negative cash via "warn" or "silent allow" — only "reject with inline error" is supported.

## 4. Data model

### 4.1 Storage shape: linked rows

Each cash effect is a **separate `transactions` row**, paired to its parent via a `linked_tx_id` foreign key. Rationale: matches conventional ledger practice (one row, one effect), keeps `recalculateBalance` arithmetically simple, and surfaces cash flow as proper transaction history. Edit/delete cascade is the only added complexity.

### 4.2 Schema delta

```sql
-- New enum values
ALTER TYPE transaction_type ADD VALUE 'cash_credit';
ALTER TYPE transaction_type ADD VALUE 'cash_debit';

-- New column
ALTER TABLE transactions
  ADD COLUMN linked_tx_id uuid
    REFERENCES transactions(id)
    ON DELETE CASCADE;

-- Lookup index for cascade & "show me my paired row"
CREATE INDEX transactions_linked_tx_id_idx
  ON transactions(linked_tx_id)
  WHERE linked_tx_id IS NOT NULL;

-- Invariants
ALTER TABLE transactions
  ADD CONSTRAINT cash_row_must_have_parent
    CHECK (
      (type IN ('cash_credit', 'cash_debit') AND linked_tx_id IS NOT NULL)
      OR
      (type NOT IN ('cash_credit', 'cash_debit') AND linked_tx_id IS NULL)
    );
```

Migration filename: `supabase/migrations/20260509100000_add_cash_linked_rows.sql` (matches the project's `YYYYMMDDHHMMSS` convention).

**Note on enum migration**: `ALTER TYPE … ADD VALUE` cannot run inside a transaction in Postgres < 12, and Supabase's migration runner wraps each file in a transaction. The new enum values must therefore live in their own migration file, applied before any migration that references them. If `transaction_type` is not yet committed when this migration runs, the simpler path is to recreate the enum (drop dependent columns, recreate type with full value set, re-add columns) — verify Supabase migration history for the project before choosing the path.

### 4.3 Pairing rules per parent type

| Parent `type`              | Funding source | Paired row created? | Paired row `type` | Paired `(asset, platform)`            | Paired `amount` (BigNumber) |
|---|---|---|---|---|---|
| `buy` (default)            | external       | No                  | —                 | —                                     | —                                |
| `buy` (platform_deduct)    | platform X     | Yes                 | `cash_debit`      | `(price_currency_asset, X)`           | `total_cost + fee` if `fee_currency = price_currency`, else `total_cost` |
| `sell`                     | (always)       | Yes                 | `cash_credit`     | `(price_currency_asset, parent's platform)` | `total_cost − fee` if `fee_currency = price_currency`, else `total_cost` |
| `transfer_in` / `transfer_out` | n/a       | No                  | —                 | —                                     | —                                |
| `dividend` / `interest`    | n/a (v1)       | No                  | —                 | —                                     | —                                |
| `fee` (standalone)         | n/a            | No                  | —                 | —                                     | —                                |

`cash_effect` is **not** stored as a column. The presence or absence of the linked child row, plus its `platform_id`, encodes both the mode (external vs platform_deduct) and the funding platform.

### 4.4 Cash row field values

When a child row is created, all fields are derived from the parent:

| Field              | Value                                                                                         |
|---|---|
| `asset_id`         | `resolveFiatAsset(parent.price_currency)` — looks up the seeded USD/TRY/EUR row.              |
| `platform_id`      | For sell: parent's `platform_id`. For buy: user-selected funding platform.                    |
| `type`             | `cash_credit` (sell) or `cash_debit` (buy).                                                   |
| `date`             | Same as parent.                                                                               |
| `amount`           | Per pairing-rules table above. BigNumber arithmetic, stored as numeric string.                |
| `unit_price`       | `1` (cash unit-priced in its own currency).                                                   |
| `price_currency`   | Same as parent's `price_currency`.                                                            |
| `total_cost`       | Equal to `amount`.                                                                            |
| `fee` / `fee_currency` | `0` / `null`. Fee economics live on the parent.                                           |
| `linked_tx_id`     | Parent's `id`.                                                                                |
| `notes`            | `null`.                                                                                       |

## 5. Behavior specification

### 5.1 `recalculateBalance` change (`src/lib/balance.ts`)

The set extension is the only logic change:

```ts
const addTypes      = new Set(["buy", "transfer_in", "dividend", "interest", "cash_credit"])
const subtractTypes = new Set(["sell", "transfer_out", "fee", "cash_debit"])
```

The `(asset_id, platform_id)` filter is unchanged. Cash rows are just rows that happen to sit on a fiat asset. No UNION, no OR clause.

### 5.2 Create flow (`useTransactions.addTransaction`)

Pseudocode:

```ts
async function addTransaction(payload, options?: { fundingPlatformId?: string }) {
  const parent = await createTransaction(payload)

  const shouldCreateChild =
    parent.type === "sell" ||
    (parent.type === "buy" && options?.fundingPlatformId)

  if (shouldCreateChild) {
    const cashAssetId = await resolveFiatAsset(parent.price_currency)
    const cashPlatformId =
      parent.type === "sell" ? parent.platform_id : options.fundingPlatformId!
    const cashType =
      parent.type === "sell" ? "cash_credit" : "cash_debit"

    const sameCurrencyFee =
      parent.fee_currency == null || parent.fee_currency === parent.price_currency
    const feeBn = sameCurrencyFee ? bn(parent.fee ?? 0) : BN_ZERO
    const cashAmount =
      cashType === "cash_credit"
        ? bn(parent.total_cost).minus(feeBn)
        : bn(parent.total_cost).plus(feeBn)

    await createTransaction({
      asset_id: cashAssetId,
      platform_id: cashPlatformId,
      type: cashType,
      date: parent.date,
      amount: cashAmount.toFixed(),
      unit_price: "1",
      price_currency: parent.price_currency,
      total_cost: cashAmount.toFixed(),
      fee: 0,
      fee_currency: null,
      linked_tx_id: parent.id,
      notes: null,
    })

    await recalculateBalance(userId, cashAssetId, cashPlatformId)
  }

  await recalculateBalance(userId, parent.asset_id, parent.platform_id)
}
```

### 5.3 Edit flow (`useTransactions.editTransaction`)

When editing a parent (sell or platform-funded buy):

1. **Fetch existing child** if any: `SELECT * FROM transactions WHERE linked_tx_id = parent.id LIMIT 1`.
2. **Determine post-edit child requirement**:
   - For sells: child always required, on parent's platform, in parent's `price_currency`.
   - For buys: child required iff post-edit `fundingPlatformId` is set.
3. **Reconcile**:
   | Existing child | Post-edit needs child | Action                                                                 |
   |---|---|---|
   | No             | No                    | Nothing.                                                               |
   | No             | Yes                   | Create new child (same flow as 5.2).                                   |
   | Yes            | No                    | Delete child (Postgres FK cascade not used here — explicit delete).    |
   | Yes            | Yes                   | Update child fields in place: `asset_id`, `platform_id`, `date`, `amount`. No delete/recreate. |
4. **Recalc balances** for all touched lenses:
   - Old parent `(asset, platform)` if either changed.
   - New parent `(asset, platform)`.
   - Old child `(asset, platform)` if a child existed pre-edit.
   - New child `(asset, platform)` if a child exists post-edit.

The set of unique `(asset, platform)` pairs is computed once and `recalculateBalance` is called for each.

### 5.4 Delete flow (`useTransactions.removeTransaction`)

1. Capture the parent's child lens (if any) **before** deletion: `SELECT asset_id, platform_id FROM transactions WHERE linked_tx_id = parent.id`.
2. Delete the parent. Postgres `ON DELETE CASCADE` removes the child automatically.
3. Call `recalculateBalance` for parent's `(asset, platform)` and child's `(asset, platform)` (if any).

Direct deletion of a child row is not exposed in the UI. At the SQL level it would leave the parent intact and desync `recalculateBalance` for the cash asset. This is acceptable v1 risk because no UI path reaches it.

### 5.5 Validation — insufficient cash on buy

Form-level pre-submit check, runs only when `fundingPlatformId` is set:

```ts
const fiatAssetId = resolveFiatAsset(priceCurrency)
const cashOnFunding = getHolding(fiatAssetId, fundingPlatformId)?.balance ?? "0"
const required =
  feeCurrency === priceCurrency
    ? bn(totalCost).plus(bn(fee || 0))
    : bn(totalCost)

if (bn(cashOnFunding).lt(required)) {
  return {
    error: `Insufficient ${priceCurrency} on ${fundingPlatformName} ` +
           `(${cashOnFunding} available, ${required.toFixed()} needed)`
  }
}
```

**Edit-mode offset**: when editing an existing platform-funded buy, the existing child's debit is already reflected in `cashOnFunding`. To avoid false-positive rejection of the very row being edited, **add back** the existing child's `amount` to `cashOnFunding` before comparing — but only when the existing child's `(asset_id, platform_id)` matches the **post-edit** funding lens. Cases:

- Existing child on (USD, Bank), post-edit funding (USD, Bank): offset applies; available = `cashOnFunding + existingChild.amount`.
- Existing child on (USD, Bank), post-edit funding (USD, Midas): no offset on Midas. The old Bank debit will be reversed by the edit, freeing Bank cash, but that's irrelevant to the Midas check.
- Existing child on (USD, Bank), post-edit funding none (external): no validation runs.
- No existing child, post-edit funding any: standard check, no offset.

Mirrors the existing `isOverBalance` skip-on-edit pattern in `AddTransactionModal`.

## 6. UI spec

### 6.1 `AddTransactionModal` (`src/components/transactions/AddTransactionModal.tsx`)

**New form field — "Funding source"** (visible only when `type === "buy"`):

```
Funding source: [External cash ▾]
                  External cash (no deduction)            ← default
                  Bank — $5,000.00 USD available
                  Midas — $2,000.00 USD available
                  Garanti — $0.00 USD available           ← disabled (insufficient)
```

- Dropdown lists every platform that has a `holdings` row for the buy's `price_currency` fiat asset, ordered by balance descending.
- Always include the trading platform even at zero balance (for the simple intra-platform case).
- Always include "External cash" as the first option.
- Platforms with `balance < required` are listed but disabled.
- State variable: `fundingPlatformId: string | null` (null = external).
- Default for new buys: external (`null`).
- For edits: pre-populate from existing child's `platform_id` if a child exists; null otherwise.

**Sell** has no funding selector (cash always lands on the trading platform). A read-only confirmation line shows below the fee field:

```
Sale proceeds: $998.50 → credited to Midas USD
```

**Inline validation error** (Q3 reject) appears below the funding dropdown when insufficient.

### 6.2 Transaction list (`src/components/transactions/TransactionRow.tsx` & list query)

Default rendering: **collapse linked pairs into the parent row.** The list query in `fetchTransactions` filters out child rows from the main list:

```sql
WHERE user_id = ? AND linked_tx_id IS NULL
```

The child is fetched alongside the parent via the existing select expansion or a join, then rendered as a subtitle:

```
🟢 Sold 4 AAPL @ $250 · Midas
   +$998.50 USD credited to Midas (auto)
─────────────────────────────────────────
🔴 Bought 4 AAPL @ $250 · Midas
   −$1,001.50 USD from Bank (incl. $1.50 fee)
─────────────────────────────────────────
🔴 Bought 4 AAPL @ $250 · Midas
   external cash · no platform deduction
```

### 6.3 Settings → Platforms page

Cash holdings (USD/TRY/EUR rows in `holdings`) will now have non-trivial balances. The existing platform-detail view should already render them; verify visually that USD/TRY/EUR lines appear alongside non-fiat holdings without layout breakage.

### 6.4 Asset detail view (fiat assets)

When viewing a fiat asset (e.g., USD), all rows on that asset — including `cash_credit` / `cash_debit` — show in the asset's transaction list. This is the user's audit trail: "where did my Midas USD come from?" Linked rows here are NOT folded; they appear as standalone entries with a small "from sell of AAPL" link to the parent.

(Implementation detail: in fiat-asset-detail mode, the list query does NOT filter out `linked_tx_id IS NOT NULL` rows.)

### 6.5 Dashboard / total value

The total-portfolio-value calculation already includes cash assets at `price = 1` (USD) or via FX rate (TRY/EUR). After this feature lands, those values become non-zero for active users. **Expect a one-time visual jump** on the dashboard total line corresponding to accumulated cash that was previously implicit. No code change required, but document in the release notes.

## 7. P&L preservation

`src/lib/pnl/fifo.ts` operates on a `switch` over `tx.type`. The new `cash_credit` and `cash_debit` cases are **not added** to the switch — they fall through to the implicit no-op, meaning cash rows do not push lots into FIFO and do not consume them.

Rationale: cash assets are media of exchange, not tradeable positions in this app. Adding them to FIFO would create meaningless lots on USD/TRY/EUR. Realized P&L stays computed exclusively from buy/sell on non-fiat assets, with fees already capitalized into cost basis (buy) or netted from proceeds (sell).

The cash ledger (`holdings.balance` for fiat) and the P&L ledger (`fifo.ts`) are intentionally independent. They both correctly reflect a single fee event:
- Buy with $1.50 fee → cost basis +$1.50 (P&L impact when sold), cash −$1001.50 (immediate cash impact).
- Sell with $1.50 fee → net proceeds −$1.50 (realized P&L impact), cash +$998.50 (cash credit).

No double-counting because the two ledgers measure different quantities.

## 8. Edge-case behavior (decided)

| Scenario | Decision |
|---|---|
| Edit a sell's `price_currency` from USD to TRY | Child's `asset_id` flips from USD to TRY. Recalc both old USD and new TRY. |
| Edit a buy from external → platform_deduct | Create new child + recalc cash side. |
| Edit a buy from platform_deduct → external | Delete child + recalc old cash side. |
| Edit a buy's funding platform (Bank → Midas) | Update child's `platform_id`. Recalc both Bank and Midas USD. |
| Delete a sell with linked credit | DB FK cascades; explicit recalc on both lenses. |
| Concurrent edit across two browser tabs | Last write wins; not addressed (single-user app). |
| Inline fee in different currency than price | Stays informational only — cash row carries `total_cost` unmodified. No second cash row in the fee currency. |
| Sell with `total_cost = 0` and no fee | Child row is created with `amount = 0`. Cash holding unchanged. Acceptable. |
| Buy on Platform A, fund from Platform A | Allowed. Child sits on the same platform as parent; no special case. |
| Funding platform has exactly the required cash | Allowed (uses `lt`, not `lte`, in the rejection check). |
| User holds a stablecoin (USDT/USDC) and the trade settles in it | Out of scope. User records as today: `price_currency='USD'` plus a manual transfer of USDT. |

## 9. Files affected

**Schema:**
- `supabase/migrations/20260509XXXXXX_add_cash_linked_rows.sql` (new)

**Types:**
- `src/types/database.ts` — extend `TransactionType` union and `Transaction` interface with `linked_tx_id`.

**Library:**
- `src/lib/balance.ts` — extend `addTypes`/`subtractTypes` sets.
- `src/lib/queries/transactions.ts` —
  - Extend `TransactionFilters` with `includeLinkedChildren?: boolean` (default `false` for the main list, `true` when listing transactions for a fiat asset detail view).
  - `fetchTransactions` filters `linked_tx_id IS NULL` unless `includeLinkedChildren` is true.
  - Add `fetchLinkedChildrenForParents(parentIds: string[]): Promise<Map<string, Transaction>>` — batch fetch for list rendering.
  - Add `fetchLinkedChild(parentId: string): Promise<Transaction | null>` — single-fetch for edit flow.
  - `createTransaction` / `updateTransaction` / `deleteTransaction` carry `linked_tx_id` through unchanged.
- `src/lib/cash.ts` (new) — `resolveFiatAsset(currency, userId)`, `computeCashAmount(parent)`, validation helpers.

**Hooks:**
- `src/hooks/useTransactions.ts` — orchestrate parent + child create/edit/delete; multi-lens recalc.
- `src/hooks/useHoldings.ts` — already exposes `getHoldingsForAsset`; verify usable from the form for funding-source dropdown.

**Components:**
- `src/components/transactions/AddTransactionModal.tsx` — funding-source dropdown; sale-proceeds confirmation line; updated validation; edit-mode hydration of `fundingPlatformId`.
- `src/components/transactions/TransactionRow.tsx` — cash subtitle line for parents with linked children.
- (Optional) `src/components/transactions/FundingSourceSelect.tsx` (new) — extracted dropdown component.

**Contexts:**
- `src/contexts/TransactionDataContext.tsx` — `refresh()` already triggers full re-fetch; verify it picks up the new child rows.

## 10. Migration & rollout

- Schema migration is additive (new enum values, nullable column with FK, additive CHECK). No backfill of existing rows.
- After deploy, the user's existing 21+ transactions retain `linked_tx_id = NULL` and behave exactly as before.
- New buys and sells start using the new flow. The user can choose to recreate any past transaction if they want it cash-effecting; no automated migration is provided.
- Document in release notes:
  - "Total portfolio value may step up by the amount of cash now correctly tracked on platforms."
  - "Past sells/buys are unchanged; only new transactions use the cash linkage."

## 11. Testing notes

This project has no automated test infrastructure. Verification is manual:

1. Create a sell on Midas → confirm a `cash_credit` row appears in the DB and Midas USD holding increases by `total_cost − fee`.
2. Create a buy on Midas with funding = Bank → confirm a `cash_debit` row on Bank, Bank USD decreases, Midas AAPL increases, no Midas USD change.
3. Create a buy on Midas with funding = external → confirm no child row; parent behaves as today.
4. Try to create a buy with funding = Bank when Bank USD = $0 → form rejects with inline error.
5. Edit a sell's amount → child's `amount` updates; both holdings recalc.
6. Edit a sell to change `price_currency` → child's `asset_id` flips; old and new fiat holdings recalc.
7. Edit a buy from external → platform_deduct → new child appears.
8. Edit a buy from platform_deduct → external → child disappears.
9. Edit a buy's funding platform Bank → Midas → child moves; both recalc.
10. Delete a sell → child cascades; both holdings recalc.
11. Open Settings → Platforms → confirm USD/TRY/EUR lines render with correct balances.
12. Open the AAPL FIFO P&L view → confirm realized/unrealized numbers match pre-feature expectations (cash rows should not appear in FIFO consumption).
13. Open the dashboard → confirm total value reflects cash inclusion (one-time step-up acceptable).
14. Run the daily snapshot cron manually → verify `total_usd` reflects the new cash balances.

## 11.5. Implementation style notes

- **No hardcoded strings.** All magic strings introduced by this feature live in constants modules and are imported where used. Specifically:
  - Transaction type literals (`cash_credit`, `cash_debit`, plus existing `buy`/`sell`/etc.) — reuse or create a `TRANSACTION_TYPES` constants module under `src/lib/constants/` (or wherever the project already holds enum-like maps). The new types must be added there before being referenced in `balance.ts`, `fifo.ts`, queries, hooks, and components.
  - Currency codes (`USD`, `TRY`, `EUR`) — reuse the existing source if there is one (verify; the form currently inlines them in `AddTransactionModal.tsx`). If not present, introduce `SUPPORTED_FIAT_CURRENCIES` and use it for both the form's currency `Select` options and the `resolveFiatAsset` switch.
  - Form labels and the funding-source dropdown's "External cash" label — feature-scoped string constants in or near the modal.
  - Error message templates (insufficient cash, etc.) — same module.
- During implementation, opportunistically extract any pre-existing inline strings encountered in touched files (e.g., URLs to Yahoo Finance / TCMB if a touched file references them, hardcoded type literals in switches we're modifying). Do not chase strings in untouched files.

## 12. Out of scope (v2 candidates)

- Dividend / interest auto-credit cash rows (tabled at user's request).
- Forex conversion modeled as a `sell` of one fiat for another, generating a `cash_credit` in the destination currency.
- "Settle currency" override for crypto-exchange trades that settle in a stablecoin different from `price_currency`.
- Direct edit of cash row's `amount` (decoupling from parent's `total_cost − fee`).
- Backfill / migration tool for historical sells.
- Negative-cash "warn and continue" mode.
