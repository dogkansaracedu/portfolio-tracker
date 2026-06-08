# Dashboard: Per-Currency Echo + 22k Heads-up + Hero After-Tax — Plan 3 of 3

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the feature on the Dashboard: a per-currency "what each currency holds/earned" card, a 22,000 TL foreign-income heads-up (badge + one-shot in-app notification), and after-tax as the hero's headline P&L (gross beside it).

**Architecture:** Pure view-model work over already-shipped engine pieces — `computeForeignIncomeTry` + `foreignDeclarableAssetIds` (Plan 1) and `totalTaxAccrualUsd` (Plan 1). Per-currency allocation is derived from the latest snapshot's `by_asset` + `assetNativeCurrency` (same pattern as `deriveTopMovers`). No new money math.

**Tech Stack:** React 19, TS, bignumber.js (engine), shadcn/base-ui cards, `sonner` toasts (already mounted in `main.tsx`). Tests: engine-only in this repo, so UI tasks verify via `npm run typecheck` + the existing suite.

**Depends on:** Plan 1 (foreign-income helpers, `taxAccrualUsd`) + Plan 2 (after-tax display patterns). **Runtime depends on the Plan-1 migration being applied.**

**Commands:** typecheck `npm run typecheck` · tests `npm test`.

---

### Task 1: Threshold constant + foreign-income-YTD hook

**Files:**
- Create: `src/lib/constants/tax.ts`
- Create: `src/hooks/useForeignIncomeYtd.ts`

- [ ] **Step 1: Constant**

Create `src/lib/constants/tax.ts`:

```ts
/**
 * Turkish annual declaration threshold (GVK 86/1-d) for FOREIGN, non-withheld
 * dividend + interest income, in TRY. Below it, no declaration; cross it and the
 * whole amount must be declared. Revalues yearly — 18,000 (2025) → 22,000 (2026).
 * Verify the current figure each tax year. PPF (withheld at source) does NOT
 * count toward this.
 */
export const FOREIGN_INCOME_DECLARATION_THRESHOLD_TRY = 22000
```

- [ ] **Step 2: Hook**

Create `src/hooks/useForeignIncomeYtd.ts`:

```ts
import { useMemo } from "react"
import { homeDayIso } from "@/lib/config"
import { useAssets } from "@/hooks/useAssets"
import { useTransactionData } from "@/contexts/TransactionDataContext"
import {
  computeForeignIncomeTry,
  foreignDeclarableAssetIds,
} from "@/lib/pnl/foreign-income"
import { FOREIGN_INCOME_DECLARATION_THRESHOLD_TRY } from "@/lib/constants/tax"

export interface ForeignIncomeYtd {
  /** Foreign, non-withheld dividend+interest YTD, converted to TRY. */
  ytdTry: number
  threshold: number
  /** Calendar (tax) year this covers, e.g. 2026. */
  year: number
  /** ytd / threshold × 100 (can exceed 100). */
  pct: number
  /** True once ytdTry exceeds the threshold. */
  crossed: boolean
  loading: boolean
}

/**
 * Year-to-date foreign-declarable income vs the Turkish 22k threshold. Wires the
 * Plan-1 pure helpers to live data; the calendar year comes from the portfolio's
 * home timezone (homeDayIso) so it flips at the right local midnight.
 */
export function useForeignIncomeYtd(): ForeignIncomeYtd {
  const { assets, loading: assetsLoading } = useAssets()
  const { transactions, rates, loading: txLoading } = useTransactionData()
  const threshold = FOREIGN_INCOME_DECLARATION_THRESHOLD_TRY
  const year = Number(homeDayIso().slice(0, 4))

  return useMemo(() => {
    const declarable = foreignDeclarableAssetIds(assets)
    const ytdTry = computeForeignIncomeTry(
      transactions,
      rates,
      year,
      declarable,
    ).toNumber()
    return {
      ytdTry,
      threshold,
      year,
      pct: threshold > 0 ? (ytdTry / threshold) * 100 : 0,
      crossed: ytdTry > threshold,
      loading: assetsLoading || txLoading,
    }
  }, [assets, transactions, rates, year, threshold, assetsLoading, txLoading])
}
```

- [ ] **Step 3: Verify + commit**

Run: `npm run typecheck`
Expected: PASS. (No new unit test — this hook only wires Plan-1 functions that are already engine-tested.)

```bash
git add src/lib/constants/tax.ts src/hooks/useForeignIncomeYtd.ts
git commit -m "feat(dashboard): foreign-income-YTD hook + 22k threshold constant"
```

---

### Task 2: Per-currency allocation + CurrencyBreakdown card

**Files:**
- Modify: `src/hooks/useDashboard.ts` (CurrencyAllocation + deriveByCurrency + wire)
- Create: `src/components/dashboard/CurrencyBreakdown.tsx`
- Modify: `src/pages/DashboardPage.tsx` (render it)

- [ ] **Step 1: `useDashboard.ts` — interface + helper + wiring**

Add the import (top of file, with the other imports):
```ts
import { assetNativeCurrency } from "@/lib/constants/assets"
```

Add the interface (near the other allocation interfaces):
```ts
export interface CurrencyAllocation {
  currency: string
  valueUsd: number
  valueTry: number
  percentage: number
}
```

Add `byCurrency: CurrencyAllocation[]` to the `DashboardData` interface (after `byTag`).

Add this helper (near `deriveTopMovers`):
```ts
/**
 * Per-native-currency allocation from the snapshot's per-asset values. Each
 * by_asset entry is mapped to its asset's native currency (assetNativeCurrency)
 * and summed. Mirrors deriveTopMovers' ticker→asset join.
 */
function deriveByCurrency(
  byAsset: SnapshotBreakdown["by_asset"],
  assets: Asset[],
  totalValueUsd: number,
): CurrencyAllocation[] {
  const assetByTicker = new Map<string, Asset>()
  for (const a of assets) assetByTicker.set(a.ticker, a)

  const acc = new Map<string, { usd: number; try: number }>()
  for (const e of byAsset) {
    const asset = assetByTicker.get(e.ticker)
    const currency = asset ? assetNativeCurrency(asset) : "USD"
    const cur = acc.get(currency) ?? { usd: 0, try: 0 }
    cur.usd += e.value_usd
    cur.try += e.value_try
    acc.set(currency, cur)
  }

  return [...acc.entries()]
    .map(([currency, v]) => ({
      currency,
      valueUsd: v.usd,
      valueTry: v.try,
      percentage: totalValueUsd > 0 ? (v.usd / totalValueUsd) * 100 : 0,
    }))
    .sort((a, b) => b.valueUsd - a.valueUsd)
}
```

In the `useMemo` body: add `byCurrency: []` to the `empty` object; compute `const byCurrency = deriveByCurrency(breakdown.by_asset, assets, totalValueUsd)` after `topMovers`; add `byCurrency` to the returned object.

- [ ] **Step 2: Create `src/components/dashboard/CurrencyBreakdown.tsx`** (mirrors `PlatformBreakdown`, with a per-currency color that avoids the gain/loss emerald/red):

```tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useDisplayCurrency } from "@/contexts/DisplayContext"
import { formatCurrency, obfuscate } from "@/lib/prices"
import type { CurrencyAllocation } from "@/hooks/useDashboard"

interface CurrencyBreakdownProps {
  byCurrency: CurrencyAllocation[]
}

// Distinct hues per currency, deliberately NOT the gain/loss emerald/red.
const CURRENCY_COLORS: Record<string, string> = {
  USD: "#3b82f6", // blue-500
  TRY: "#f59e0b", // amber-500
  EUR: "#8b5cf6", // violet-500
}
const FALLBACK_COLOR = "#64748b" // slate-500

export default function CurrencyBreakdown({
  byCurrency,
}: CurrencyBreakdownProps) {
  const { currency, obfuscated } = useDisplayCurrency()
  const o = (v: string) => obfuscate(v, obfuscated)

  if (byCurrency.length === 0) {
    return (
      <Card className="flex flex-col">
        <CardHeader>
          <CardTitle>Currencies</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-1 items-center justify-center">
          <p className="text-muted-foreground">No currencies to display.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="flex flex-col">
      <CardHeader>
        <CardTitle>Currencies</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {byCurrency.map((c) => {
          const value = currency === "USD" ? c.valueUsd : c.valueTry
          const color = CURRENCY_COLORS[c.currency] ?? FALLBACK_COLOR
          return (
            <div key={c.currency} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span
                    className="inline-block h-3 w-3 rounded-full"
                    style={{ backgroundColor: color }}
                  />
                  <span className="font-medium">{c.currency}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">
                    {c.percentage.toFixed(1)}%
                  </span>
                  <span className="font-medium">
                    {o(formatCurrency(value, currency))}
                  </span>
                </div>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.max(c.percentage, 1)}%`,
                    backgroundColor: color,
                  }}
                />
              </div>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 3: Wire into `DashboardPage.tsx`**

Add the import:
```ts
import CurrencyBreakdown from "@/components/dashboard/CurrencyBreakdown"
```
Add `byCurrency` to the `useDashboard()` destructure. Add a new grid row after the PlatformBreakdown/TopMovers grid (the ForeignIncomeCard from Task 3 will join it):
```tsx
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <CurrencyBreakdown byCurrency={byCurrency} />
        {/* ForeignIncomeCard added in Task 3 */}
      </div>
```

- [ ] **Step 4: Verify + commit**

Run: `npm run typecheck && npm test` → PASS.
```bash
git add src/hooks/useDashboard.ts src/components/dashboard/CurrencyBreakdown.tsx src/pages/DashboardPage.tsx
git commit -m "feat(dashboard): per-currency allocation breakdown card"
```

---

### Task 3: 22k foreign-income card + one-shot notification

**Files:**
- Create: `src/components/dashboard/ForeignIncomeCard.tsx`
- Modify: `src/pages/DashboardPage.tsx` (render it beside CurrencyBreakdown)

- [ ] **Step 1: Create `src/components/dashboard/ForeignIncomeCard.tsx`**

```tsx
import { useEffect } from "react"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatCurrency } from "@/lib/prices"
import { useForeignIncomeYtd } from "@/hooks/useForeignIncomeYtd"

export default function ForeignIncomeCard() {
  const { ytdTry, threshold, year, pct, crossed, loading } =
    useForeignIncomeYtd()

  // One-shot per tax year per browser: nudge the first time the threshold is
  // crossed, then remember so we don't re-toast on every render/visit.
  useEffect(() => {
    if (loading || !crossed) return
    const key = `foreign-income-notified-${year}`
    if (localStorage.getItem(key)) return
    localStorage.setItem(key, "1")
    toast.warning(`Foreign income over ₺${threshold.toLocaleString("tr-TR")}`, {
      description:
        `Your ${year} foreign dividends + interest crossed the declaration ` +
        `threshold. It now has to go on next March's beyanname.`,
    })
  }, [loading, crossed, year, threshold])

  const barColor = crossed
    ? "bg-red-500"
    : pct >= 80
      ? "bg-amber-500"
      : "bg-primary"

  return (
    <Card className="flex flex-col">
      <CardHeader>
        <CardTitle>Foreign income · {year}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex items-baseline justify-between">
          <span className="text-lg font-semibold tabular-nums">
            {formatCurrency(ytdTry, "TRY")}
          </span>
          <span className="text-sm text-muted-foreground">
            / {formatCurrency(threshold, "TRY")} ({pct.toFixed(0)}%)
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full rounded-full transition-all ${barColor}`}
            style={{ width: `${Math.min(pct, 100)}%` }}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Foreign (non-TRY) dividends + interest count toward the{" "}
          {formatCurrency(threshold, "TRY")} declaration threshold. PPF and other
          at-source-taxed income don't count.
        </p>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 2: Render it beside CurrencyBreakdown** in `DashboardPage.tsx`:

Add the import, and put it in the grid cell next to CurrencyBreakdown (replacing the Task-2 placeholder comment):
```tsx
import ForeignIncomeCard from "@/components/dashboard/ForeignIncomeCard"
```
```tsx
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <CurrencyBreakdown byCurrency={byCurrency} />
        <ForeignIncomeCard />
      </div>
```

- [ ] **Step 3: Verify + commit**

Run: `npm run typecheck && npm test` → PASS.
```bash
git add src/components/dashboard/ForeignIncomeCard.tsx src/pages/DashboardPage.tsx
git commit -m "feat(dashboard): 22k foreign-income heads-up card + one-shot notification"
```

---

### Task 4: After-tax on the dashboard hero headline

**Files:**
- Modify: `src/hooks/usePnLSummary.ts` (expose tax accrual + net)
- Modify: `src/pages/DashboardPage.tsx` (pass to hero)
- Modify: the DashboardHero component (loaded via `src/components/charts/LazyChart.tsx` — **find + read it first**)

- [ ] **Step 1: `usePnLSummary.ts` — expose the tax accrual + after-tax totals**

Add `totalTaxAccrualUsd` to the destructure from `usePnL(holdings, prices)`. Add to the `PnLSummary` interface (after `totalPnlPct`):
```ts
  /** At-source tax accrued (USD). After-tax headline = totalPnlUsd − this. */
  totalTaxAccrualUsd: number
  totalPnlAfterTaxUsd: number
  totalPnlAfterTaxTry: number
```
In the returned object compute:
```ts
      totalTaxAccrualUsd: totalTaxAccrualUsd.toNumber(),
      totalPnlAfterTaxUsd: totalPnlUsd.minus(totalTaxAccrualUsd).toNumber(),
      totalPnlAfterTaxTry: totalPnlUsd.minus(totalTaxAccrualUsd).times(rate).toNumber(),
```
(`totalPnlUsd` is the BigNumber from `summarizePnLTotals`; add `totalTaxAccrualUsd` to the `useMemo` deps.)

- [ ] **Step 2: Pass to the hero in `DashboardPage.tsx`**

Pull `totalPnlAfterTaxUsd`, `totalPnlAfterTaxTry`, `totalTaxAccrualUsd` from `usePnLSummary()` and pass them as props to `<DashboardHero .../>` (alongside the existing `totalPnlUsd`/`totalPnlTry`).

- [ ] **Step 3: Render net in the hero — READ the component first**

Find the real DashboardHero (it's re-exported by `src/components/charts/LazyChart.tsx` — follow that import to the source file) and read it. Where it renders the headline P&L (currently `totalPnlUsd`/`totalPnlTry`), show the **after-tax** value as the headline; when `totalTaxAccrualUsd > 0`, add a small muted line `gross {formatSignedCurrency(totalPnlUsd, displayCurrency)} · −{formatCurrency(taxInDisplayCurrency)} tax`. Add the new props to the hero's prop type. Match the hero's existing formatter usage + display-currency handling. If the hero's P&L % is shown, leave it as-is (the % stays gross unless trivially derivable — note this in a comment).

- [ ] **Step 4: Verify + commit**

Run: `npm run typecheck && npm test` → PASS.
```bash
git add src/hooks/usePnLSummary.ts src/pages/DashboardPage.tsx <hero-file>
git commit -m "feat(dashboard): after-tax headline P&L on the hero"
```

---

### Task 5: Docs sync (07 dashboard)

**Files:** `docs/components/07-dashboard.md` (+ technical)

- [ ] **Step 1:** Behavioral (07): add the **per-currency breakdown**, the **foreign-income heads-up** ("YTD foreign dividend+interest vs the 22,000 TL declaration threshold, with a one-time in-app notification when crossed; PPF excluded"), and the **after-tax hero headline** ("the headline P&L is shown net of at-source tax, gross beside it"). Add acceptance checkboxes.

- [ ] **Step 2:** Technical (07): name `useForeignIncomeYtd` + `FOREIGN_INCOME_DECLARATION_THRESHOLD_TRY`, `deriveByCurrency`/`CurrencyAllocation` in `useDashboard`, `CurrencyBreakdown`/`ForeignIncomeCard` components, the `sonner` one-shot guard (localStorage `foreign-income-notified-<year>`), and `usePnLSummary`'s `totalPnlAfterTax*`.

- [ ] **Step 3:** Commit:
```bash
git add docs/components/07-dashboard.md docs/components/technical/07-dashboard.md
git commit -m "docs(dashboard): per-currency + 22k heads-up + after-tax hero"
```

---

## Notes / decisions

- **No new Vitest:** all tasks are view-model/UI; the underlying money (`computeForeignIncomeTry`, `taxAccrualUsd`) is already engine-tested (Plan 1). Verification is typecheck + the existing suite + visual-on-prod.
- **Notification is one-shot per tax year per browser** (localStorage `foreign-income-notified-<year>`), so it nudges once on crossing, not every load. It resets naturally each year.
- **Threshold is a constant** (`22000`, 2026) — revalues yearly; documented as such. A future enhancement could make it a per-year map.
- **byCurrency** is derived from the snapshot's `by_asset` (the dashboard's single source of truth), not recomputed from holdings — consistent with how every other dashboard breakdown works.
- After this plan, the full feature (Plans 1–3) is code-complete; the remaining step is **deploy** (apply the Plan-1 migration to Supabase, then push to Vercel).
```
