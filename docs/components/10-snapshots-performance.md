# Component 10: Snapshots & Performance — Behavioral Spec

> Layer: behavioral (tech-agnostic). Implementation → [technical/10-snapshots-performance.md](technical/10-snapshots-performance.md)

## Purpose

Capture the portfolio's value and composition once per day as a frozen [snapshot](GLOSSARY.md#snapshot), and turn that history into performance views: value over time, drawdown, monthly returns, category attribution, a benchmark comparison, and summary metrics. A snapshot is the authoritative record of "what the portfolio was worth on that date".

## Depends on

- **Price engine** — fresh prices and exchange rates are what a snapshot freezes.
- **P&L engine** — supplies net invested capital, per-asset/category P&L, and the live money-weighted total used as the chart's "now" point.
- **Dashboard** — shares the snapshot as its source of truth and shares charting conventions.

## Concepts used — links into [GLOSSARY](GLOSSARY.md)

- [Snapshot](GLOSSARY.md#snapshot) — frozen total + breakdown for one date.
- [Money-weighted](GLOSSARY.md#money-weighted) return / [USD anchor](GLOSSARY.md#usd-anchor) — all values are anchored in USD; returns subtract deployed capital.
- [Net invested capital](GLOSSARY.md#net-invested-capital) — `snapshot value − net invested` is that date's P&L point.
- [Allocation](GLOSSARY.md#allocation) — the per-category/platform/tag breakdown a snapshot freezes.
- [Snapshot price / live quantity](GLOSSARY.md#snapshot-price-and-live-quantity), [staleness](GLOSSARY.md#staleness) — pricing rules that gate whether a snapshot may be written.

## Behaviors / rules

### What a snapshot is

- A snapshot freezes, for one calendar date (in the portfolio's home timezone): the **total value** (USD and the home fiat) plus a **breakdown** — per asset, per category, per platform, per tag — and the **exchange rates** used at write time.
- One snapshot per portfolio per date. Re-writing a date replaces it (idempotent).
- The snapshot is the single source of truth for *current* totals and allocation: the value views read snapshots, they do not re-derive value from holdings × prices.

### When snapshots are written

1. **Daily automatic** — a scheduled job writes one snapshot per portfolio per day, late in the day. It runs **after** the daily price refresh so the frozen value reflects that day's fresh prices/rates.
2. **Manual "now"** — the user can capture today's snapshot on demand from the performance view.
3. **Live trailing of today** — while the app is open, today's snapshot is kept in step with the freshest data the client has: a price refresh or a transaction add/edit/delete rewrites today's row so the value chart's "now" point stays current. Price-driven rewrites are skipped when today's total hasn't actually moved.
4. **Historical backfill** — on demand (from settings), the system reconstructs past snapshots by replaying transactions against historical prices/rates. See density below.

### Backfill density

When backfilling, the user picks one of two densities:

- **Recent-daily + older-weekly (default)** — one snapshot for **each of the last ~30 days**, then **one every 7 days** walking back to the earliest transaction. Recent ranges keep daily detail; long ranges (1Y / ALL) stay lightweight. The earliest transaction date and today are always included as anchors.
- **Each transaction day** — one snapshot only for days a transaction occurred. More precise on activity, sparser through quiet periods.

Overwrite option: when on, the **entire date range** from the earliest transaction through today is wiped and rebuilt (not just the targeted dates) so stale rows from a prior, differently-spaced backfill can't survive. When off, dates are upserted in place. Exception either way: a date the rebuild **cannot price is never deleted** — any existing snapshot on that date survives, and the run reports the skipped dates. An overwrite must never destroy a record it cannot replace.

### Correctness guards (all writers)

- **Unpriceable holding → skip the date.** If any held asset has no usable price (missing, non-positive, or [stale](GLOSSARY.md#staleness)) for the target date, the writer skips that date with a logged reason rather than freezing a total that silently omits the holding. A manual write surfaces the skip to the user; the automatic writer logs and moves on; the backfill logs **and** reports every skipped date (with the holdings it couldn't price) in its run summary — a skip is never silent.
- **Empty portfolio → write a $0 snapshot.** When every position is closed, the date is written with total = 0 so charts draw a flat $0 line through the closed period instead of interpolating a fictional value.

### Computed performance values

All performance math is [money-weighted](GLOSSARY.md#money-weighted) and [USD-anchored](GLOSSARY.md#usd-anchor).

- **Portfolio value over time** — the snapshot totals, plotted chronologically. The chart's "now" point equals the live money-weighted total shown on the dashboard.
- **P&L over time** — for any snapshot, `total value(date) − net invested(date)`. Net invested is the cumulative cost basis deployed up to that date (buys + fees − sells − dividends/interest; transfers carry cost basis in/out and net to zero for genuine platform-to-platform moves; auto-paired cash legs cancel an asset↔cash swap so it isn't double-counted).
- **Monthly returns** — the money-weighted return between consecutive snapshots, with mid-period cash flows time-weighted (a deposit halfway through the period counts for ~half the period) so depositing capital does not masquerade as a gain. Only flows that genuinely cross the portfolio boundary count; internal asset↔cash swaps, dividends, interest, and standalone fees do not inflate the return.
  - Worked example: period start value 10,000; end value 11,500; a 1,000 deposit at the period midpoint. Time-weight w = (T − t)/T = 0.5. Return = (11,500 − 10,000 − 1,000) / (10,000 + 1,000·0.5) = 500 / 10,500 ≈ **+4.76%**. Counting the deposit as gain would wrongly read +15%.
- **Drawdown** — for each snapshot, `(value − running peak) / running peak`, always ≤ 0. Max drawdown is the minimum of the series. Computed on USD only (home-fiat drawdown would be distorted by currency depreciation).
- **Category attribution** — per category: cost basis, current value, total P&L (unrealized + realized), and that category's share of total portfolio P&L. Anchored on actual transactions (cost basis), not on snapshots, so it doesn't misstate the starting point when snapshots begin after the first deposit. Fiat is excluded (no meaningful P&L). This view is portfolio-wide (lifetime), independent of the selected range.
- **All-time return** — total P&L ÷ absolute net invested capital.
- **CAGR** — `(current value / net invested)^(1/years) − 1`, anchored on the first transaction date; shown as `N/A` below ~1 month of history. A friendly approximation; rigorous money-weighting for irregular flows would be a per-flow internal rate of return.
- **Benchmark comparison** — the portfolio's value path overlaid against a chosen market index's daily-close series (default: a broad US index), so relative performance is visible. The index is informational only — it never feeds the portfolio's own totals.

### Time range

- A selectable range scopes the value/drawdown/monthly views and the range-scoped summary cards (best/worst month, max drawdown). All-time return and CAGR are always lifetime regardless of range; range-scoped cards are labelled with the active range.
- For ranges of a month or longer, the latest snapshot **just before** the range start is pulled in as a start anchor so the chart stays populated when snapshots are sparse. Sub-week ranges are not extended (it would misrepresent the requested window).
- A synthetic $0 point one day before the earliest transaction may anchor the value series so a portfolio that began mid-window starts from its true entry point.

## Contract (I/O)

**Snapshot (frozen record)**
- In: target date, the portfolio's held quantities, prices + exchange rates for that date.
- Out: a row of `{ date, total (USD + home fiat), breakdown{ rates, by_category, by_platform, by_tag, by_asset } }`. Refuses to write on an unpriceable holding; writes $0 for an empty portfolio.

**Backfill**
- In: density choice (recent-daily+older-weekly | each-transaction-day), overwrite flag.
- Out: target dates produced, snapshots written, tickers priced, skipped dates (with the unpriceable holdings), per-source warnings. Density: daily ≤ ~30 days, weekly older.

**Performance read**
- In: the snapshot history, transactions, exchange rates, current net invested / P&L / value (from the P&L engine), selected range.
- Out: value series, drawdown series, monthly returns, category attribution rows, and summary metrics (all-time return, CAGR, best/worst month, max drawdown).

## UI contract — performance charts, time range, snapshot/backfill controls

- **Time range selector** — buttons for at least 1M / 3M / 6M / YTD / 1Y / ALL; the active range is highlighted and scopes the charts and range-scoped metrics.
- **Summary metrics** — a compact grid of cards: current value, all-time return, CAGR, best month, worst month, max drawdown. Range-scoped cards carry the range in their label. `N/A` when a metric can't be computed.
- **Portfolio value chart** — value over time in the selected display currency; tooltip shows date and value.
- **Monthly returns chart** — bars per period; gain/loss coloured per the canonical palette; tooltip shows signed % (and amount).
- **Drawdown chart** — filled area pinned at the 0% line, never above it.
- **Category attribution** — a table (category, cost basis, value, total P&L, contribution %), sorted by absolute contribution, signed values coloured per the canonical gain/loss palette.
- **Benchmark comparison** — the chosen index overlaid on the value path with its own calibrated scale; a clearly distinct (neutral) line.
- **Snapshot control** — a "take snapshot now" action that reports success or a skip reason; shows the last snapshot date/value and a collapsible history with per-row delete.
- **Backfill control (settings)** — density choice with explanatory hints, an overwrite toggle with a clear warning, a run action, and a result summary (target dates, written, tickers priced, warnings). Warns that it pulls historical prices and may take tens of seconds.
- **Empty / sparse states** — fewer than 2 snapshots: prompt to take snapshots (charts hidden). Fewer than 2 points in a range: a "not enough data" hint suggesting a wider range. All charts are responsive and stack to one column on small screens.
- Negative values always render with a leading minus — showing a loss as a positive number is the worst silent failure for a tracker.

## Acceptance

- A snapshot freezes the total **and** the per-asset/category/platform/tag breakdown for its date.
- The daily automatic snapshot runs after the price refresh, so its frozen value reflects that day's fresh prices/rates.
- Backfill produces daily points for the last ~30 days and weekly points for older history (default density), anchored at the earliest transaction and today.
- An unpriceable holding causes the date to be skipped (logged / surfaced), never a silently-undercounted total; a fully-closed portfolio writes a $0 snapshot.
- The value, drawdown, and monthly-returns views render over the chosen range; the value chart's "now" point equals the live money-weighted total shown on the dashboard hero.
- Monthly returns are time-weighted so a mid-period deposit doesn't read as a gain.
- Category attribution shows per-category P&L and contribution %, sorted by magnitude, and reconciles to lifetime totals.
- A benchmark index can be overlaid on the value path without affecting portfolio totals.
- Overwrite backfill rebuilds the whole earliest-transaction→today range — except dates it cannot price, which are skipped, reported, and never deleted; non-overwrite upserts in place.
