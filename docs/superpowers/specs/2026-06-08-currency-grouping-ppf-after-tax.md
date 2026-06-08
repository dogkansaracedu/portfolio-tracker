# Currency-grouped view, PPF after-tax P&L, and the 22k heads-up — Design

> Status: draft for review · Date: 2026-06-08
> Layer: design spec. On approval, the behavioral/technical component docs
> (04 transactions, 06 P&L engine, 07 dashboard, 08 portfolio, GLOSSARY) and the
> Vitest cases get updated in the same change set — per `CLAUDE.md`.

## Motivation

Three connected wants, surfaced while comparing bonds / PPF / Midas USD interest:

1. **"Did my cash just sit there?"** — make the return (or non-return) of money
   parked in each currency visible, and relate income vehicles (PPF, bond/ETF
   coupons, Midas USD interest) back to the fiat they came from.
2. **PPF is taxed at source.** Its NAV is gross, but 17.5% of every lira of gain
   is withheld at redemption. Adding the *gross* gain to P&L overstates money the
   user will never receive. The displayed gain must be **after-tax** (₺1,000 →
   ₺825), with gross shown beside it.
3. **The 22k line.** Foreign (non-withheld) dividend + interest, summed in TRY for
   the calendar year, must be visible against the **22,000 TL** declaration
   threshold, with a simple in-app notification when crossed. A lightweight
   heads-up — *not* a tax-calculation engine.

## The resolved model

Income reaches the book two ways, and every vehicle is a combination of them:

- **(A) Value-tracked** — an asset with a price/value series (like a stock). The
  return *is* the appreciation. PPF and accumulating funds are pure (A).
- **(B) Income transactions** — explicit `dividend` / `interest` rows the user
  enters (the existing received-as cash/units txns). Midas's monthly USD interest
  is pure (B).
- **Bonds / bond-ETFs = (A) + (B):** a value-tracked holding *plus* coupon
  `interest` txns when they distribute. Nothing new to model — it reuses both
  mechanisms already in the code.

This maps cleanly onto tax: a distributing coupon (B) is declarable foreign
income (feeds the 22k); an accumulating fund's NAV growth (A) is capital
appreciation; PPF's NAV growth (A) is taxed at source.

## Goals

- A **currency** grouping in the Portfolio page: collapsible currency parent →
  the vehicles that currency holds, each with its return; idle cash needs no
  special row.
- **After-tax P&L** for assets that carry a fixed at-source tax rate (PPF today),
  shown net with gross alongside — computed in the engine, not the view.
- A **YTD foreign-income-in-TRY** figure vs 22,000 TL: a row annotation + a simple
  in-app notification when crossed.
- A small **dashboard** echo: per-currency earned + the 22k progress.

## Non-goals (explicitly out of scope)

- **Inflation-corrected P&L** — deferred (user's call), future work.
- **Tax math for foreign assets** (US stocks / dividends / interest stay gross).
  No progressive-rate calc, no Yİ-ÜFE indexing, no suggestion engine. The door is
  open to fuller foreign-tax tracking *later* — flagged, not built now.
- Auto-detecting tax rates. The PPF rate is user-set config (it changed
  0 → 7.5 → 17.5 in two years).

## Component 1 — Asset model

**1a. PPF gets its own category.** Extend `ASSET_CATEGORIES`
(`src/lib/constants/assets.ts`) with a `fund` category (PPF is the first
instance). Extend `assetNativeCurrency()` so `fund` resolves to **TRY** for now
(PPF is TRY-native). US bond-ETFs need no new category — they are US-listed,
value-tracked securities and fit `stock_us` + distribution `interest` txns;
a dedicated `bond` category is a possible later refinement, not required here.

**1b. Optional at-source tax rate, per asset.** Add a nullable
`at_source_tax_rate` (decimal, e.g. `0.175`) column to the `assets` table
(Supabase migration) and to the `Asset` / `HoldingWithDetails.assets` types. When
set, the engine shows the asset's gain net of this rate. Unset (US assets, crypto,
etc.) → gross, unchanged behavior.

**1c. Foreign-income classification (for the 22k only).** An income txn counts
toward the 22k when it is **foreign and not withheld at source**. Derive the
default from the asset (foreign/USD-native *and* no `at_source_tax_rate` →
declarable; PPF/BIST or any asset with an at-source rate → excluded), with room
for a per-asset override later. PPF is therefore excluded from the 22k count by
construction.

## Component 2 — Engine (`computePortfolioPnL`)

**2a. After-tax as an additive overlay (preserves the invariant).** `usePnL`
asserts `value − netInvested == unrealized + realized + income`. After-tax must
**not** mutate `unrealizedPnlUsd`, or that breaks. Instead:

- Per asset with an `at_source_tax_rate`, compute a **tax accrual**:
  `taxAccrualNative = rate × max(unrealizedNativeGain, 0)` — on the **native**
  (TRY) gain, gains only (a loss isn't taxed). Convert to USD at the current rate
  → `taxAccrualUsd`. (Approximation noted: a current liability valued at the
  current FX rate; exact only at redemption. Fine for a monotonic money-market
  NAV.)
- Add new output fields: per-asset `taxAccrualUsd`, and portfolio
  `totalTaxAccrualUsd`. Derive the displayed **after-tax** total as
  `afterTaxTotalPnl = grossTotalPnl − totalTaxAccrualUsd`.
- The existing gross decomposition and its invariant stay intact; after-tax is a
  presentation-layer choice over `(gross, taxAccrual)`.
- **Realized symmetry:** the same rate applies to *realized* PPF gains booked on
  redemption (the engine already exposes per-sell `nativePnl`), so the tax accrual
  covers held + sold gains and after-tax stays consistent across a partial sale.
- Computing `unrealizedNativeGain` needs the asset's **native** current value
  (TRY), available from `price_cache.price_try`; it pairs with the existing
  `costBasisNative` / `nativeCurrency` fields on `AssetPnL`.

**2b. Foreign income in TRY, by tax year.** New pure helper alongside
`computeIncomeUsd` (`src/lib/pnl/income.ts`): sum `dividend` + `interest` txns
that are **foreign-declarable** (per 1c), each converted to **TRY** at its own
transaction-date rate, filtered to a given calendar year. Returns the YTD total
that the 22k annotation reads.

## Component 3 — Currency grouping (Portfolio page, primary home)

The Portfolio page already groups by platform / category / tag with subtotal
headers and a per-group rollup (see `docs/components/08-portfolio-page.md`).

- Add **`currency`** as a new group-by axis. Group key = `assetNativeCurrency()`.
- Each currency group header shows the currency's rolled-up value + return
  (reusing the existing "group header = sum of visible rows" rollup). Children are
  the vehicles. PPF appears under **TRY**, framed as its yield — the "see it as
  interest over TRY" view, even though under the hood it's a value-tracked asset.
- No idle-cash row: leftover cash is just the currency's cash holding; idle USD's
  ~$0 return is self-evident and needs no dedicated line.
- Pure view-layer regrouping of existing per-asset P&L — no new P&L math beyond
  Component 2.

## Component 4 — The 22k annotation + notification

- **Annotation:** a small progress indicator (e.g. `₺18,400 / 22,000`) on the
  foreign-income rows / currency group and on the dashboard, fed by 2b for the
  current calendar year.
- **Notification:** a simple in-app banner when the YTD foreign-income total
  crosses 22,000 TL. No suggestions, no blocking.
- **Threshold is config** (`22000` for 2026) — it revalues yearly.

## Display: gross vs after-tax

- Value column may stay **gross NAV** for PPF (the quoted day value).
- The return cell shows the **after-tax** figure as the headline, with the
  **gross** beside it (e.g. `+₺825` with a muted `+₺1,000 / −₺175 tax`), reusing
  the gain/loss palette + signed formatters from `lib/prices`.
- The portfolio summary/headline P&L uses the **after-tax** total
  (`afterTaxTotalPnl`); gross remains available for the breakdown.

## Data flow

`assets` (+`at_source_tax_rate`, `fund` category) → `computePortfolioPnL`
(gross decomposition **+** `taxAccrualUsd` overlay) → `usePnL` (invariant still on
gross) → Portfolio page (currency group-by, after-tax display) + Dashboard
(per-currency echo). Separately: txns → `computeForeignIncomeTry(year)` → 22k
annotation + notification.

## Docs + tests to update in the implementation change (CLAUDE.md)

- **06 P&L engine** (behavioral + technical): the after-tax overlay rule, the
  preserved invariant, the native-gain basis, the foreign-income-in-TRY helper.
- **08 Portfolio page**: the `currency` group-by axis + after-tax return display.
- **07 Dashboard**: the per-currency echo + 22k progress.
- **04 Transaction system / 03 asset management**: `fund` category +
  `at_source_tax_rate`; foreign-declarable classification.
- **GLOSSARY**: define "at-source tax", "after-tax P&L", "foreign-declarable
  income", "22k threshold".
- **Vitest** (`src/lib/pnl/cases.test.ts`): a PPF case (₺1,000 gross gain → ₺825
  after-tax, gross decomposition + invariant unchanged); a foreign-income-in-TRY
  sum case across a year boundary; a case asserting PPF is excluded from the 22k.

## Open questions for the planning step

1. `fund` native currency: hard-wire TRY now, or make it a per-asset field so a
   future USD fund works? (Lean: TRY now, generalize when needed.)
2. Notification surface: a dismissible top banner vs a badge on the dashboard
   card. (Lean: dashboard badge + one banner on cross.)
3. Bonds: keep modeling US bond-ETFs as `stock_us` + interest txns, or add a
   `bond` category for clearer grouping? (Lean: reuse `stock_us` for now.)
