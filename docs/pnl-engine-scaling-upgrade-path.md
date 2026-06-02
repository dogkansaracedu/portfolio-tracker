# P&L Engine — Scaling & Upgrade Path

Companion to [`docs/components/06-pnl-engine.md`](./components/06-pnl-engine.md).
Records how current-day P&L is computed today, why it scales fine for now, and
the concrete upgrade path if client-side replay ever becomes a cost.

## Current architecture (as shipped)

There is **one P&L engine**: `usePnL`. Both pages read from it, so the headline
P&L matches everywhere.

```
total P&L = unrealized + realized
          = Σ(currentValue − FIFO cost basis) over current holdings      ← price-dependent
          + Σ FIFO realized gains over the FULL transaction history       ← price-independent
```

- **Unrealized** — `usePnL`'s price-keyed memo walks current `holdings`
  (`fetchHoldings` filters `balance != 0`) and prices the remaining FIFO lots.
- **Realized** — a separate memo keyed on `[transactions, rates]` sums
  `buildRealizedByTx(transactions)` (`src/lib/pnl/realized.ts`) over **all**
  transactions, including positions fully sold out of.
- `summarizePnLTotals` (`src/lib/pnl/totals.ts`) is the single formula for
  `total` and `% over |net invested|`, shared by the Portfolio summary bar
  (`usePortfolio`) and the Dashboard hero (`usePnLSummary`).
- The Dashboard **chart** stays snapshot-derived; only the current-day / "now"
  figure comes from the live engine (chart "now" point is anchored to it via
  `useDashboardHero`'s `currentPnlUsd`).

### The bug this replaced

The Portfolio summary previously summed realized P&L only over **currently held**
positions (it walked `holdings`, which excludes `balance == 0`). Realized gains
from fully sold-out positions were silently dropped, so the Portfolio total
trailed the Dashboard (e.g. ~$3.5k vs ~$6k). Computing realized over the full
transaction history fixes it.

## Why it scales (don't optimize yet)

Transaction count for a single user is small, even over a decade:

| Trading style | Txns/year | 10-year total |
|---|---|---|
| Buy-and-hold | 20–80 | 200–800 |
| Fairly active (~5/week) | ~260 | ~2,600 |
| Very active (~20/week) | ~1,040 | ~10,000 |

FIFO is **O(n)** amortized (each lot is created once, consumed once) plus one
**O(n log n)** sort. At a few thousand transactions this is low-tens-of-ms of
BigNumber math; it's memoized and off the render hot path.

The real efficiency lever is **recompute frequency, not data volume**: realized
P&L is price-independent, so it lives in a `[transactions, rates]`-keyed memo and
does **not** re-run on live price ticks. The price-keyed path only re-walks
current holdings (small). Adding `usePnLSummary` reused this — no new fetch
(transactions are already loaded by `TransactionDataContext`) and the
full-history realized calc already existed for the Transactions page
(`useRealizedPnL`).

The likely *first* scaling concern is rendering ~3,650 daily snapshot points in
Recharts (10 years), solved with downsampling — a charting issue, separate from
P&L math.

## Upgrade path (NOT built — YAGNI at single-user scale)

Cost basis of current holdings inherently requires replaying a held asset's
history (FIFO decides which lots remain). The only way to avoid *any* client-side
replay is to **persist** the derived state:

1. Store `cost_basis_usd` (and optionally remaining-lot state) per row in
   `holdings`, plus a per-user `cumulative_realized_usd` aggregate.
2. Update them **server-side when a transaction is written** — the app already
   runs `recalculateBalance` server-side on every transaction mutation, so this
   hooks into an existing write path.
3. The client then **reads** cost basis + realized instead of replaying FIFO.
   `usePnL`'s unrealized path becomes `balance × price − stored cost basis`;
   realized becomes a single stored number.

Cost: a schema change + keeping the server-side derivation correct (the FIFO
logic effectively moves to / is duplicated on the write path). Defer until
client replay is actually measured as a problem.

### Reconcile when building this

Dividends and interest are currently treated **inconsistently** between the two
historical definitions:

- **FIFO** (`computeFIFOLots`) capitalizes `dividend`/`interest` as new cost lots
  → no immediate gain.
- **`computeCurrentInvestedUsd` / `applyTxToInvested`** (the snapshot chart's
  `value − invested` definition) subtracts them from invested → counts them as a
  return.

This doesn't affect Portfolio-vs-Dashboard headline agreement (both headlines now
use the FIFO engine), but it can cause a small step between the Dashboard chart's
last *snapshot* point and the live "now" point when dividend/interest
transactions exist. Pick one definition and apply it on both paths when the
persistence work is done.
