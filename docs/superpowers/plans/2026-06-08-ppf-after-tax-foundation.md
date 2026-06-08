# PPF After-Tax P&L — Foundation Plan (Plan 1 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the data + pure-logic foundation for showing PPF gains net of a fixed at-source tax, plus a foreign-income-in-TRY helper for the 22k heads-up — without touching any UI.

**Architecture:** A nullable `at_source_tax_rate` column on `assets`; a new `fund` asset category (TRY-native). The P&L engine gains an **additive** per-asset `taxAccrualUsd` overlay (rate × the positive *native* gain, held + realized), leaving the gross decomposition and its `value − netInvested == unrealized + realized + income` invariant untouched. A separate pure helper sums foreign-declarable dividend+interest in TRY for a calendar year.

**Tech Stack:** TypeScript, bignumber.js (all money math), Vitest, Supabase (Postgres migration).

Spec: `docs/superpowers/specs/2026-06-08-currency-grouping-ppf-after-tax.md`

**Commands:** typecheck `npm run typecheck` · single test file `npx vitest run <path>` · all tests `npm test`

---

### Task 1: Database migration — `at_source_tax_rate` column

**Files:**
- Create: `supabase/migrations/20260608000000_asset_at_source_tax_rate.sql`

- [ ] **Step 1: Write the migration**

```sql
-- at_source_tax_rate: optional fixed withholding rate (e.g. 0.175 = 17.5%) taken
-- AT SOURCE on an asset's gains, like a Turkish para piyasası fonu (PPF). When
-- set, the P&L engine shows the asset's gain net of this rate (an additive
-- tax-accrual overlay; gross figures are unchanged). Null for assets with no
-- at-source tax (US stocks, crypto, …) — those keep gross behaviour.
alter table public.assets add column if not exists at_source_tax_rate numeric;
```

- [ ] **Step 2: Verify it parses (no apply here)**

Run: `head -5 supabase/migrations/20260608000000_asset_at_source_tax_rate.sql`
Expected: the SQL above. (Applying to Supabase happens during deploy, hand-driven by the user — do not run it.)

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260608000000_asset_at_source_tax_rate.sql
git commit -m "feat(assets): at_source_tax_rate column for PPF after-tax P&L"
```

---

### Task 2: Asset model surface — type, insert, holdings query, constants

**Files:**
- Modify: `src/types/database.ts` (Asset interface + AssetInsert)
- Modify: `src/lib/queries/holdings.ts` (select strings + HoldingWithDetails.assets)
- Modify: `src/lib/constants/assets.ts` (fund category, assetNativeCurrency, hints, price source)
- Modify: `src/lib/config.ts` (AMOUNT_DECIMALS)

- [ ] **Step 1: Add the field to the `Asset` interface**

In `src/types/database.ts`, in `interface Asset`, add after `is_active: boolean;`:

```ts
  /** Fixed at-source withholding rate on this asset's gains (e.g. 0.175 for a
   *  Turkish PPF). When set, the engine reports the gain net of it. Null = no
   *  at-source tax (gross behaviour). See lib/pnl/portfolio taxAccrualUsd. */
  at_source_tax_rate: number | null;
```

- [ ] **Step 2: Keep `AssetInsert` backward-compatible (rate optional on insert)**

In `src/types/database.ts`, replace the `AssetInsert` definition:

```ts
export type AssetInsert = Omit<
  Asset,
  "id" | "created_at" | "updated_at" | "price_id" | "icon_url"
> & { price_id?: string | null; icon_url?: string | null };
```

with:

```ts
export type AssetInsert = Omit<
  Asset,
  "id" | "created_at" | "updated_at" | "price_id" | "icon_url" | "at_source_tax_rate"
> & {
  price_id?: string | null;
  icon_url?: string | null;
  at_source_tax_rate?: number | null;
};
```

- [ ] **Step 3: Surface the column on holdings reads**

In `src/lib/queries/holdings.ts`, add to the `HoldingWithDetails["assets"]` shape (after `is_active: boolean`):

```ts
    at_source_tax_rate: number | null
```

Then in BOTH `fetchHoldings` and `fetchHoldingsByAsset`, change the nested select
`assets(name, ticker, price_id, category, tags, is_currency, is_active)` to:

```ts
assets(name, ticker, price_id, category, tags, is_currency, is_active, at_source_tax_rate)
```

Because the type now *requires* the field, update the test fixture that builds
this shape. In `src/lib/pnl/test-fixtures.ts`, in `holding()`: add
`atSourceTaxRate?: number | null` to the `opts` type, and add inside the returned
`assets` object (after `is_active: true,`):

```ts
      at_source_tax_rate: opts.atSourceTaxRate ?? null,
```

(If Step 6's typecheck flags any *other* literal that builds the holdings `assets`
projection, add `at_source_tax_rate: null` there too.)

- [ ] **Step 4: Add the `fund` category + native currency + price defaults**

In `src/lib/constants/assets.ts`:

In `ASSET_CATEGORIES`, add after the `gold` entry:

```ts
  { value: "fund", label: "Fund (PPF)" },
```

In `assetNativeCurrency`, add before the final `return "USD"`:

```ts
  if (asset.category === "fund") return "TRY"
```

In `TICKER_HINTS`, add:

```ts
  fund: 'Fund code, e.g. "TI1" (a TRY money-market fund / PPF)',
```

In `DEFAULT_PRICE_SOURCE`, add (PPF NAV is entered by hand):

```ts
  fund: "manual",
```

- [ ] **Step 5: Add fund quantity decimals**

In `src/lib/config.ts`, in `AMOUNT_DECIMALS`, add:

```ts
  fund: DECIMALS.stockAmount,
```

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: PASS (no errors). `TICKER_HINTS` / `DEFAULT_PRICE_SOURCE` are `Record<AssetCategoryValue, …>`, so the new `fund` key is required — adding it is what keeps the build green.

- [ ] **Step 7: Commit**

```bash
git add src/types/database.ts src/lib/queries/holdings.ts src/lib/constants/assets.ts src/lib/config.ts src/lib/pnl/test-fixtures.ts
git commit -m "feat(assets): fund category (TRY-native) + at_source_tax_rate plumbing"
```

---

### Task 3: Engine after-tax overlay (`taxAccrualUsd`)

**Files:**
- Modify: `src/lib/pnl/types.ts` (add fields)
- Modify: `src/lib/pnl/portfolio.ts` (compute + thread the overlay)
- Modify: `src/lib/pnl/test-fixtures.ts` (TRY prices + tax-rate on holding)
- Test: `src/lib/pnl/after-tax.test.ts` (new)

- [ ] **Step 1: Write the failing test**

Create `src/lib/pnl/after-tax.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { computePortfolioPnL } from "@/lib/pnl/portfolio"
import { buy, holding, pricesWithTry, rate } from "@/lib/pnl/test-fixtures"

// PPF: buy 1000 units @ ₺1 (usd_try=25 → $40 cost). NAV doubles to ₺2/unit.
// Native gain = ₺2000 − ₺1000 = ₺1000. At 17.5% → ₺175 tax.
// In USD via the asset's own price pair (price_usd 0.08 / price_try 2):
//   taxAccrualUsd = 175 × 0.08 / 2 = $7.00.
// Gross unrealized is UNCHANGED: value $80 − cost $40 = $40.
const PPF_RATE = 0.175

describe("after-tax overlay for at-source-taxed assets (PPF)", () => {
  const txs = [
    buy(1000, 1, { price_currency: "TRY", date: "2026-01-01" }),
  ]
  const rates = [rate("2026-01-01", { usd_try: 25 })]
  const h = [
    holding({
      balance: 1000,
      ticker: "TI1",
      category: "fund",
      atSourceTaxRate: PPF_RATE,
    }),
  ]
  const prices = pricesWithTry({ TI1: { usd: 0.08, try: 2 } })

  it("accrues 17.5% of the positive native gain, in USD", () => {
    const r = computePortfolioPnL({
      holdings: h,
      prices,
      transactions: txs,
      rates,
      snapshots: [],
    })
    const asset = r.assetPnLs.find((a) => a.ticker === "TI1")!
    expect(asset.unrealizedPnlUsd.toFixed(2)).toBe("40.00") // gross unchanged
    expect(asset.taxAccrualUsd.toFixed(2)).toBe("7.00")
    expect(r.totalTaxAccrualUsd.toFixed(2)).toBe("7.00")
  })

  it("preserves the gross money-weighted invariant (overlay is additive)", () => {
    const r = computePortfolioPnL({
      holdings: h,
      prices,
      transactions: txs,
      rates,
      snapshots: [],
    })
    const moneyWeighted = r.totalCurrentValueUsd.minus(r.totalInvestedUsd)
    const decomposed = r.totalUnrealizedPnlUsd
      .plus(r.totalRealizedPnlUsd)
      .plus(r.totalIncomeUsd)
    expect(moneyWeighted.minus(decomposed).abs().lt(0.01)).toBe(true)
  })

  it("does not tax a loss (negative native gain → 0 accrual)", () => {
    const r = computePortfolioPnL({
      holdings: h,
      prices: pricesWithTry({ TI1: { usd: 0.02, try: 0.5 } }), // NAV fell to ₺0.5
      transactions: txs,
      rates,
      snapshots: [],
    })
    expect(r.totalTaxAccrualUsd.toFixed(2)).toBe("0.00")
  })

  it("no rate set → no accrual (ordinary asset unaffected)", () => {
    const r = computePortfolioPnL({
      holdings: [holding({ balance: 1000, ticker: "TI1", category: "fund" })],
      prices,
      transactions: txs,
      rates,
      snapshots: [],
    })
    expect(r.totalTaxAccrualUsd.toFixed(2)).toBe("0.00")
  })
})
```

- [ ] **Step 2: Run it — verify it fails**

Run: `npx vitest run src/lib/pnl/after-tax.test.ts`
Expected: FAIL — `pricesWithTry` not exported, `atSourceTaxRate` not on the holding opts, and `taxAccrualUsd` / `totalTaxAccrualUsd` undefined.

- [ ] **Step 3: Add the fields to the P&L types**

In `src/lib/pnl/types.ts`:

In `interface HoldingPnL`, add after `realizedPnlUsd: BigNumber`:

```ts
  /** Fixed at-source tax accrued on this holding's positive native gain
   *  (held + realized), in USD. 0 unless the asset has at_source_tax_rate. */
  taxAccrualUsd: BigNumber
```

In `interface AssetPnL`, add after `realizedPnlUsd: BigNumber`:

```ts
  /** At-source tax accrued on this asset's positive native gain, in USD. */
  taxAccrualUsd: BigNumber
```

In `interface PortfolioPnL`, add after `totalUnrealizedPnlUsd: BigNumber`:

```ts
  /** Sum of per-asset at-source tax accrual (USD). After-tax Total P&L =
   *  (totalCurrentValueUsd − totalInvestedUsd) − totalTaxAccrualUsd. Kept
   *  separate so the gross decomposition + its invariant stay intact. */
  totalTaxAccrualUsd: BigNumber
```

- [ ] **Step 4: Add the empty-total default**

In `src/lib/pnl/portfolio.ts`, in `EMPTY_PNL`, add after `totalUnrealizedPnlUsd: BN_ZERO,`:

```ts
  totalTaxAccrualUsd: BN_ZERO,
```

- [ ] **Step 5: Extend the test fixtures (TRY prices + tax rate)**

In `src/lib/pnl/test-fixtures.ts` (the `holding()` `atSourceTaxRate` opt was
added in Task 2 Step 3), add a new exported helper (mirrors `prices`, but carries
a native TRY price):

```ts
/** price_cache map carrying both USD and native-TRY unit prices (for funds
 *  whose at-source tax is computed on the native TRY gain). */
export function pricesWithTry(
  map: Record<string, { usd: number; try: number }>,
): Record<string, PriceCache> {
  const out: Record<string, PriceCache> = {}
  for (const [ticker, { usd, try: tryPrice }] of Object.entries(map)) {
    out[ticker] = {
      ticker,
      price_usd: usd,
      price_try: tryPrice,
      source: "test",
      updated_at: "2026-01-01",
    }
  }
  return out
}
```

- [ ] **Step 6: Implement the overlay in the engine**

In `src/lib/pnl/portfolio.ts`:

(a) In the `is_currency` branch's `holdingPnLs.push({ … })`, add `taxAccrualUsd: BN_ZERO,` after `realizedPnlUsd: BN_ZERO,`.

(b) In the FIFO branch, immediately before the final `holdingPnLs.push({ … })`, insert:

```ts
    // At-source tax accrual: rate × the POSITIVE native gain (held + realized).
    // Additive overlay — gross unrealized/realized are untouched, so the
    // money-weighted invariant is preserved. Convert the native (TRY) tax to USD
    // using the asset's own price pair (price_usd / price_try), which is the FX
    // implied by the same quote, so no separate rate lookup is needed.
    const taxRate = h.assets.at_source_tax_rate
    let taxAccrualUsd = BN_ZERO
    if (
      taxRate != null &&
      taxRate > 0 &&
      nativeConsistent &&
      nativeCurrency &&
      costBasisNative !== null
    ) {
      const pc = prices[priceKey]
      const nativeUnitPrice =
        nativeCurrency === "TRY" ? bn(pc?.price_try ?? 0) : bn(pc?.price_usd ?? 0)
      const currentValueNative = liveBalanceBn.times(nativeUnitPrice)
      const unrealizedNativeGain = currentValueNative.minus(costBasisNative)
      const posUnrealized = unrealizedNativeGain.gt(0)
        ? unrealizedNativeGain
        : BN_ZERO
      const realizedNativeGain = realized.reduce(
        (s, rz) =>
          rz.nativePnl &&
          rz.nativeCurrency === nativeCurrency &&
          rz.nativePnl.gt(0)
            ? s.plus(rz.nativePnl)
            : s,
        BN_ZERO,
      )
      const taxNative = posUnrealized.plus(realizedNativeGain).times(bn(taxRate))
      if (nativeCurrency === "TRY") {
        const usdPrice = bn(pc?.price_usd ?? 0)
        const tryPrice = bn(pc?.price_try ?? 0)
        taxAccrualUsd = tryPrice.isZero()
          ? BN_ZERO
          : taxNative.times(usdPrice).div(tryPrice)
      } else {
        taxAccrualUsd = taxNative
      }
    }
```

Then add `taxAccrualUsd,` to that FIFO-branch `holdingPnLs.push({ … })` (after `realizedPnlUsd: totalRealized,`).

(c) In the `assetMap` value type, add `taxAccrualUsd: ReturnType<typeof bn>` after `realizedPnlUsd: ReturnType<typeof bn>`.

(d) In the `for (const hp of holdingPnLs)` aggregation:
- in the `if (existing)` block add: `existing.taxAccrualUsd = existing.taxAccrualUsd.plus(hp.taxAccrualUsd)`
- in the `else` `assetMap.set(...)` literal add: `taxAccrualUsd: hp.taxAccrualUsd,`

(e) In the `assetPnLs.push({ … })` literal add `taxAccrualUsd: data.taxAccrualUsd,` (after `realizedPnlUsd: data.realizedPnlUsd,`).

(f) Add the total (after `totalUnrealizedPnlUsd`):

```ts
  const totalTaxAccrualUsd = assetPnLs.reduce(
    (s, a) => s.plus(a.taxAccrualUsd),
    BN_ZERO,
  )
```

and add `totalTaxAccrualUsd,` to the final `return { … }`.

- [ ] **Step 7: Run the test — verify it passes**

Run: `npx vitest run src/lib/pnl/after-tax.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 8: Full suite + typecheck (no regressions)**

Run: `npm test && npm run typecheck`
Expected: PASS. (Existing engine cases are unaffected — assets without a rate get `taxAccrualUsd = 0`.)

- [ ] **Step 9: Commit**

```bash
git add src/lib/pnl/types.ts src/lib/pnl/portfolio.ts src/lib/pnl/test-fixtures.ts src/lib/pnl/after-tax.test.ts
git commit -m "feat(pnl): after-tax overlay (taxAccrualUsd) for at-source-taxed assets"
```

---

### Task 4: Foreign-income-in-TRY helper + classifier

**Files:**
- Create: `src/lib/pnl/foreign-income.ts`
- Test: `src/lib/pnl/foreign-income.test.ts` (new)

- [ ] **Step 1: Write the failing test**

Create `src/lib/pnl/foreign-income.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import {
  foreignDeclarableAssetIds,
  computeForeignIncomeTry,
} from "@/lib/pnl/foreign-income"
import { tx, rate } from "@/lib/pnl/test-fixtures"

const assets = [
  { id: "us", category: "stock_us", ticker: "AAPL", at_source_tax_rate: null },
  { id: "ppf", category: "fund", ticker: "TI1", at_source_tax_rate: 0.175 },
  { id: "bist", category: "stock_bist", ticker: "THYAO.IS", at_source_tax_rate: null },
  { id: "usdcash", category: "fiat", ticker: "USD", at_source_tax_rate: null },
]

describe("foreignDeclarableAssetIds", () => {
  it("includes foreign (non-TRY) assets with no at-source tax; excludes TRY + withheld", () => {
    const ids = foreignDeclarableAssetIds(assets)
    expect(ids.has("us")).toBe(true)
    expect(ids.has("usdcash")).toBe(true)
    expect(ids.has("ppf")).toBe(false) // withheld at source
    expect(ids.has("bist")).toBe(false) // TRY / domestic
  })
})

describe("computeForeignIncomeTry", () => {
  const rates = [rate("2026-03-10", { usd_try: 40 })]
  const declarable = foreignDeclarableAssetIds(assets)

  it("sums dividend + interest of declarable assets in TRY for the year", () => {
    const txs = [
      tx({ type: "dividend", asset_id: "us", total_cost: 100, price_currency: "USD", date: "2026-03-10" }), // $100 → ₺4000
      tx({ type: "interest", asset_id: "usdcash", total_cost: 50, price_currency: "USD", date: "2026-03-10" }), // $50 → ₺2000
      tx({ type: "interest", asset_id: "ppf", total_cost: 999, price_currency: "TRY", date: "2026-03-10" }), // excluded (withheld)
      tx({ type: "buy", asset_id: "us", total_cost: 5000, price_currency: "USD", date: "2026-03-10" }), // not income
    ]
    expect(computeForeignIncomeTry(txs, rates, 2026, declarable).toFixed(2)).toBe("6000.00")
  })

  it("excludes income from other calendar years", () => {
    const txs = [
      tx({ type: "dividend", asset_id: "us", total_cost: 100, price_currency: "USD", date: "2025-12-31" }),
    ]
    expect(computeForeignIncomeTry(txs, rates, 2026, declarable).toFixed(2)).toBe("0.00")
  })
})
```

- [ ] **Step 2: Run it — verify it fails**

Run: `npx vitest run src/lib/pnl/foreign-income.test.ts`
Expected: FAIL — module `@/lib/pnl/foreign-income` not found.

- [ ] **Step 3: Implement the helper**

Create `src/lib/pnl/foreign-income.ts`:

```ts
import type BigNumber from "bignumber.js"
import type { Transaction, ExchangeRate } from "@/types/database"
import { BN_ZERO } from "@/lib/config"
import { convertOnDate } from "@/lib/pnl/currency"
import { assetNativeCurrency } from "@/lib/constants/assets"

/** Minimal asset shape needed to classify foreign-declarable income. */
type ClassifiableAsset = {
  id: string
  category: string
  ticker: string
  at_source_tax_rate: number | null
}

/**
 * Asset ids whose dividend/interest is FOREIGN and NOT withheld at source —
 * i.e. the income that feeds the Turkish 22k declaration threshold. Foreign is
 * proxied as "native currency is not TRY"; withheld-at-source assets (a PPF,
 * with at_source_tax_rate) are excluded because their tax is already taken.
 */
export function foreignDeclarableAssetIds(
  assets: ClassifiableAsset[],
): Set<string> {
  const ids = new Set<string>()
  for (const a of assets) {
    const foreign = assetNativeCurrency(a) !== "TRY"
    const withheld = a.at_source_tax_rate != null
    if (foreign && !withheld) ids.add(a.id)
  }
  return ids
}

/**
 * Sum of dividend + interest from declarable assets, converted to TRY at each
 * transaction's own date, for a single calendar (tax) year. This is the figure
 * shown against the 22,000 TL threshold.
 */
export function computeForeignIncomeTry(
  transactions: Transaction[],
  rates: ExchangeRate[],
  year: number,
  declarableAssetIds: Set<string>,
): BigNumber {
  const yearStr = String(year)
  let sum = BN_ZERO
  for (const t of transactions) {
    if (t.type !== "dividend" && t.type !== "interest") continue
    if (!declarableAssetIds.has(t.asset_id)) continue
    if (t.date.slice(0, 4) !== yearStr) continue
    sum = sum.plus(
      convertOnDate(t.total_cost ?? 0, t.price_currency, "TRY", t.date, rates),
    )
  }
  return sum
}
```

- [ ] **Step 4: Run the test — verify it passes**

Run: `npx vitest run src/lib/pnl/foreign-income.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Typecheck + commit**

Run: `npm run typecheck`
Expected: PASS.

```bash
git add src/lib/pnl/foreign-income.ts src/lib/pnl/foreign-income.test.ts
git commit -m "feat(pnl): foreign-declarable income summed in TRY by tax year"
```

---

### Task 5: Docs sync (CLAUDE.md requirement)

**Files:**
- Modify: `docs/components/06-pnl-engine.md` (behavioral) + `docs/components/technical/06-pnl-engine.md`
- Modify: `docs/components/GLOSSARY.md`
- Modify: `docs/pnl-test-cases.md`

- [ ] **Step 1: Behavioral spec (06)** — add a rule after the "Fiat FX P&L" rule:

```markdown
### 7. After-tax (at-source) overlay

Some holdings carry a fixed tax taken **at source** on their gains (a Turkish
PPF: 17.5%). For these, the engine reports a **tax accrual** = rate × the
*positive native gain* (held + any realized), so the displayed gain is net
(₺1,000 gain → ₺825). It is an **additive overlay**: gross unrealized/realized
are untouched and the money-weighted invariant still holds; after-tax Total P&L
= gross Total P&L − total tax accrual. The rate is per-asset config (it changes
yearly); assets without a rate are unaffected.
```

- [ ] **Step 2: Technical doc (06)** — note: per-asset `taxAccrualUsd` + portfolio `totalTaxAccrualUsd` in `computePortfolioPnL` (`src/lib/pnl/portfolio.ts`); native tax converted to USD via the asset's `price_usd/price_try` pair; the foreign-income helper `computeForeignIncomeTry` + `foreignDeclarableAssetIds` in `src/lib/pnl/foreign-income.ts`.

- [ ] **Step 3: GLOSSARY** — add entries:
  - **At-source tax** — a withholding taken automatically on an asset's gains (PPF 17.5%); modeled as `at_source_tax_rate`.
  - **After-tax P&L** — gross P&L minus the at-source tax accrual; an additive overlay that preserves the gross decomposition.
  - **Foreign-declarable income** — dividend/interest from a non-TRY asset with no at-source tax; the income that counts toward the 22,000 TL threshold.

- [ ] **Step 4: `docs/pnl-test-cases.md`** — add the worked PPF case: buy 1000 @ ₺1 (usd_try 25 → $40 cost), NAV → ₺2 → native gain ₺1,000, 17.5% → ₺175 tax → after-tax ₺825; in USD, gross unrealized $40, `taxAccrualUsd` $7.00.

- [ ] **Step 5: Verify cross-references resolve, then commit**

Run: `npm test` (the Vitest cases still pass — docs are prose, but re-run to be safe)
Expected: PASS

```bash
git add docs/components/06-pnl-engine.md docs/components/technical/06-pnl-engine.md docs/components/GLOSSARY.md docs/pnl-test-cases.md
git commit -m "docs(pnl): after-tax overlay + foreign-income helper"
```

---

## What this plan deliberately does NOT do (later plans)

- **Plan 2 (UI):** `currency` group-by axis in the Portfolio page + dashboard echo; rendering after-tax vs gross (gross + `−tax` line) using `lib/prices` formatters.
- **Plan 3 (UI):** the 22k annotation/badge + in-app notification (via `sonner`), reading `computeForeignIncomeTry` for the current year.
- **AssetForm:** a UI field to set `at_source_tax_rate` / pick the `fund` category lands with Plan 2 (until then the rate is set via data import / direct row edit).

## Notes / accepted approximations

- Tax accrual values the native (TRY) liability at the asset's *current* price pair, not redemption-date FX — exact only at redemption; fine for a monotonic money-market NAV.
- "Foreign" is proxied by native-currency ≠ TRY. Revisit if a TRY-denominated foreign-source instrument ever appears.
