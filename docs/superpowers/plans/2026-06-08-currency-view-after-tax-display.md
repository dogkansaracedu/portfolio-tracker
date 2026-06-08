# Currency View + After-Tax Display — Plan 2 of 3

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Plan-1 foundation visible and usable: let the user create a PPF (`fund` category + at-source tax rate), group the Portfolio by currency, and show PPF gains **after-tax** (net headline, gross alongside) consistently across rows, group headers, and the summary bar.

**Architecture:** Pure view-model work over the engine's existing `taxAccrualUsd` (per-asset *and* per-holding) — no new money math. A `currency` group-by axis keyed on the existing `assetNativeCurrency()`. The `EnrichedAsset` / `AssetGroup` view types gain a `taxAccrualUsd` field threaded through enrichment + rollup; components render `gross − tax` as net.

**Tech Stack:** React 19, TypeScript, bignumber.js (engine side), shadcn/base-ui components, Vitest (engine only — UI/view transforms are verified by typecheck + the existing suite, matching this project's engine-only test scope).

**Depends on:** Plan 1 (shipped) — `at_source_tax_rate` column + `fund` category + engine `taxAccrualUsd`/`totalTaxAccrualUsd` + per-holding `HoldingPnL.taxAccrualUsd`.

**Commands:** typecheck `npm run typecheck` · tests `npm test` · find callers `rg -n "<AssetForm"`.

**Display decision (per earlier confirmation):** after-tax is the **headline** figure; gross is shown smaller beside it. Daily-mode returns stay gross (tax is on cumulative gain, not a daily delta) — only **Total** mode shows net.

---

### Task 1: AssetForm — `fund` category + `at_source_tax_rate` field

**Files:**
- Modify: `src/components/assets/AssetForm.tsx`
- Modify: the AssetForm caller(s) that build the asset payload (find via `rg -n "<AssetForm"` — likely an assets page / `AssetRow` edit handler)

- [ ] **Step 1: Reuse the canonical category list (drop the stale local one missing `fund`)**

In `src/components/assets/AssetForm.tsx`, delete the local `const CATEGORIES = [...]` (lines 25–31) and import the canonical list:

```ts
import { ASSET_CATEGORIES } from "@/lib/constants/assets"
```

Then replace the two `CATEGORIES` references in the category `<Select>` (the `SelectValue` lookup and the `.map`) with `ASSET_CATEGORIES`:

```tsx
<SelectValue>
  {ASSET_CATEGORIES.find((c) => c.value === category)?.label || "Select a category"}
</SelectValue>
...
{ASSET_CATEGORIES.map((c) => (
  <SelectItem key={c.value} value={c.value}>
    {c.label}
  </SelectItem>
))}
```

- [ ] **Step 2: Add the rate field state + reset**

Add state near the other `useState`s (after `priceSource`, ~line 81):

```ts
  // At-source withholding rate (e.g. 0.175 = 17.5%), only meaningful for `fund`
  // (PPF). Stored as a string for the input; parsed to number|null on submit.
  const [atSourceTaxRate, setAtSourceTaxRate] = useState(
    asset?.at_source_tax_rate != null ? String(asset.at_source_tax_rate) : "",
  )
```

In the `useEffect` reset block (the `if (open) { ... }`, ~line 92–111), add:

```ts
      setAtSourceTaxRate(
        asset?.at_source_tax_rate != null ? String(asset.at_source_tax_rate) : "",
      )
```

- [ ] **Step 3: Add the field JSX (shown only for `fund`)**

Immediately after the Price ID field's closing `</div>` (~line 289), add:

```tsx
          {category === "fund" && (
            <div className="grid gap-2">
              <Label htmlFor="asset-tax-rate">At-source tax rate</Label>
              <Input
                id="asset-tax-rate"
                type="number"
                step="0.001"
                min="0"
                max="1"
                placeholder="e.g. 0.175"
                value={atSourceTaxRate}
                onChange={(e) => setAtSourceTaxRate(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Fraction withheld at source on gains (e.g. 0.175 = 17.5% for a
                Turkish PPF). Gains show net of this. Leave blank for none.
              </p>
            </div>
          )}
```

- [ ] **Step 4: Extend the `onSubmit` contract + payload**

In the `AssetFormProps.onSubmit` type (lines 57–66), add after `is_active: boolean;`:

```ts
    at_source_tax_rate: number | null;
```

In `handleSubmit`'s `onSubmit({ ... })` call (lines 166–175), add (validate range; blank → null):

```ts
        at_source_tax_rate:
          atSourceTaxRate.trim() === "" ? null : Number(atSourceTaxRate),
```

And add a guard before `setSubmitting(true)` (after the name check, ~line 156):

```ts
    if (atSourceTaxRate.trim() !== "") {
      const r = Number(atSourceTaxRate)
      if (Number.isNaN(r) || r < 0 || r > 1) {
        setError("At-source tax rate must be a fraction between 0 and 1 (e.g. 0.175)")
        return
      }
    }
```

- [ ] **Step 5: Thread it through the caller**

Run `rg -n "<AssetForm"` to find where `AssetForm` is rendered and its `onSubmit` handler builds the `AssetInsert`/`AssetUpdate` (the create/update mutation). Add `at_source_tax_rate: data.at_source_tax_rate` to that payload object. `AssetInsert`/`AssetUpdate` already accept the field (Plan 1), so this is a one-line addition per call site. If the handler spreads `...data` into the payload, no change is needed — verify.

- [ ] **Step 6: Verify + commit**

Run: `npm run typecheck`
Expected: PASS. (`fund` now appears in the category picker; the rate field shows when `fund` is selected.)

```bash
git add src/components/assets/AssetForm.tsx <caller-file>
git commit -m "feat(assets): AssetForm fund category + at_source_tax_rate field"
```

---

### Task 2: Currency group-by axis

**Files:**
- Modify: `src/hooks/usePortfolio.ts` (GroupBy union)
- Modify: `src/lib/portfolio/grouping.ts` (groupByCurrency + switch + fund label)
- Modify: `src/components/portfolio/PortfolioFilters.tsx` (toggle item)

- [ ] **Step 1: Extend the `GroupBy` union**

In `src/hooks/usePortfolio.ts` line 67:

```ts
export type GroupBy = "platform" | "category" | "tag" | "currency"
```

- [ ] **Step 2: Implement `groupByCurrency` + register it**

In `src/lib/portfolio/grouping.ts`:

Add the import (the helper is already used by PortfolioRow, so it's a safe dependency):

```ts
import { assetNativeCurrency } from "@/lib/constants/assets"
```

Add `fund` to `CATEGORY_LABELS` (it's a real category now; line 24–30):

```ts
  fund: "Funds",
```

Add this function next to `groupByCategory` (after line 593):

```ts
function groupByCurrency(
  sortedAssets: EnrichedAsset[],
  ctx: GroupContext,
): AssetGroup[] {
  const { dailyReturnLookups } = ctx
  const map = new Map<string, EnrichedAsset[]>()
  for (const asset of sortedAssets) {
    // assetNativeCurrency needs {category, ticker}; EnrichedAsset has both.
    const key = assetNativeCurrency(asset)
    const existing = map.get(key) ?? []
    existing.push(asset)
    map.set(key, existing)
  }

  const result: AssetGroup[] = []
  for (const [key, groupAssets] of map) {
    result.push(
      rollupGroup({
        key,
        label: key, // the currency code is its own label (USD, TRY, …)
        assets: groupAssets,
        dailyAvailable: dailyReturnLookups.available,
      }),
    )
  }
  return result.sort(byValueDesc)
}
```

Add the case to the `groupAssets` switch (after the `category` case, line 607):

```ts
    case "currency":
      return groupByCurrency(sortedAssets, ctx)
```

- [ ] **Step 3: Add the toggle item**

In `src/components/portfolio/PortfolioFilters.tsx`, in the group-by `ToggleGroup` (after the `category` item, line 83):

```tsx
        <ToggleGroupItem value="currency">Currency</ToggleGroupItem>
```

- [ ] **Step 4: Verify + commit**

Run: `npm run typecheck && npm test`
Expected: PASS (the `GroupBy` switch is now exhaustive with `currency`; existing suite unaffected — grouping is a view transform, not unit-tested in this repo, consistent with its engine-only test scope).

```bash
git add src/hooks/usePortfolio.ts src/lib/portfolio/grouping.ts src/components/portfolio/PortfolioFilters.tsx
git commit -m "feat(portfolio): group-by currency axis"
```

---

### Task 3: After-tax (net) display across the Portfolio page

**Files:**
- Modify: `src/hooks/usePortfolio.ts` (`EnrichedAsset` + `AssetGroup` fields; expose `totalTaxAccrualUsd`)
- Modify: `src/lib/portfolio/grouping.ts` (enrichAsset, scopeAssetToPlatform, rollupGroup)
- Modify: `src/components/portfolio/PortfolioRow.tsx` (desktop row + mobile card)
- Modify: `src/components/portfolio/PortfolioGroupHeader.tsx` (group header)
- Modify: `src/components/portfolio/PortfolioSummaryBar.tsx` (summary bar)

- [ ] **Step 1: Add `taxAccrualUsd` to the view types**

In `src/hooks/usePortfolio.ts`:

`EnrichedAsset` (after `unrealizedPnlPct`, line 44):
```ts
  /** At-source tax accrued on this position's gain, in USD (0 unless the asset
   *  has at_source_tax_rate). After-tax P&L = unrealizedPnlUsd − this. */
  taxAccrualUsd: number
```

`AssetGroup` (after `totalPnlUsd`, line 62):
```ts
  /** Summed at-source tax accrual across the group's assets, in USD. */
  totalTaxAccrualUsd: number
```

`UsePortfolioReturn` (after `totalPnlPct`, line 82):
```ts
  totalTaxAccrualUsd: number
```

- [ ] **Step 2: Populate it in enrichment + platform scoping + rollup**

In `src/lib/portfolio/grouping.ts`:

`enrichAsset` return object (after `unrealizedPnlPct`, ~line 266) — asset-level, from `AssetPnL`:
```ts
    taxAccrualUsd: bn(pnl?.taxAccrualUsd).toNumber(),
```

`scopeAssetToPlatform` return object (after the `unrealizedPnlPct` field, ~line 422) — per-platform, from the matched `HoldingPnL` (which carries its own `taxAccrualUsd`), so platform grouping doesn't double-count:
```ts
    taxAccrualUsd: hp ? hp.taxAccrualUsd.toNumber() : 0,
```

`rollupGroup` — sum it and include in the returned `AssetGroup`. Add the accumulator beside `totalPnlUsdBn` (~line 448):
```ts
  let totalTaxAccrualUsdBn = BN_ZERO
```
inside the `for (const a of assets)` loop:
```ts
    totalTaxAccrualUsdBn = totalTaxAccrualUsdBn.plus(bn(a.taxAccrualUsd))
```
and in the returned object (after `totalPnlUsd`):
```ts
    totalTaxAccrualUsd: totalTaxAccrualUsdBn.toNumber(),
```

- [ ] **Step 3: Expose the portfolio total from the hook**

In `src/hooks/usePortfolio.ts`: pull `totalTaxAccrualUsd` from `usePnL(...)` (add it to the destructure at line 113–126), and return it (it's a `BigNumber` from the engine):
```ts
    totalTaxAccrualUsd: totalTaxAccrualUsd.toNumber(),
```

- [ ] **Step 4: Render net in the desktop row + mobile card**

In `src/components/portfolio/PortfolioRow.tsx`, the after-tax figure applies only in **Total** mode for taxed assets. In `PortfolioRow` (and identically in `PortfolioRowCard`), after the existing `returnUsd`/`returnPct`/`returnIsPositive` lines (~line 90–92), add:

```ts
  const taxed = !isDaily && asset.taxAccrualUsd > 0
  const netUsd = taxed ? returnUsd - asset.taxAccrualUsd : returnUsd
  const netPct =
    taxed && asset.costBasisUsd > 0 ? (netUsd / asset.costBasisUsd) * 100 : returnPct
  const netIsPositive = netUsd >= 0
```

Then in the return cell (`PortfolioRow`, lines 151–166), render net as the headline with a muted gross/tax line when `taxed`:

```tsx
      <TableCell className="text-right">
        {showReturn ? (
          <div className="flex flex-col items-end">
            <span className={gainLossClass(netIsPositive)}>
              {o(formatSignedCurrency(netUsd, "USD"))}
            </span>
            {netPct !== null && (
              <span className={`text-xs ${gainLossClass(netIsPositive)}`}>
                {formatSignedPercent(netPct)}
              </span>
            )}
            {taxed && (
              <span className="text-xs text-muted-foreground">
                gross {o(formatSignedCurrency(returnUsd, "USD"))} ·{" "}
                −{o(formatCurrency(asset.taxAccrualUsd, "USD"))} tax
              </span>
            )}
          </div>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
```

In `PortfolioRowCard` (lines 245–257), do the compact equivalent: show `formatSignedCurrency(netUsd,"USD")` + `(netPct)` as the headline, and when `taxed` append a muted ` · gross {formatSignedCurrency(returnUsd,"USD")}`.

- [ ] **Step 5: Render net in the group header + summary bar**

These two components were not read while writing this plan — **read each first**, then integrate matching its style:

- `src/components/portfolio/PortfolioGroupHeader.tsx`: it renders `group.totalPnlUsd` (around lines 58–66). Compute `const groupNet = group.totalPnlUsd - group.totalTaxAccrualUsd` and render `groupNet` as the headline (color by `groupNet >= 0`); when `group.totalTaxAccrualUsd > 0`, add a small muted `gross {formatSignedCurrency(group.totalPnlUsd,"USD")}`. This keeps "header = sum of visible rows" true, since both are net.
- `src/components/portfolio/PortfolioSummaryBar.tsx`: it shows the lifetime `totalPnlUsd` (from `usePortfolio`). Compute `const netPnl = totalPnlUsd - totalTaxAccrualUsd` and show `netPnl` as the headline P&L; when `totalTaxAccrualUsd > 0`, add a muted `gross {formatSignedCurrency(totalPnlUsd,"USD")} · −{formatCurrency(totalTaxAccrualUsd,"USD")} tax`. (The unrealized/realized split it already shows stays gross — only the headline P&L goes net; note this in a code comment.)

- [ ] **Step 6: Verify + commit**

Run: `npm run typecheck && npm test`
Expected: PASS. Then a visual check on prod after deploy (this is view code; the project verifies UI by commit → push → prod).

```bash
git add src/hooks/usePortfolio.ts src/lib/portfolio/grouping.ts src/components/portfolio/PortfolioRow.tsx src/components/portfolio/PortfolioGroupHeader.tsx src/components/portfolio/PortfolioSummaryBar.tsx
git commit -m "feat(portfolio): after-tax (net) P&L display — rows, group headers, summary bar"
```

---

### Task 4: Docs sync

**Files:** `docs/components/08-portfolio-page.md` (+ technical), `docs/components/03-platform-asset-management.md` (+ technical)

- [ ] **Step 1:** In `08-portfolio-page.md` behavioral spec: add `currency` to the grouping axes ("Group by Platform, category, tag, **or currency**"), and a short rule: "For assets with an at-source tax (a PPF), the return shown is **after-tax** (gross shown beside it) — net rolls up through group headers and the summary bar so totals stay consistent." Add an acceptance checkbox. Mirror in the technical doc (the `currency` axis = `groupByCurrency` keyed on `assetNativeCurrency`; `taxAccrualUsd` threaded through `EnrichedAsset`/`AssetGroup`).

- [ ] **Step 2:** In `03-platform-asset-management.md` (+ technical): note the `fund` category and the optional `at_source_tax_rate` asset field set via AssetForm (shown for `fund`).

- [ ] **Step 3:** Commit:
```bash
git add docs/components/08-portfolio-page.md docs/components/technical/08-portfolio-page.md docs/components/03-platform-asset-management.md docs/components/technical/03-platform-asset-management.md
git commit -m "docs(portfolio): currency group-by + after-tax display"
```

---

## Deferred to Plan 3 (dashboard work)

- The per-currency **dashboard echo** card ("what each currency earned") — `useDashboard` `byCurrency` + a `CurrencyBreakdown` component mirroring `PlatformBreakdown`.
- The **22k foreign-income** badge/progress + `sonner` notification (reads `computeForeignIncomeTry` from Plan 1).
- After-tax on the **dashboard hero** headline (mirror the summary-bar treatment).

## Notes

- Net is shown only in **Total** mode; daily return stays gross (no per-day tax delta). Documented in Task 3.
- `taxAccrualUsd` is correctly per-(asset,platform) at the holding level (engine) and per-asset at the asset level, so both the platform grouping (uses `HoldingPnL`) and other groupings (use `AssetPnL`) scope tax without double-counting.
- No new Vitest: this is view-model/UI work, and the repo tests only the pure P&L engine. The numbers being displayed (`taxAccrualUsd`) are already engine-tested in Plan 1.
