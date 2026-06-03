# P&L Methodology — Money-Weighted, USD-Anchored

## Status: Done (canonical definition) + future ideas

## The canonical definition

**Total P&L = current value − net invested capital, in USD.**

- **Money-weighted.** Every dollar of value today vs. every dollar actually
  deployed. Deposits/withdrawals and the cash legs of trades net out (a sell
  and its paired `cash_credit` cancel), so the number reflects *gains*, not
  *cash moving in and out*.
- **Nominal in the asset's own currency, real in USD.** A holding is tracked at
  its native quantity (₺182,284 stays ₺182,284), but P&L is always measured
  against the **USD anchor**. So FX moves on fiat cash are real P&L: if your
  euros are worth more USD than the USD you spent to buy them, that's a gain —
  even though the euro count didn't change.

This is computed in `summarizePnLTotals` (`src/lib/pnl/totals.ts`) as
`totalCurrentValueUsd − totalInvestedUsd`, where `totalInvestedUsd` comes from
`computeCurrentInvestedUsd` (`src/lib/performance.ts`).

`realized` (FIFO, from `lib/pnl/realized.ts`) and `unrealized` are sub-views of
this total — `unrealized = total − realized`. Fiat holdings carry their FX gain
as **unrealized** P&L (see the fiat branch in `usePnL.ts`): cost basis = the net
USD deployed into that currency, so `value − costBasis` is the FX swing.

## Why — the bug this resolved (2026-06-03)

The dashboard's P&L chart was mixing **two different P&L formulas**:

- **Historical points** (and `usePerformance`): money-weighted
  `snapshot_value − net_invested` (`computePnLTimeSeries`).
- **The live "now" point** and the headline "Total": FIFO `unrealized + realized`
  (`summarizePnLTotals`, old definition).

These two disagree whenever fiat FX is non-trivial, because **FIFO treated all
fiat as zero-P&L** (`costBasisUsd = currentValueUsd`), throwing away FX
gains/losses on EUR/TRY cash. On 2026-06-03 the gap was ~$915 — almost entirely
a real **+$902 gain on EUR** (bought ~$12,547 of euros, worth ~$13,449) minus a
−$95 TRY drift. Drawing the chart line from a money-weighted *start* to a FIFO
*end* leaked that $915 into the period delta, so a real **−$335** day showed as
**−$1,250** ("P&L · PAST DAY"), and a positive week showed as −$1,664.

**Fix:** one definition everywhere — money-weighted. Fiat now carries FX P&L, so
the headline, the per-asset breakdown, and the chart's "now" anchor all agree,
and the period delta is the true value change. See also
[Single P&L engine](components/06-pnl-engine.md).

## Future ideas (not yet built)

1. **USD-inflation-adjusted (real) returns.** Today P&L is *nominal* USD. Add an
   optional toggle that deflates by US CPI so "real" purchasing-power return is
   shown alongside nominal. Needs a CPI series (monthly) and an anchor date per
   cash flow; deflate each invested dollar to today's USD before the
   `value − invested` subtraction.

2. **Interest / yield on fiat balances.** Fiat is currently static between
   transactions. Model accrued interest so a balance growing ₺182k → ₺183k from
   interest is captured: book the accrual as income on the fiat holding, then
   it flows through the USD anchor automatically (more ₺, converted at the
   current rate, may be worth more or less USD). Likely a periodic
   interest/`cash_credit`-style accrual driven by a per-holding APR, or imported
   from the platform. Keeps the money-weighted identity intact: interest is a
   gain, not new invested capital.
