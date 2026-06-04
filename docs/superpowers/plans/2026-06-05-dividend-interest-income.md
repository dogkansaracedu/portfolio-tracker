# Dividends & Interest as Income — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Model dividend & interest transactions as income (a realized gain equal to the amount received, neutral to net invested capital), so the money-weighted total stops double/zero-counting them and a real income figure becomes available.

**Architecture:** A dividend/interest is income. (1) The invested-capital ledger stops decrementing for them (income-neutral), with an opt-in flag so a fiat balance's cost basis still absorbs received cash (no spurious FX gain). (2) A new pure `computeIncomeUsd` exposes income as its own decomposition term (`total = unrealized + realized + income`), reconciled by a dev-time assert. (3) FIFO is unchanged. (4) The entry form gains a "Received as Units/Cash" guide and payer attribution.

**Tech Stack:** React 19 + Vite + TypeScript, bignumber.js for money math, Supabase. **No test runner exists** (project decision) — verification is `tsc --noEmit`, `eslint`, `npm run build`, the runtime reconciliation assert, and manual prod checks. Loop is commit → push → test on prod.

**Spec:** `docs/superpowers/specs/2026-06-05-dividend-interest-income-design.md`

**Open decisions resolved for this plan:** income shows as its **own line**; **portfolio-level** income for v1 (but `related_asset_id` is captured so a per-asset breakdown is a later add).

---

## File structure

**Phase 1 — engine (makes existing + Units-mode income correct; ships on its own):**
- `src/lib/performance.ts` (modify) — `applyTxToInvested` + `computeCurrentInvestedUsd` gain a `treatIncomeAsCapital` option; dividend/interest become income-neutral by default.
- `src/lib/pnl/income.ts` (create) — `computeIncomeUsd(transactions, rates): BigNumber`.
- `src/hooks/usePnL.ts` (modify) — fiat cost basis opts in to `treatIncomeAsCapital`; expose `totalIncomeUsd`; add reconciliation assert.
- `src/hooks/usePnLSummary.ts` (modify) — expose `totalIncomeUsd`.
- `src/hooks/usePortfolio.ts` (modify) — expose `totalIncomeUsd` (parity).
- P&L summary display component (modify) — render the income line.

**Phase 2 — entry UX (enables cash dividends / bond interest; ships on its own):**
- `src/components/transactions/AddTransactionModal.tsx` (modify) — "Received as Units/Cash" guide, payer (`related_asset_id`) field, auto `unit_price=1` for cash income.

No DB migration: the one existing QQQ dividend is already Units-shaped; only the engine reinterprets it. No `validation.ts`/`parseImport.ts` changes (cash income uses `unit_price=1`, which already validates).

---

## Phase 1 — Engine

### Task 1: Make net invested income-neutral (with fiat-cost-basis opt-in)

**Files:**
- Modify: `src/lib/performance.ts` (the `applyTxToInvested` function ~lines 529-565 and `computeCurrentInvestedUsd` ~lines 632-641, plus the doc comment ~lines 495-528)

- [ ] **Step 1: Add the options type and thread it through `applyTxToInvested`**

Replace the dividend/interest case and the signature. The full new `applyTxToInvested` signature + changed cases:

```ts
interface InvestedOptions {
  /**
   * When true, dividend/interest income ADDS to the figure at its received USD
   * value. Used for a fiat holding's "deployed cash" cost basis, so earned
   * foreign cash (EUR/TRY) isn't later mislabeled as an FX gain. When false
   * (the global net-invested = external-capital sense), income is neutral.
   */
  treatIncomeAsCapital?: boolean
}

function applyTxToInvested(
  tx: Transaction,
  rates: ExchangeRate[],
  cum: ReturnType<typeof bn>,
  opts: InvestedOptions = {},
): ReturnType<typeof bn> {
  const totalUsd = normalizeToUsd(
    tx.total_cost ?? 0,
    tx.price_currency,
    tx.date,
    rates,
  )
  const feeUsd = tx.fee
    ? normalizeToUsd(tx.fee, tx.fee_currency ?? tx.price_currency, tx.date, rates)
    : bn(0)

  switch (tx.type) {
    case "buy":
      return cum.plus(totalUsd).plus(feeUsd)
    case "sell":
      return cum.minus(totalUsd).plus(feeUsd)
    case "transfer_in":
      return cum.plus(totalUsd)
    case "transfer_out":
      return cum.minus(totalUsd)
    case "dividend":
    case "interest":
      // Income, not external capital → neutral to net invested. The fiat
      // cost-basis caller opts in to absorb the received cash so it doesn't
      // surface as a phantom FX gain.
      return opts.treatIncomeAsCapital ? cum.plus(totalUsd) : cum
    case "fee":
      return cum.plus(feeUsd.isZero() ? totalUsd : feeUsd)
    case "cash_credit":
      return cum.plus(totalUsd)
    case "cash_debit":
      return cum.minus(totalUsd)
    default:
      return cum
  }
}
```

- [ ] **Step 2: Thread the option through `computeCurrentInvestedUsd`**

```ts
export function computeCurrentInvestedUsd(
  transactions: Transaction[],
  rates: ExchangeRate[],
  opts: InvestedOptions = {},
): number {
  let cum = bn(0)
  for (const tx of transactions) {
    cum = applyTxToInvested(tx, rates, cum, opts)
  }
  return cum.toNumber()
}
```

- [ ] **Step 3: Update the doc comment** above `applyTxToInvested`. Change the two lines that read:

```
 *   dividend       -> -total         (cash returned to the account)
 *   interest       -> -total         (cash returned to the account)
```

to:

```
 *   dividend       -> 0  (income: neutral to net invested; +total only under
 *   interest       -> 0   treatIncomeAsCapital, for a fiat holding's cost basis)
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit`
Expected: exit 0. (`computePnLTimeSeries` at ~line 609 calls `applyTxToInvested(tx, rates, cum)` with no opts → default neutral, which is correct for the chart's net invested.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/performance.ts
git commit -m "fix(pnl): treat dividend/interest as income-neutral for net invested

Adds a treatIncomeAsCapital opt-in (fiat cost basis) so received cash still
counts there, while global net invested no longer decrements for income —
the core of the dividend double-count fix."
```

---

### Task 2: Add `computeIncomeUsd`

**Files:**
- Create: `src/lib/pnl/income.ts`

- [ ] **Step 1: Write the function**

```ts
import type BigNumber from "bignumber.js"
import type { Transaction, ExchangeRate } from "@/types/database"
import { BN_ZERO } from "@/lib/config"
import { normalizeToUsd } from "@/lib/pnl/currency"

/**
 * Income (realized gain) from dividend & interest, in USD.
 *
 * Dividends and interest are earnings, not external capital and not an
 * unrealized mark — they're recognized at the amount received. This is the
 * `income` term in the P&L decomposition `total = unrealized + realized + income`,
 * which must equal the canonical money-weighted total `value − net invested`.
 */
export function computeIncomeUsd(
  transactions: Transaction[],
  rates: ExchangeRate[],
): BigNumber {
  let sum = BN_ZERO
  for (const tx of transactions) {
    if (tx.type !== "dividend" && tx.type !== "interest") continue
    sum = sum.plus(
      normalizeToUsd(tx.total_cost ?? 0, tx.price_currency, tx.date, rates),
    )
  }
  return sum
}
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/lib/pnl/income.ts
git commit -m "feat(pnl): add computeIncomeUsd (dividend/interest income term)"
```

---

### Task 3: Wire income into `usePnL` (fiat opt-in, expose total, reconcile)

**Files:**
- Modify: `src/hooks/usePnL.ts`

- [ ] **Step 1: Import `computeIncomeUsd` and `useEffect`**

Change the React import (line 1) and add the income import near the other `lib/pnl` imports (~line 7):

```ts
import { useEffect, useMemo } from "react"
```
```ts
import { computeIncomeUsd } from "@/lib/pnl/income"
```

- [ ] **Step 2: Make the fiat branch absorb received cash into its cost basis**

In the `if (h.assets.is_currency)` branch, change the `fiatCostBasisUsd` line (currently `computeCurrentInvestedUsd(grouped[key] ?? [], rates)`) to pass the opt-in:

```ts
const fiatCostBasisUsd = bn(
  computeCurrentInvestedUsd(grouped[key] ?? [], rates, {
    treatIncomeAsCapital: true,
  }),
)
```

This keeps a cash dividend/interest from showing as a spurious FX gain on the fiat holding — the income is recognized once, via `totalIncomeUsd`.

- [ ] **Step 3: Add a `totalIncomeUsd` memo (full history, price-independent)**

After the existing `totalRealizedPnlUsd` memo (the one ending ~line 302), add:

```ts
// Dividend/interest income over the FULL history (price-independent, so it
// shares the [transactions, rates] memo and stays off the price-refresh path).
const totalIncomeUsd: ReturnType<typeof bn> = useMemo(() => {
  if (loading) return BN_ZERO
  return computeIncomeUsd(transactions, rates)
}, [transactions, rates, loading])
```

- [ ] **Step 4: Add the reconciliation assert**

After the `totalIncomeUsd` memo, add (uses `result` from the main memo):

```ts
// Dev-time invariant: the canonical money-weighted total must equal the
// decomposition. Fires loudly (not DEV-gated — we test on prod) if a future
// transaction type breaks the identity. $0.01 tolerance covers float display.
useEffect(() => {
  if (loading) return
  const moneyWeighted = result.totalCurrentValueUsd.minus(result.totalInvestedUsd)
  const decomposed = result.totalUnrealizedPnlUsd
    .plus(totalRealizedPnlUsd)
    .plus(totalIncomeUsd)
  if (moneyWeighted.minus(decomposed).abs().gt(0.01)) {
    console.warn(
      "[usePnL] P&L reconciliation mismatch:",
      `value−invested=${moneyWeighted.toFixed(2)}`,
      `unrealized+realized+income=${decomposed.toFixed(2)}`,
    )
  }
}, [result, totalRealizedPnlUsd, totalIncomeUsd, loading])
```

- [ ] **Step 5: Expose `totalIncomeUsd` in the return**

Change the final return (~line 304) to include it:

```ts
return { ...result, totalRealizedPnlUsd, totalIncomeUsd, transactions, rates, loading }
```

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit && npx eslint src/hooks/usePnL.ts`
Expected: exit 0, no errors.

- [ ] **Step 7: Commit**

```bash
git add src/hooks/usePnL.ts
git commit -m "feat(pnl): expose dividend/interest income from usePnL + reconciliation assert

Fiat cost basis absorbs received cash (treatIncomeAsCapital); income surfaced
as its own term; dev assert locks value−invested == unrealized+realized+income."
```

---

### Task 4: Surface `totalIncomeUsd` through the summary hooks

**Files:**
- Modify: `src/hooks/usePnLSummary.ts`
- Modify: `src/hooks/usePortfolio.ts`

- [ ] **Step 1: `usePnLSummary` — add to the interface**

In `interface PnLSummary`, add after `totalRealizedPnlUsd`:

```ts
  totalIncomeUsd: number
```

- [ ] **Step 2: `usePnLSummary` — destructure and return it**

Add `totalIncomeUsd` to the `usePnL(...)` destructure, and in the returned object (the `useMemo`) add:

```ts
      totalIncomeUsd: totalIncomeUsd.toNumber(),
```

Add `totalIncomeUsd` to that `useMemo`'s dependency array.

- [ ] **Step 3: `usePortfolio` — destructure and return it (parity)**

Add `totalIncomeUsd` to the `usePnL(...)` destructure, add `totalIncomeUsd: number` to `interface UsePortfolioReturn` (after `totalRealizedPnlUsd`), and in the returned object add:

```ts
    totalIncomeUsd: totalIncomeUsd.toNumber(),
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/usePnLSummary.ts src/hooks/usePortfolio.ts
git commit -m "feat(pnl): surface totalIncomeUsd through summary + portfolio hooks"
```

---

### Task 5: Render the income line

**Files:**
- Modify: the component that displays the realized/unrealized P&L breakdown (locate it — see Step 1)

- [ ] **Step 1: Locate the display**

Run: `grep -rn "totalRealizedPnlUsd\|Realized" src/components src/pages`
Identify the card/section that renders the realized P&L figure for the Dashboard hero and/or Portfolio summary (it consumes `usePnLSummary`).

- [ ] **Step 2: Add an income line**

Beside the existing Realized figure, add a line that renders `totalIncomeUsd` using the project's signed-currency formatter (per the gain/loss-colors convention — `formatSignedCurrency` / `gainLossClass` from `lib/prices`). Label it "Dividend & interest income". Match the surrounding markup of the Realized line exactly (same wrapper, classes, currency handling). Example shape (adapt to the located component's actual JSX):

```tsx
<div className="flex items-center justify-between">
  <span className="text-muted-foreground">Dividend &amp; interest income</span>
  <span className={gainLossClass(summary.totalIncomeUsd)}>
    {formatSignedCurrency(summary.totalIncomeUsd, displayCurrency)}
  </span>
</div>
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npm run build`
Expected: exit 0, build succeeds.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(portfolio): show dividend/interest income line in the P&L breakdown"
```

- [ ] **Step 5: Phase 1 prod check (manual)**

Push/deploy. On prod, confirm: the QQQ dividend now reads as **+$5.28** income (not a $10.56 swing in the headline); the money-weighted total dropped by ~$5.28 vs before (the corrected overcount); no `[usePnL] P&L reconciliation mismatch` warning in the console.

---

## Phase 2 — Entry UX (cash dividends / bond interest)

### Task 6: Capture the payer (`related_asset_id`)

**Files:**
- Modify: `src/components/transactions/AddTransactionModal.tsx`

- [ ] **Step 1: Add state**

Near the other `useState` hooks (~line 92):

```ts
const [relatedAssetId, setRelatedAssetId] = useState<string>("")
```

- [ ] **Step 2: Hydrate / reset it in the open effect**

In the `useEffect` that hydrates on open: in the `editing` branch add `setRelatedAssetId(editing.related_asset_id ?? "")`; in the reset branch add `setRelatedAssetId("")`.

- [ ] **Step 3: Thread it into the payload**

In `handleSubmit`, change `related_asset_id: null` to:

```ts
related_asset_id:
  (type === "dividend" || type === "interest") && relatedAssetId
    ? relatedAssetId
    : null,
```

- [ ] **Step 4: Add the optional "Paid by" field**

After the Unit Price block (after the `showPriceFields` grid, ~line 585), add (shown only for income types):

```tsx
{(type === "dividend" || type === "interest") && (
  <div className="space-y-2">
    <Label>Paid by (optional)</Label>
    <AssetSearchSelect
      assets={assets.filter((a) => !a.is_currency)}
      value={relatedAssetId}
      onChange={setRelatedAssetId}
    />
    <p className="text-xs text-muted-foreground">
      The asset that paid this income (for attribution). Optional.
    </p>
  </div>
)}
```

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit`
Expected: exit 0. (`Transaction.related_asset_id` already exists in the type.)

- [ ] **Step 6: Commit**

```bash
git add src/components/transactions/AddTransactionModal.tsx
git commit -m "feat(transactions): capture dividend/interest payer (related_asset_id)"
```

---

### Task 7: "Received as Units / Cash" guide + auto unit_price for cash

**Files:**
- Modify: `src/components/transactions/AddTransactionModal.tsx`

- [ ] **Step 1: Add `receivedAs` state**

Near the other `useState` hooks:

```ts
const [receivedAs, setReceivedAs] = useState<"units" | "cash">("units")
```

Reset it to `"units"` in both branches of the open effect (edit branch: infer from the edited tx — `setReceivedAs(editing && assets.find((a) => a.id === editing.asset_id)?.is_currency ? "cash" : "units")`; reset branch: `setReceivedAs("units")`).

- [ ] **Step 2: Render the selector (income types only)**

Immediately after the Asset Selection block (after its closing `</div>`, ~line 432), add:

```tsx
{(type === "dividend" || type === "interest") && (
  <div className="space-y-2">
    <Label>Received as</Label>
    <div className="flex gap-2">
      <Button
        type="button"
        variant={receivedAs === "units" ? "default" : "outline"}
        onClick={() => setReceivedAs("units")}
      >
        Units (reinvested / staking)
      </Button>
      <Button
        type="button"
        variant={receivedAs === "cash" ? "default" : "outline"}
        onClick={() => setReceivedAs("cash")}
      >
        Cash
      </Button>
    </div>
  </div>
)}
```

- [ ] **Step 3: Filter the asset picker by mode**

The Asset Selection `AssetSearchSelect` currently gets `assets={assets}`. For income types, filter by `receivedAs`:

```tsx
<AssetSearchSelect
  assets={
    type === "dividend" || type === "interest"
      ? assets.filter((a) =>
          receivedAs === "cash" ? a.is_currency : !a.is_currency,
        )
      : assets
  }
  value={assetId}
  onChange={setAssetId}
/>
```

- [ ] **Step 4: Auto-fill `unit_price=1` + currency for cash income**

Extend the existing currency-transfer auto-fill effect (currently `if (!isTransferEither || !isCurrencyAsset || !selectedAsset) return`, ~line 226) so it also covers income on a currency asset. Replace its guard with:

```ts
const isCashIncome =
  (type === "dividend" || type === "interest") && isCurrencyAsset
if ((!isTransferEither && !isCashIncome) || !isCurrencyAsset || !selectedAsset)
  return
```

The body (`setUnitPrice("1"); setPriceCurrency(selectedAsset.ticker)`) is unchanged. Add `type` to that effect's dependency array.

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit && npx eslint src/components/transactions/AddTransactionModal.tsx && npm run build`
Expected: exit 0, build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/components/transactions/AddTransactionModal.tsx
git commit -m "feat(transactions): Received-as Units/Cash selector for dividend/interest"
```

- [ ] **Step 7: Phase 2 prod check (manual)**

Push/deploy. On prod: record a **Cash** dividend (pick Cash → a currency → platform → amount; optionally Paid by QQQ). Confirm: the platform's cash balance rises by the amount; income line rises by the amount; money-weighted total rises by the amount (not 2×); net invested unchanged; no reconciliation warning. Then record a **Units** dividend and confirm it matches the QQQ behavior.

---

## Self-review notes
- **Spec coverage:** §4.1 → Task 1; §4.2 → Tasks 2,3,5; §4.3 → unchanged (verified, no task needed); §4.4 split → Task 1 (option) + Task 3 (fiat opt-in); §4.5 reconciliation → Task 3 assert; §3 UX → Tasks 6,7; §7 verification → per-task + prod checks.
- **Out of scope (spec §6):** in-kind fee (#2), snapshot "daily" labeling (#4), per-category income.
- **Type consistency:** `treatIncomeAsCapital` (Tasks 1,3), `computeIncomeUsd` (Tasks 2,3), `totalIncomeUsd` (Tasks 3,4,5) consistent throughout.
