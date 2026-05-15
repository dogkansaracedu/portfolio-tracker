# Fiat-as-System-Currency + Transfer Cost UX

**Date:** 2026-05-15
**Status:** Spec — pending user review

## Problem

Two tangled issues surfaced from the P&L divergence incident:

1. **Transfer cost is never collected by the UI.** `AddTransactionModal` excludes `transfer_in`/`transfer_out` from `showPriceFields`, so submits write whatever's in state — usually `unit_price = 0`, `total_cost = 0`. The Mar 3 2025 transfer_in USD 2000 row landed with `total_cost = 0`, which made `applyTxToInvested` undercount invested by $2,000 and inflated the dashboard hero P&L by the same amount. The schema has no CHECK constraint preventing this, so any code path can reintroduce it.

2. **Category overloads two concepts.** `assets.category` is currently doing double duty:
   - *Technical class* — "fiat" triggers a P&L short-circuit (`costBasis = currentValue`, FIFO bypassed) in `usePnL`.
   - *Allocation intent* — USDT/USDC are stored as `category="fiat"` so they bucket as cash for the user's mental "30% cash buffer" workflow.

   The overload means USDT can't be tracked accurately. It's `category="fiat"` so its real CoinGecko price is ignored and depegs would be silently hidden, but the user thinks of it as cash-like for allocation. The two concerns belong in two different fields.

The handoff document `docs/pnl-divergence-handoff.md` hypothesized unpaired sells/transfer_outs were the cause. Investigation showed every `linked_tx_id` pair was intact; the actual root cause was the single bad `total_cost` field. That doc is now stale and should be removed when this spec lands.

## Goals

- Make zero-cost `transfer_in` structurally impossible (UI auto-fills + DB CHECK).
- Separate "is this a currency?" from "what bucket does this live in on my dashboard?"
- Treat USDT/USDC as real crypto assets — full FIFO, market price, P&L surfaced — without changing how they appear in the dashboard's allocation view.
- Keep the schema and code paths simple enough that adding the user's planned APR-tracking on stablecoins requires no further schema work.
- Minimize the data-entry friction introduced by moving USDT/USDC out of the fiat short-circuit, by pre-filling `unit_price` from the latest cached market price.

## Non-goals

- FX P&L on TRY/EUR (the "true hybrid" model the user opted out of earlier).
- Auto-accrual of yield on stablecoins (future work; this design just makes the data shape support it).
- A constrained `bucket`/`allocation_tag` column. Tags remain free-form for now; promote to a constrained column only if discipline-based tagging becomes annoying.

## Design

### Schema changes

```sql
ALTER TABLE public.assets
  ADD COLUMN is_currency boolean NOT NULL DEFAULT false,
  ADD COLUMN denomination text NOT NULL DEFAULT 'USD';

ALTER TABLE public.assets
  ADD CONSTRAINT denomination_supported
    CHECK (denomination IN ('USD','TRY','EUR')),
  ADD CONSTRAINT currency_self_denominated
    CHECK (NOT is_currency OR denomination = ticker);

ALTER TABLE public.transactions
  ADD CONSTRAINT transfer_in_has_cost
    CHECK (type <> 'transfer_in' OR total_cost > 0);
```

Data migration:

- USD, TRY, EUR rows → `is_currency=true`, `denomination=self`. `category` stays `'fiat'` (descriptive only; no code depends on it anymore — see "P&L code" below).
- USDT (`ticker='tether'`), USDC (`ticker='usd-coin'`) → `category='crypto'`, `denomination='USD'`. User opt-in: append `'cash'` to `tags` if they want the dashboard to bucket them as cash. (Recommended, but not enforced.)
- All other rows: `is_currency=false`, `denomination='USD'` (already the default). Existing `category` values (`stock_us`, `crypto`, `gold`, etc.) are not touched.

`category` is now purely descriptive metadata — no code path branches on it after this spec. Behavior comes from `is_currency` (does the fiat short-circuit apply?) and `denomination` (what currency is this priced in?).

### P&L code

`src/hooks/usePnL.ts` currently short-circuits on `if (category === "fiat")`. Change to `if (asset.is_currency)`. Only the 3 system rows skip FIFO; USDT/USDC go through it like BTC. Side-effect: small unrealized P&L will start appearing on USDT/USDC positions from CoinGecko's ±0.05% daily price drift. That is the correct behavior — depegs will now be visible.

`src/lib/performance.ts:applyTxToInvested` needs no logic change. The function already does the right thing per type; the bug was data-side (zero `total_cost`).

### Transfer cost auto-fill in the modal

`AddTransactionModal` currently hides price fields for transfers. New behavior:

- **transfer_in / transfer_out of an asset where `is_currency=true` OR `category='currency'`:**
  - Auto-fill `unit_price = 1`, `total_cost = amount`, `price_currency = asset.denomination`.
  - Render a read-only "Cost basis: {symbol}{amount} (auto)" line so the user sees what's being recorded.

- **transfer_out of any other asset, with the auto-paired transfer_in:**
  - Call `computeTransferCostBasis(transactions, rates, amount)` from `src/lib/pnl/fifo.ts` on the source platform's prior buys.
  - Auto-fill `unit_price` = the weighted-average cost it returns; `total_cost = amount * unit_price`; `price_currency = asset.denomination`.
  - Render the same read-only line.
  - Apply the same values to the auto-created transfer_in on the destination.

- **Lone transfer_in of a non-currency asset (opening balance):**
  - Show editable `unit_price` and `price_currency` fields, defaulted to the asset's `denomination`.
  - Required: `total_cost > 0` (enforced by the new DB CHECK; the modal validates client-side too with a clear error message).

The modal already has `selectedAsset` in scope; reading `selectedAsset.is_currency` and `selectedAsset.denomination` is a one-line change in the existing effect that controls field visibility.

### Unit price prefill from price cache

Once USDT/USDC are out of the fiat short-circuit, the user has to enter a real `unit_price` for every USDT/USDC `buy`/`sell`/`interest` transaction (and lone opening-balance `transfer_in`). In the old model the value was ignored, so no entry was needed. To keep entry frictionless without re-introducing special cases:

- On asset selection, the modal reads the latest cached price from `price_cache` (joined to the selected asset's ticker) and pre-fills `unit_price` with that value.
- For USDT/USDC this lands at ≈ `1.00` automatically — the user types nothing if the day's price is at par.
- For BTC/AAPL/etc. it lands at the current market price — also a useful default; the user adjusts if they paid more or less.
- If `price_cache` has no entry for the ticker (new asset, cold cache), the field stays empty and the user types as today.
- The prefill is a one-time hint on asset change. It is not re-applied as the cache refreshes, and the user can always type over it. This is generic — no hardcoded "USDT = 1" rule.

This is the single mitigation for the entry-friction the FIFO promotion introduces, and it incidentally improves entry for every other asset too.

### Asset form

`src/components/assets/AssetForm.tsx` needs two changes:

- Hide the `is_currency=true` rows entirely from the asset-list edit/delete affordances. There is no `is_currency` toggle in the form — that flag is set only by the seed function. Users can read system rows but not mutate them.
- Add a `denomination` dropdown (USD / TRY / EUR), shown for all assets the user can create, defaulted to `USD`.

System currency rows are hidden from the asset-list edit/delete affordances. (Read-only display is fine — the user can still see USD, TRY, EUR exist; they just can't mutate them.)

### Dashboard allocation view

No structural change required for this spec — the user's existing `TagBreakdown` component already groups by tag. After this spec lands, the user's data flow is:

- Apply `'cash'` tag to any asset they want bucketed as cash (USD, TRY, EUR, USDT, USDC).
- Apply `'stock_us'`, `'stock_tr'`, `'crypto'`, `'gold'`, etc. as bucket tags on the rest.
- The dashboard shows "% per tag" naturally.

If discipline-driven tagging becomes annoying (typos, forgotten tags), the follow-up is to promote one tag to a constrained `allocation_tag` column. Out of scope here.

### Seed function

`supabase/migrations/20260402100010_seed_function.sql` seeds USD, TRY, EUR at signup. Update the seed to set `is_currency=true` and `denomination=ticker` on those rows. `category` stays `'fiat'`.

## Component impact

| File | Change |
|---|---|
| `supabase/migrations/<new>_fiat_system_currency.sql` | Schema additions, CHECKs, data backfill (USD/TRY/EUR → is_currency, USDT/USDC → category='crypto'). |
| `supabase/migrations/20260402100010_seed_function.sql` | Update seed to set `is_currency=true` and `denomination=ticker` on USD/TRY/EUR; `category` stays `'fiat'`. |
| `src/types/database.ts` | Add `is_currency: boolean` and `denomination: 'USD' \| 'TRY' \| 'EUR'` to the Asset interface. |
| `src/hooks/usePnL.ts` | Replace `category === "fiat"` short-circuit with `asset.is_currency`. |
| `src/components/transactions/AddTransactionModal.tsx` | (a) Show & auto-fill cost fields for transfers per the rules above. Wire `computeTransferCostBasis` for non-currency paired transfers. (b) Pre-fill `unit_price` from `price_cache` on asset change for buy/sell/interest/dividend/lone-transfer_in. |
| `src/components/assets/AssetForm.tsx` | Add `denomination` dropdown for new assets, defaulted to `USD`. |
| `src/components/assets/AssetList.tsx` (or equivalent) | Hide edit/delete affordances on `is_currency=true` rows. |
| `docs/pnl-divergence-handoff.md` | Delete (resolved). |

`applyTxToInvested`, FIFO engine, snapshot pipeline, dashboard hero hook: no changes needed.

## Testing strategy

This project has no test suite by convention (per CLAUDE.md). Verification is via manual walkthrough:

1. **Pre-flight:** dashboard hero P&L and portfolio P&L agree (already verified after the Mar 3 hot-fix).
2. **Schema migration:** apply migration locally, run a diagnostic SELECT confirming USD/TRY/EUR have `is_currency=true`, USDT/USDC have `category='crypto'`.
3. **Transfer cost auto-fill — fiat:** open modal, pick asset=USD, type=transfer_in, amount=1000. Verify the read-only "Cost basis: $1,000 (auto)" line appears; submit; confirm DB row has `total_cost=1000`, `unit_price=1`, `price_currency='USD'`.
4. **Transfer cost auto-fill — paired crypto:** open modal, pick asset=AAPL (or a crypto with FIFO history), type=transfer_out, amount=N, destination=other platform. Verify auto-fill matches `computeTransferCostBasis` output; submit; confirm both rows have the matching cost.
5. **Transfer cost — lone non-currency:** pick asset=BTC, type=transfer_in, amount=0.5, leave cost empty. Verify submit is blocked client-side with a clear message; fill cost; verify success.
6. **DB CHECK:** attempt manual SQL `INSERT INTO transactions (..., type='transfer_in', total_cost=0, ...)` — verify it's rejected.
7. **Unit price prefill:** open the modal, pick asset=USDT, type=buy → confirm `unit_price` pre-fills to ~`1.00`. Switch to asset=BTC → confirm prefill changes to the current BTC market price. Confirm the user can still type over the prefilled value.
8. **P&L regression:** confirm hero P&L still matches portfolio P&L within $1 after the migration. The Mar 3 row is fine; USDT/USDC repricing will introduce small (<$10) P&L noise — verify the noise is reasonable.

## Rollout

Single-user, no PR process. Apply migration → ship code → smoke-test in dev → done. No staged rollout, no feature flags.

## Open questions

- None at design time. The "future APR/yield tracking" feature is explicitly out of scope and the existing `interest` transaction type already supports it without further schema work.
