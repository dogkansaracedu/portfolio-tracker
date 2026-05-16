# Fiat-as-System-Currency + Transfer Cost UX — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make zero-cost `transfer_in` structurally impossible, formalize USD/TRY/EUR as system-managed currencies via an `is_currency` flag, add an explicit `denomination` column to all assets, move USDT/USDC out of the fiat short-circuit so they behave like any other crypto, and pre-fill `unit_price` from `price_cache` to keep entry friction low.

**Architecture:** Single Postgres migration adds two columns + CHECK constraints + a data backfill + an updated seed function. The P&L code's fiat short-circuit moves from `category === "fiat"` to `asset.is_currency`. The transaction modal grows three concerns: auto-fill cost on transfers (read-only for currencies, FIFO-derived for paired non-currency), require explicit cost on lone non-currency `transfer_in`, and pre-fill `unit_price` from `price_cache` on asset change.

**Tech Stack:** React 19 + Vite + TypeScript, Tailwind + shadcn, Supabase (Postgres 17), BigNumber.js, Recharts. No test suite in this project — verification is via `npm run typecheck`, `npm run lint`, and manual smoke-testing in the dev server.

**Spec:** `docs/superpowers/specs/2026-05-15-fiat-and-transfer-cost-design.md`

**Verification commands you'll use repeatedly:**
- `npm run typecheck` — TypeScript check across the project
- `npm run lint` — ESLint
- `npm run dev` — start the dev server for manual UI checks
- Supabase MCP `mcp__plugin_supabase_supabase__execute_sql` with `project_id="hhqwxygrtqcugaxamrtu"` — for DB verification queries

---

## File Structure

**Created:**
- `supabase/migrations/20260516120000_fiat_system_currency_and_transfer_cost.sql` — schema additions, CHECK constraints, data backfill, and updated `seed_user_data` function body.

**Modified:**
- `src/types/database.ts` — add `is_currency` and `denomination` fields to `Asset` interface.
- `src/hooks/usePnL.ts` — replace `category === "fiat"` short-circuit with `asset.is_currency`.
- `src/components/transactions/AddTransactionModal.tsx` — transfer auto-fill, lone-transfer cost input, and `unit_price` prefill.
- `src/components/assets/AssetForm.tsx` — add `denomination` dropdown.
- `src/components/assets/AssetRow.tsx` — hide edit/deactivate dropdown when `asset.is_currency`.

**Deleted:**
- `docs/pnl-divergence-handoff.md` — resolved.

---

## Task 1: Migration — schema, CHECKs, backfill, seed function update

**Files:**
- Create: `supabase/migrations/20260516120000_fiat_system_currency_and_transfer_cost.sql`

This single migration does everything DB-side:
1. Adds `is_currency` and `denomination` columns to `assets` (with CHECK constraints).
2. Adds `transfer_in_has_cost` CHECK on `transactions`.
3. Backfills existing rows: USD/TRY/EUR get `is_currency=true`; USDT/USDC move to `category='crypto'`.
4. CREATE OR REPLACE the seed function with the new column values and stablecoins-as-crypto.

- [ ] **Step 1: Create the migration file with full contents**

Create `supabase/migrations/20260516120000_fiat_system_currency_and_transfer_cost.sql` with this exact content:

```sql
-- Fiat-as-System-Currency + Transfer Cost UX
--
-- 1. Adds `is_currency` and `denomination` to assets.
-- 2. Adds CHECK preventing zero-cost transfer_in (closes the Mar 3 bug class).
-- 3. Backfills: USD/TRY/EUR become system currencies; USDT/USDC become crypto.
-- 4. Updates seed_user_data to set the new fields and emit USDT/USDC as crypto.

-- ─── 1. Schema additions ────────────────────────────────────────────

ALTER TABLE public.assets
  ADD COLUMN IF NOT EXISTS is_currency boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS denomination text NOT NULL DEFAULT 'USD';

ALTER TABLE public.assets
  ADD CONSTRAINT denomination_supported
    CHECK (denomination IN ('USD','TRY','EUR')),
  ADD CONSTRAINT currency_self_denominated
    CHECK (NOT is_currency OR denomination = ticker);

ALTER TABLE public.transactions
  ADD CONSTRAINT transfer_in_has_cost
    CHECK (type <> 'transfer_in' OR total_cost > 0);

-- ─── 2. Backfill existing data ──────────────────────────────────────

-- System currencies: USD, TRY, EUR (across all users).
UPDATE public.assets
SET is_currency = true,
    denomination = ticker
WHERE ticker IN ('USD', 'TRY', 'EUR');

-- Stablecoins: move out of fiat into crypto so they go through real FIFO.
-- denomination stays 'USD' (the default).
UPDATE public.assets
SET category = 'crypto'
WHERE ticker IN ('tether', 'usd-coin');

-- ─── 3. Updated seed function ───────────────────────────────────────
-- Mirrors the existing function but emits is_currency / denomination
-- correctly for new users.

CREATE OR REPLACE FUNCTION public.seed_user_data(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- ─── Platforms ────────────────────────────────────────────────────
  INSERT INTO public.platforms (user_id, name, color) VALUES
    (p_user_id, 'IBKR',          '#3b82f6'),
    (p_user_id, 'Midas',         '#8b5cf6'),
    (p_user_id, 'Midas Kripto',  '#f97316'),
    (p_user_id, 'Paribu',        '#06b6d4'),
    (p_user_id, 'OKX',           '#22c55e'),
    (p_user_id, 'Binance',       '#eab308'),
    (p_user_id, 'Enpara',        '#10b981'),
    (p_user_id, 'Fiziksel',      '#64748b');

  -- ─── Global Assets ───────────────────────────────────────────────

  -- System currencies (is_currency=true, self-denominated).
  INSERT INTO public.assets (user_id, category, ticker, name, tags, price_source, is_currency, denomination) VALUES
    (p_user_id, 'fiat', 'TRY', 'Türk Lirası', ARRAY['try'], 'tcmb', true, 'TRY'),
    (p_user_id, 'fiat', 'USD', 'US Dollar',    ARRAY['usd'], 'tcmb', true, 'USD'),
    (p_user_id, 'fiat', 'EUR', 'Euro',         ARRAY['eur'], 'tcmb', true, 'EUR');

  -- Stablecoins as crypto, denominated in USD.
  INSERT INTO public.assets (user_id, category, ticker, name, tags, price_source, is_currency, denomination) VALUES
    (p_user_id, 'crypto', 'tether',   'Tether (USDT)', ARRAY['crypto','usd'], 'coingecko', false, 'USD'),
    (p_user_id, 'crypto', 'usd-coin', 'USD Coin',      ARRAY['crypto','usd'], 'coingecko', false, 'USD');

  -- Major crypto.
  INSERT INTO public.assets (user_id, category, ticker, name, tags, price_source, is_currency, denomination) VALUES
    (p_user_id, 'crypto', 'bitcoin',  'Bitcoin',  ARRAY[]::text[], 'coingecko', false, 'USD'),
    (p_user_id, 'crypto', 'ethereum', 'Ethereum', ARRAY[]::text[], 'coingecko', false, 'USD');

  -- Gold (tokenized).
  INSERT INTO public.assets (user_id, category, ticker, name, tags, price_source, is_currency, denomination) VALUES
    (p_user_id, 'gold', 'pax-gold',    'Pax Gold (PAXG)',    ARRAY['crypto'], 'coingecko', false, 'USD'),
    (p_user_id, 'gold', 'tether-gold', 'Tether Gold (XAUT)', ARRAY['crypto'], 'coingecko', false, 'USD');

  -- Gold (physical).
  INSERT INTO public.assets (user_id, category, ticker, name, tags, price_source, is_currency, denomination) VALUES
    (p_user_id, 'gold', 'XAU_GRAM', 'Physical Gold', ARRAY['commodity'], 'tcmb', false, 'USD');

  -- US Stocks.
  INSERT INTO public.assets (user_id, category, ticker, name, tags, price_source, is_currency, denomination) VALUES
    (p_user_id, 'stock_us', 'AAPL',  'Apple',                ARRAY[]::text[], 'yahoo', false, 'USD'),
    (p_user_id, 'stock_us', 'QQQ',   'Invesco QQQ',          ARRAY[]::text[], 'yahoo', false, 'USD'),
    (p_user_id, 'stock_us', 'BRK-B', 'Berkshire Hathaway B', ARRAY[]::text[], 'yahoo', false, 'USD');
END;
$$;
```

- [ ] **Step 2: Apply the migration via Supabase MCP**

Use `mcp__plugin_supabase_supabase__apply_migration` with:
- `project_id`: `hhqwxygrtqcugaxamrtu`
- `name`: `20260516120000_fiat_system_currency_and_transfer_cost`
- `query`: the entire SQL block from Step 1

Expected: migration applies cleanly, no errors.

- [ ] **Step 3: Verify schema and backfill**

Run via `mcp__plugin_supabase_supabase__execute_sql`:

```sql
SELECT ticker, category, is_currency, denomination
FROM public.assets
ORDER BY is_currency DESC, category, ticker;
```

Expected output (for the existing single user):
- `EUR`, `USD`, `TRY` → `category='fiat'`, `is_currency=true`, `denomination=ticker`
- `tether`, `usd-coin` → `category='crypto'`, `is_currency=false`, `denomination='USD'`
- All other rows → `is_currency=false`, `denomination='USD'`

Also verify the transactions CHECK is in place:

```sql
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conname IN ('denomination_supported','currency_self_denominated','transfer_in_has_cost');
```

Expected: all three rows present.

- [ ] **Step 4: Smoke-test the new CHECK**

Run:

```sql
-- Should fail with the transfer_in_has_cost CHECK error.
INSERT INTO public.transactions (
  user_id, asset_id, platform_id, type, date, amount,
  unit_price, total_cost, price_currency, fee, fee_currency,
  related_asset_id, linked_tx_id, notes
)
SELECT
  (SELECT user_id FROM public.assets WHERE ticker='USD' LIMIT 1),
  (SELECT id FROM public.assets WHERE ticker='USD' LIMIT 1),
  (SELECT id FROM public.platforms WHERE name='Midas' LIMIT 1),
  'transfer_in', now(), 1, 0, 0, 'USD', 0, NULL, NULL, NULL,
  'CHECK probe — should fail';
```

Expected: error message mentions `transfer_in_has_cost`. The INSERT does not persist.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260516120000_fiat_system_currency_and_transfer_cost.sql
git commit -m "$(cat <<'EOF'
feat(schema): is_currency + denomination + transfer_in cost CHECK

Adds is_currency boolean and denomination text (USD/TRY/EUR) to assets,
plus a transfer_in_has_cost CHECK on transactions that prevents the Mar 3
bug class (zero-cost transfer_in). Backfills USD/TRY/EUR as system
currencies and moves USDT/USDC into category=crypto so they go through
real FIFO. Updates seed_user_data to emit the new column values.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Type updates — `Asset` interface

**Files:**
- Modify: `src/types/database.ts:23-35`

- [ ] **Step 1: Add the two new fields to the Asset interface**

Edit `src/types/database.ts`. Find the `Asset` interface (around line 23) and update it to include the two new fields. The result should look like:

```ts
/** Global asset — one row per ticker per user. No platform association. */
export interface Asset {
  id: string;
  user_id: string;
  category: string;
  ticker: string;
  name: string;
  tags: string[];
  price_source: string;
  is_currency: boolean;
  denomination: "USD" | "TRY" | "EUR";
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`

Expected: clean OR a small number of errors at sites that destructure `Asset` and expect literal field counts. If any errors appear, they should be resolved by later tasks (usePnL, AssetForm, AssetRow). If errors appear in unrelated files, fix the missing field reads inline by reading `is_currency` and `denomination` as needed.

- [ ] **Step 3: Commit**

```bash
git add src/types/database.ts
git commit -m "$(cat <<'EOF'
types(asset): add is_currency boolean and denomination literal

Companion to the schema migration. Asset rows now declare whether
they're a system currency and which currency their price is quoted in.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: P&L hook — fiat short-circuit follows `is_currency`

**Files:**
- Modify: `src/hooks/usePnL.ts:101-125`

Today the fiat short-circuit triggers on `category === "fiat"`. After the migration, that includes USD/TRY/EUR (correct) and USDT/USDC (no longer correct — we want full FIFO). Switch the condition to `is_currency`.

- [ ] **Step 1: Change the short-circuit condition**

In `src/hooks/usePnL.ts`, locate the loop body around line 100. Replace this block:

```ts
    for (const h of holdings) {
      const ticker = h.assets.ticker
      const category = h.assets.category
      const platformName = h.platforms.name
      const livePrice = prices[ticker]?.price_usd ?? 0
      const key = `${h.asset_id}|${h.platform_id}`
      const snapshotKey = `${ticker}|${platformName}`
      const snapshotPriceUsd =
        snapshotPriceByTickerPlatform.get(snapshotKey) ?? livePrice
      const liveBalanceBn = bn(h.balance)

      if (category === "fiat") {
```

with this block (only the last `if` line changes — keep the rest verbatim):

```ts
    for (const h of holdings) {
      const ticker = h.assets.ticker
      const category = h.assets.category
      const platformName = h.platforms.name
      const livePrice = prices[ticker]?.price_usd ?? 0
      const key = `${h.asset_id}|${h.platform_id}`
      const snapshotKey = `${ticker}|${platformName}`
      const snapshotPriceUsd =
        snapshotPriceByTickerPlatform.get(snapshotKey) ?? livePrice
      const liveBalanceBn = bn(h.balance)

      if (h.assets.is_currency) {
```

Also remove the now-unused `category` local if ESLint complains (it isn't read elsewhere in the loop body — verify before deleting).

- [ ] **Step 2: Verify the holdings query exposes is_currency**

Check `src/lib/queries/holdings.ts`. If the `select(...)` on the assets join restricts columns (it does — `"*, assets(name, ticker, category, tags), platforms(name, color)"`), expand it to include the new fields. The selector should read:

```ts
.select("*, assets(name, ticker, category, tags, is_currency, denomination), platforms(name, color)")
```

Apply this to both the `fetchHoldings` and `fetchHoldingsForAsset` queries (lines 14 and 28). Also update the local type `assets:` shape at the top of the file to include the two new fields, matching the `Asset` interface.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`

Expected: clean.

- [ ] **Step 4: Quick manual check via dev server**

Run `npm run dev`, open the Portfolio page. Confirm:
- USD on Midas still shows zero P&L (system currency, short-circuit applies via `is_currency`).
- USDT/USDC (if present) start showing small unrealized P&L from CoinGecko price drift — that's expected and correct.
- Dashboard hero P&L still matches Portfolio P&L within $1.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/usePnL.ts src/lib/queries/holdings.ts
git commit -m "$(cat <<'EOF'
feat(pnl): fiat short-circuit now gates on is_currency

Only the 3 system rows (USD/TRY/EUR) skip FIFO. USDT/USDC go through
real cost-basis tracking like any other crypto, so a depeg surfaces as
unrealized loss instead of being silently hidden.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Modal — transfer cost auto-fill for currency assets

**Files:**
- Modify: `src/components/transactions/AddTransactionModal.tsx`

For `transfer_in`/`transfer_out` of an asset where `selectedAsset.is_currency === true`, auto-fill `unit_price=1`, `total_cost=amount`, `price_currency=denomination`. Show a read-only "Cost basis" display line so the user sees what's being recorded.

- [ ] **Step 1: Add a derived flag near the existing derivations**

Around line 206 of `AddTransactionModal.tsx`, in the block where `showPriceFields`, `showFeeFields`, `isTransfer` are computed, add one more derivation:

```ts
const isTransferEither = type === "transfer_out" || type === "transfer_in"
const isCurrencyAsset = !!selectedAsset?.is_currency
```

Note: `isTransfer` (existing) is only `transfer_out`. We need both directions for cost auto-fill, so introduce `isTransferEither` rather than mutating `isTransfer` (which controls the destination-platform UI).

- [ ] **Step 2: Add a useEffect that drives auto-fill for currency transfers**

Insert below the existing `useEffect` blocks (after line 204):

```ts
// Currency transfer auto-fill: when transferring a system currency
// (USD/TRY/EUR), cost basis is trivially `amount` of its own denomination.
// We write directly into the form state so the eventual payload picks up
// the values; the corresponding UI shows them as read-only below.
useEffect(() => {
  if (!isTransferEither || !isCurrencyAsset || !selectedAsset) return
  setUnitPrice("1")
  setPriceCurrency(selectedAsset.denomination)
}, [isTransferEither, isCurrencyAsset, selectedAsset])
```

- [ ] **Step 3: Render a read-only "Cost basis" line for currency transfers**

Find the existing "Total Cost display" block (around line 486):

```tsx
{/* Total Cost display */}
{showPriceFields && totalCost.gt(0) && (
  <div className="rounded-md bg-muted px-3 py-2 text-sm">
    Total: ...
  </div>
)}
```

Add a new conditional block immediately after it:

```tsx
{/* Currency transfer auto-cost display (read-only) */}
{isTransferEither && isCurrencyAsset && selectedAsset && parsedAmount.gt(0) && (
  <div className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
    Cost basis: {CURRENCY_SYMBOLS[selectedAsset.denomination] ?? ""}
    {parsedAmount.toNumber().toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}{" "}
    (auto)
  </div>
)}
```

- [ ] **Step 4: Allow submit for currency transfers without showing price fields**

The existing `canSubmit` condition includes `(showPriceFields ? parsedPrice.gt(0) : true)`. For a currency transfer, `showPriceFields` is false (transfers aren't in the list), but `parsedPrice` will be `1` from the effect — so this passes naturally. No change needed here, but verify by reading the `canSubmit` block (around line 226).

Also verify the `payload` construction (around line 241): for a currency transfer, `totalCost = parsedAmount × parsedPrice = amount × 1 = amount`. ✓ correct.

- [ ] **Step 5: Manual test in the dev server**

`npm run dev`. Open the Add Transaction modal, pick `Asset = USD`, `Type = Transfer In`, enter `Amount = 500`. Verify:
- The "Cost basis: $500.00 (auto)" line appears.
- Submit succeeds.
- DB row has `total_cost=500`, `unit_price=1`, `price_currency='USD'`.

Verify via SQL:

```sql
SELECT type, amount, unit_price, total_cost, price_currency
FROM public.transactions
ORDER BY created_at DESC
LIMIT 1;
```

Delete the test row afterward:

```sql
DELETE FROM public.transactions
WHERE notes IS NULL
  AND total_cost = 500
  AND type = 'transfer_in'
  AND created_at > now() - interval '5 minutes';
```

- [ ] **Step 6: Commit**

```bash
git add src/components/transactions/AddTransactionModal.tsx
git commit -m "$(cat <<'EOF'
feat(modal): auto-fill cost on currency transfers

Transfers of a system currency (USD/TRY/EUR) now auto-fill unit_price=1,
total_cost=amount, price_currency=self. Shown read-only as 'Cost basis:
$X.XX (auto)'. Prevents the Mar 3 zero-cost bug class from the UI side
in addition to the DB CHECK.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Modal — paired non-currency transfer cost via FIFO

**Files:**
- Modify: `src/components/transactions/AddTransactionModal.tsx`

When the user picks `transfer_out` of a non-currency asset (e.g. AAPL, BTC), the auto-paired destination `transfer_in` needs the correct cost basis. Use `computeTransferCostBasis` from `src/lib/pnl/fifo.ts` to compute the weighted-average cost of the lots that would be consumed from the source platform's FIFO state.

- [ ] **Step 1: Import the helper**

At the top of `AddTransactionModal.tsx`, alongside existing imports, add:

```ts
import { computeTransferCostBasis } from "@/lib/pnl/fifo"
```

- [ ] **Step 2: Pull the source-platform transactions for FIFO**

The modal already consumes `useTransactionData()` via the funding-source effect indirectly — but the modal itself doesn't have `transactions` in scope. Add a read alongside the other hook calls near the top of the component body (around line 68):

```ts
import { useTransactionData } from "@/contexts/TransactionDataContext"
// ... later, inside the component:
const { transactions, rates } = useTransactionData()
```

(If `useTransactionData` is already in scope via an existing import in the modal, skip re-importing.)

- [ ] **Step 3: Add an effect that computes FIFO cost for paired non-currency transfers**

Below the currency-transfer effect from Task 4, add:

```ts
// Paired non-currency transfer: compute FIFO weighted-average cost from
// the source platform's prior lots and apply it to both the transfer_out
// and the auto-created transfer_in.
useEffect(() => {
  if (
    type !== "transfer_out" ||
    !selectedAsset ||
    selectedAsset.is_currency ||
    !platformId ||
    !parsedAmount.gt(0)
  ) {
    return
  }
  const sourceTxs = transactions.filter(
    (t) => t.asset_id === selectedAsset.id && t.platform_id === platformId,
  )
  const avgUsd = computeTransferCostBasis(
    sourceTxs,
    rates,
    parsedAmount.toNumber(),
  )
  if (avgUsd.gt(0)) {
    setUnitPrice(avgUsd.toString())
    setPriceCurrency(selectedAsset.denomination)
  }
}, [type, selectedAsset, platformId, parsedAmount, transactions, rates])
```

Note: `computeTransferCostBasis` returns the weighted-average in USD. If the asset's denomination is non-USD, this still writes USD into `unit_price` and `USD` into `price_currency` — which is fine because the downstream `applyTxToInvested` runs `normalizeToUsd` on the total. For now the auto-fill assumes destination-side reporting in the asset's denomination; the user can override.

- [ ] **Step 4: Render the same read-only "Cost basis" display for paired transfers**

Extend the conditional from Task 4 to cover this case. Replace the block from Task 4 Step 3 with:

```tsx
{/* Transfer auto-cost display (read-only) */}
{isTransferEither && parsedAmount.gt(0) && parsedPrice.gt(0) && selectedAsset && (isCurrencyAsset || type === "transfer_out") && (
  <div className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
    Cost basis: {CURRENCY_SYMBOLS[priceCurrency as FiatCurrency] ?? ""}
    {totalCost.toNumber().toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}{" "}
    (auto)
  </div>
)}
```

- [ ] **Step 5: Wire FIFO values into the auto-created destination transfer_in**

Find the auto-create-destination block (currently around line 271–290). It already copies `unit_price`, `total_cost`, `price_currency` from the source payload — so once the source has the right values (from Step 3), the destination inherits them. No change needed, but verify by reading the block and confirming the three fields are copied verbatim from `parsedPrice.toNumber()`, `totalCost.toNumber()`, `priceCurrency`.

- [ ] **Step 6: Manual test**

`npm run dev`. Add some FIFO history first: a couple of buys on AAPL/Midas if you don't already have remaining lots. Then open the modal:
- `Asset = AAPL`, `Type = Transfer Out`, `Source = Midas`, `Dest = IBKR`, `Amount = 1`.
- Confirm "Cost basis: $<weighted-avg> (auto)" appears.
- Submit. Verify both rows in DB:

```sql
SELECT type, amount, unit_price, total_cost, price_currency, platform_id
FROM public.transactions
WHERE asset_id = (SELECT id FROM public.assets WHERE ticker='AAPL' LIMIT 1)
ORDER BY created_at DESC
LIMIT 2;
```

Both rows should have matching `unit_price`/`total_cost`.

Clean up after testing if needed.

- [ ] **Step 7: Commit**

```bash
git add src/components/transactions/AddTransactionModal.tsx
git commit -m "$(cat <<'EOF'
feat(modal): FIFO-derived cost on paired non-currency transfers

Selecting transfer_out of a non-currency asset now computes the weighted-
average lot cost from the source platform's FIFO state and applies it to
both legs of the paired transfer. Surfaces the value read-only so the user
sees the cost-basis being carried.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Modal — lone `transfer_in` cost input for non-currency assets

**Files:**
- Modify: `src/components/transactions/AddTransactionModal.tsx`

A lone `transfer_in` (no paired `transfer_out`) is an opening-balance entry — the user is recording an asset they held before tracking started. For non-currency assets, the user must enter the cost basis explicitly; there's no way to derive it. The DB CHECK rejects zero, so the UI must collect a value.

- [ ] **Step 1: Show editable price fields when the form is a lone non-currency transfer_in**

The current `showPriceFields` constant (around line 206) is:

```ts
const showPriceFields = ["buy", "sell", "dividend", "interest"].includes(type)
```

Extend it to include the lone non-currency `transfer_in` case:

```ts
const showPriceFields =
  ["buy", "sell", "dividend", "interest"].includes(type) ||
  (type === "transfer_in" && !!selectedAsset && !selectedAsset.is_currency)
```

This shows the existing Unit Price + Currency fields automatically for that case. The values default to whatever's in state — the prefill in Task 7 will fill `unit_price` from `price_cache`, and the user can edit.

- [ ] **Step 2: Add a client-side validation message when total_cost would be zero**

In the existing `canSubmit` block (around line 226), the line `(showPriceFields ? parsedPrice.gt(0) : true)` already prevents submit when `unit_price <= 0` — which covers this case. No change needed.

For better UX, add a visible warning when the user has typed an amount but no price. Below the "Cost basis (auto)" display from Task 5 Step 4, add:

```tsx
{type === "transfer_in" && selectedAsset && !selectedAsset.is_currency && parsedAmount.gt(0) && !parsedPrice.gt(0) && (
  <p className="text-xs text-destructive">
    Opening-balance transfer_in requires an original cost (price per unit).
  </p>
)}
```

- [ ] **Step 3: Manual test**

`npm run dev`. Open the modal:
- `Asset = BTC` (or another non-currency asset), `Type = Transfer In`, `Amount = 0.5`, leave price empty.
- Confirm the warning appears and the Add button is disabled.
- Enter `Unit Price = 30000`. Confirm the button enables and submit succeeds.

```sql
SELECT type, amount, unit_price, total_cost, price_currency
FROM public.transactions
WHERE asset_id = (SELECT id FROM public.assets WHERE ticker='bitcoin' LIMIT 1)
ORDER BY created_at DESC
LIMIT 1;
```

Expected: `unit_price=30000`, `total_cost=15000`. Delete the test row afterward.

- [ ] **Step 4: Commit**

```bash
git add src/components/transactions/AddTransactionModal.tsx
git commit -m "$(cat <<'EOF'
feat(modal): require explicit cost on lone non-currency transfer_in

Opening-balance transfer_ins on stocks/crypto now expose unit_price &
currency fields and block submit until cost > 0, with an inline hint
explaining why. The DB CHECK is the floor; this is the user-friendly
top.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Modal — `unit_price` prefill from `price_cache`

**Files:**
- Modify: `src/components/transactions/AddTransactionModal.tsx`

When the user picks an asset for any tx type that exposes `unit_price` (buy, sell, dividend, interest, lone non-currency transfer_in), pre-fill the field from the latest cached price. For USDT/USDC this lands at ~1.00 so the user types nothing.

- [ ] **Step 1: Import `usePrices`**

At the top of `AddTransactionModal.tsx`, add:

```ts
import { usePrices } from "@/hooks/usePrices"
```

(`usePrices` re-exports `usePricesContext` from `@/contexts/PricesContext`. Both work; use whichever import path the rest of the file already uses if applicable.)

- [ ] **Step 2: Read prices and add a prefill effect**

Inside the component body, near the other hook calls:

```ts
const { prices } = usePrices()
```

Then add a new useEffect below the others (after the FIFO-transfer effect from Task 5):

```ts
// Prefill unit_price from the latest cached market price when the user
// picks an asset. Helps every tx type that exposes a price input:
// buy, sell, dividend, interest, and lone non-currency transfer_in.
// Skipped for currency assets (Task 4 already forces unit_price=1) and
// for transfer_out (Task 5 already populates from FIFO).
useEffect(() => {
  if (!selectedAsset) return
  if (selectedAsset.is_currency) return
  if (type === "transfer_out") return
  if (isEdit) return // never overwrite an existing tx's price
  const cached = prices[selectedAsset.ticker]?.price_usd
  if (cached && cached > 0) {
    setUnitPrice(String(cached))
    setPriceCurrency("USD")
  }
}, [selectedAsset, type, prices, isEdit])
```

Skipping when `isEdit` is critical — opening the modal to edit a past tx must not clobber the user's recorded price with today's market price.

- [ ] **Step 3: Verify the effect runs on asset change but doesn't ping-pong**

The effect depends on `selectedAsset`. When the asset changes, the price prefills; if the user then types a different price, `selectedAsset` doesn't change, so the effect doesn't re-fire. ✓

When the type changes (e.g. user flips from `buy` to `transfer_out`), the effect re-runs and the early return for `transfer_out` skips it — leaving whatever was there. The FIFO effect from Task 5 then takes over. ✓

- [ ] **Step 4: Manual test**

`npm run dev`. Open the modal:
- `Asset = tether (USDT)` (you may need to scroll/search), `Type = Buy`. Confirm `Unit Price` pre-fills to ~`1.00`. Switch `Type = Sell` — confirm price stays. Switch back to `Buy`, change `Asset` to BTC — confirm price changes to the current BTC price. Type a different value — confirm it stays. Switch `Type = Transfer Out` — confirm the FIFO value takes over.
- Switch `Type = Transfer In` on a currency asset — confirm `unit_price` is `1` (Task 4 effect runs even if cached price exists).

- [ ] **Step 5: Commit**

```bash
git add src/components/transactions/AddTransactionModal.tsx
git commit -m "$(cat <<'EOF'
feat(modal): prefill unit_price from cached market price

On asset change, the modal pre-fills unit_price from price_cache for
buy/sell/dividend/interest/lone-transfer_in. USDT/USDC land at ~1.00
automatically — no special-casing required. Edit mode is skipped to
preserve historical prices.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: AssetForm — `denomination` dropdown

**Files:**
- Modify: `src/components/assets/AssetForm.tsx`

Add a `denomination` select to the asset creation/edit form. Defaults to `USD`, with `TRY` and `EUR` as the other options.

- [ ] **Step 1: Extend the form state and submit payload**

In `AssetForm.tsx`, near the other `useState` declarations (lines 66-72), add:

```ts
const [denomination, setDenomination] = useState<"USD" | "TRY" | "EUR">("USD");
```

Update the hydrate effect (lines 76-85):

```ts
useEffect(() => {
  if (open) {
    setCategory(asset?.category ?? "fiat");
    setTicker(asset?.ticker ?? "");
    setDisplayName(asset?.name ?? "");
    setTagsInput(asset?.tags?.join(", ") ?? "");
    setPriceSource(asset?.price_source ?? "manual");
    setDenomination(asset?.denomination ?? "USD");
    setError(null);
  }
}, [open, asset]);
```

Update the `onSubmit` interface (lines 50-58) to include `denomination`:

```ts
onSubmit: (data: {
  category: string;
  ticker: string;
  name: string;
  tags: string[];
  price_source: string;
  denomination: "USD" | "TRY" | "EUR";
  is_active: boolean;
}) => Promise<void>;
```

Update the `await onSubmit(...)` call (lines 109-116):

```ts
await onSubmit({
  category,
  ticker: trimmedTicker,
  name: trimmedName,
  tags,
  price_source: priceSource,
  denomination,
  is_active: true,
});
```

- [ ] **Step 2: Add the dropdown to the JSX**

Below the existing "Price Source" Select block (lines 193-210), insert a new field block:

```tsx
<div className="grid gap-2">
  <Label>Denomination</Label>
  <Select
    value={denomination}
    onValueChange={(val) => setDenomination(val as "USD" | "TRY" | "EUR")}
  >
    <SelectTrigger className="w-full">
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="USD">USD</SelectItem>
      <SelectItem value="TRY">TRY</SelectItem>
      <SelectItem value="EUR">EUR</SelectItem>
    </SelectContent>
  </Select>
  <p className="text-xs text-muted-foreground">
    The currency this asset's price is quoted in. Almost always USD.
  </p>
</div>
```

- [ ] **Step 3: Plumb `denomination` through `AssetList`**

In `src/components/assets/AssetList.tsx`, the `onSubmit` handler (lines 137-149) forwards form data to `addAsset` / `editAsset`. Update the edit branch to include `denomination`:

```ts
onSubmit={async (data) => {
  if (editingAsset) {
    await editAsset(editingAsset.id, {
      category: data.category,
      ticker: data.ticker,
      name: data.name,
      tags: data.tags,
      price_source: data.price_source,
      denomination: data.denomination,
    });
  } else {
    await addAsset(data);
  }
}}
```

`useAssets.ts` and `src/lib/queries/assets.ts` need no changes: `AssetInsert` and `AssetUpdate` are derived from `Asset` via `Omit`/`Partial` (see `src/types/database.ts:135-136`), so the new fields flow through automatically once Task 2 lands.

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`

Expected: clean.

- [ ] **Step 5: Manual test**

`npm run dev`. Open Assets, click "Add Asset". Confirm:
- The Denomination dropdown appears, defaulted to `USD`.
- You can create a new asset (e.g. ticker `TEST_FOO`, category `crypto`) with denomination `USD`.
- Editing an existing asset preserves its current denomination.

Clean up the test asset via SQL after.

- [ ] **Step 6: Commit**

```bash
git add src/components/assets/AssetForm.tsx src/components/assets/AssetList.tsx
git commit -m "$(cat <<'EOF'
feat(assets): denomination dropdown on asset form

User-created assets pick which currency their price is quoted in.
Defaults to USD (the common case). System-managed currency rows
are not user-editable so they don't surface this field.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: AssetRow — hide edit/deactivate for system currencies

**Files:**
- Modify: `src/components/assets/AssetRow.tsx:57-83`

The 3 system rows (USD/TRY/EUR) must not be editable or deactivatable from the UI. Gate the actions dropdown on `!asset.is_currency`.

- [ ] **Step 1: Add the guard to the actions cell**

Find the last `TableCell` in `AssetRow.tsx` (around line 57):

```tsx
<TableCell className="text-right">
  {asset.is_active && (
    <DropdownMenu>
      ...
    </DropdownMenu>
  )}
</TableCell>
```

Change the condition to also require `!asset.is_currency`:

```tsx
<TableCell className="text-right">
  {asset.is_active && !asset.is_currency && (
    <DropdownMenu>
      ...
    </DropdownMenu>
  )}
</TableCell>
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`

Expected: clean.

- [ ] **Step 3: Manual test**

`npm run dev`. Open the Assets page. Confirm:
- USD/TRY/EUR rows render but have no "⋯" actions menu (no Edit, no Deactivate).
- USDT/USDC and stocks/crypto still show the menu.

- [ ] **Step 4: Commit**

```bash
git add src/components/assets/AssetRow.tsx
git commit -m "$(cat <<'EOF'
fix(assets): hide edit/deactivate on system currency rows

USD/TRY/EUR are seeded by the system and must not be mutable from the
UI. The dropdown menu is conditionally hidden when is_currency=true.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Cleanup — delete the resolved handoff doc

**Files:**
- Delete: `docs/pnl-divergence-handoff.md`

- [ ] **Step 1: Remove the file**

```bash
git rm docs/pnl-divergence-handoff.md
```

- [ ] **Step 2: Commit**

```bash
git commit -m "$(cat <<'EOF'
docs: drop pnl-divergence handoff (resolved)

The Mar 3 zero-cost transfer_in is fixed in the data; the bug class is
now structurally prevented by the transfer_in_has_cost CHECK and the
modal's auto-fill/required-cost behavior. Handoff doc is stale.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: End-to-end smoke verification

This task runs no code changes — only verification.

- [ ] **Step 1: Confirm hero/portfolio P&L still agree**

`npm run dev`. Open the dashboard. Note Hero "Total P&L" and Portfolio "Total P&L". They should agree within $1 (small USDT/USDC price-drift noise from Task 3 is expected).

If they DON'T agree, the most likely cause is a holdings-query field omission missed in Task 3 Step 2. Re-check `src/lib/queries/holdings.ts` to confirm `is_currency` is being returned.

- [ ] **Step 2: Verify the Mar 3 row stays fixed**

```sql
SELECT id, date::date, type, amount, unit_price, total_cost, price_currency
FROM public.transactions
WHERE id = '4f0e315f-407f-4118-92ab-5a04c0197177';
```

Expected: `unit_price=1, total_cost=2000, price_currency='USD'`. (This was patched in the prior session.)

- [ ] **Step 3: Verify the new CHECK is the floor**

Attempt to manually insert a zero-cost transfer_in (the same probe from Task 1 Step 4). It should still be rejected.

- [ ] **Step 4: Verify the data model is internally consistent**

```sql
-- All system currency rows are self-denominated.
SELECT ticker, denomination, is_currency
FROM public.assets
WHERE is_currency = true;
-- Expected: USD/USD, TRY/TRY, EUR/EUR.

-- No non-currency asset has a wrong-shape denomination.
SELECT ticker, denomination
FROM public.assets
WHERE is_currency = false AND denomination NOT IN ('USD','TRY','EUR');
-- Expected: 0 rows.

-- USDT/USDC are crypto now.
SELECT ticker, category, denomination
FROM public.assets
WHERE ticker IN ('tether','usd-coin');
-- Expected: category='crypto', denomination='USD'.
```

- [ ] **Step 5: Walk the modal happy paths once each**

In the dev server, run each of these and confirm the row written to DB matches expectations:

1. **Buy USDT 100 @ auto-prefilled price** — Asset=USDT, Type=Buy, Amount=100; unit_price pre-filled to ≈1.00; submit. Confirm DB row has correct values. Delete it.
2. **Transfer in USD 1000** — Asset=USD, Type=Transfer In, Amount=1000; verify auto "Cost basis: $1000.00 (auto)" line; submit. Confirm DB has unit_price=1, total_cost=1000. Delete it.
3. **Lone transfer_in BTC 0.1 @ 30000** — Asset=BTC, Type=Transfer In, Amount=0.1, leave price empty → warning + disabled. Enter Unit Price=30000 → enables. Submit. Confirm DB total_cost=3000. Delete it.

- [ ] **Step 6: Final commit (if you needed any fix-ups)**

If you uncovered any small issue and patched it, commit:

```bash
git add <files>
git commit -m "fix(smoke): <what you fixed>

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

Otherwise no commit. The plan is done.

---

## Done

The bug class is structurally closed: data CHECK at the DB, validated UX at the modal, and the modal preserves entry simplicity through `price_cache` prefill. USDT/USDC are honest crypto positions with real P&L. The `is_currency` flag is the single hard line between system-managed currencies and everything else.
