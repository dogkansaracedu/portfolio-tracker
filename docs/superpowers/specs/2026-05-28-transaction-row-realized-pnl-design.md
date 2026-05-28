# Realized P&L on Transaction Sell Rows — Design

**Date:** 2026-05-28
**Status:** Approved (pending spec review)

## Goal

Show FIFO-based realized profit/loss directly on each **sell** row in the
Transactions table. When a sale closes part of a position, the row displays the
gain or loss that sale realized — net of fees, matched against the oldest open
lots first (FIFO).

Worked example (the canonical case):

- Buy 1 AAPL @ $250 on May 25
- Buy 2 AAPL @ $262 on May 28
- Sell 1 AAPL @ $300 on May 30 → row shows **+$50.00 (+20.0%)** (minus any sell fee)
  — $50 gain on a $250 FIFO cost basis = 50/250 = 20.0%

## Why this is mostly wiring

The FIFO engine already does the hard part. `computeFIFOLots`
(`src/lib/pnl/fifo.ts`) emits one `RealizedPnLEntry` per sell, already:

- net of sell fees (fees subtracted from proceeds),
- in USD (proceeds and cost basis normalized via historical exchange rates),
- carrying `proceedsUsd`, `costBasisUsd`, `realizedPnlUsd`, and the consumed lots.

So no FIFO logic is added or duplicated. The work is: build a
`sellTxId → RealizedPnLEntry` lookup over the **full** transaction history, thread
it to the row, and render it.

## Currency & percentage rules (important)

P&L is evaluated **in dollars** — that is the source of truth. Native-currency
percentages are misleading when the FX rate moves. Concrete case:

- Day 1: USD/TRY = 50, buy ₺1000 of ASELS → cost basis **$20**
- Day 30: USD/TRY = 60, sell for ₺2000 → proceeds **$33.33**
- Native (TRY) return looks like **+100%**, but the real dollar return is
  **+66.7%** ($13.33 / $20).

Therefore **the percentage always binds to the USD figure**, never the native one.

Display rules per sell row (sub-line under the existing Total cell):

- **USD-priced sell** — native currency *is* USD, so one line:
  `+$50.00 (+20.0%)`
- **Non-USD sell (TRY/EUR)** — two parts:
  - native primary (no %): `+₺1,000.00`
  - USD secondary with %: `~$13.33 (+66.7%)`

Sign and color (green/red) are driven by `realizedPnlUsd` (the USD source of
truth), so a position that is up in lira but down in dollars renders red.

## Components

### 1. `src/lib/pnl/realized.ts` (new)

```
buildRealizedByTx(transactions: Transaction[], rates: ExchangeRate[])
  : Map<string, RealizedPnLEntry>
```

- Groups the **full** transaction set by `${asset_id}|${platform_id}` — the same
  composite key `usePnL` uses — because FIFO is computed per (asset, platform).
- Runs `computeFIFOLots` on each group.
- Flattens every `realized` entry into a map keyed by `transactionId`.
- Pure function, no React. Reuses the existing engine entirely.

### 2. `src/lib/pnl/currency.ts` (extend)

Add an inverse of `normalizeToUsd`:

```
fromUsdOnDate(amountUsd, toCurrency, date, rates): BigNumber
```

- `USD` → as-is.
- `TRY` → `amountUsd × usd_try` (rate for `date`, nearest prior).
- `EUR` → `amountUsd ÷ eur_usd`, with the same TRY-pivot fallback
  `normalizeToUsd` uses for legacy rows missing `eur_usd`.
- Missing rate → falls back to the USD amount as-is (mirrors `normalizeToUsd`,
  with the same `console.warn`).

This is needed because `convertOnDate` only targets `USD | TRY`, and a sell's
native currency may be EUR (e.g. IBKR VUSA).

### 3. `src/hooks/useRealizedPnL.ts` (new)

- Reads `{ transactions, rates }` from `useTransactionData()` — the global
  source of truth (the **full, unfiltered** set).
- Wraps `buildRealizedByTx` in `useMemo` keyed on `[transactions, rates]`.
- Returns `Map<string, RealizedPnLEntry>`.

**Why the full set, not the page's filtered list:** the Transactions page filters
by date/asset/platform/type. FIFO needs an asset's *complete* prior history to
match lots correctly — computing over a filtered slice would produce wrong cost
bases. The page list is for display; this map is computed independently from the
SoT and joined by `tx.id`.

### 4. Wiring

- `TransactionsPage` calls `useRealizedPnL()` and passes the map to
  `TransactionList`.
- `TransactionList` adds a `realizedByTx` prop and threads it to each
  `TransactionRow`.

### 5. `TransactionRow` (extend)

For `tx.type === "sell"` only:

- `entry = realizedByTx.get(tx.id)`; if absent, render nothing extra.
- `nativeCurrency` already computed in the row.
- `nativeValue = fromUsdOnDate(entry.realizedPnlUsd, nativeCurrency, tx.date, rates)`.
- `pct = entry.costBasisUsd > 0`
    `? entry.realizedPnlUsd / entry.costBasisUsd × 100` (BigNumber)
    `: null`.
- `isGain = entry.realizedPnlUsd >= 0` → green, else red.
- Render under the Total cell:
  - if `nativeCurrency === "USD"`: `{±}{nativeValue} ({±}{pct}%)` (one line; pct
    omitted if null).
  - else: line 1 `{±}{nativeValue}`; line 2 `~{±}{usdValue} ({±}{pct}%)`
    (pct omitted if null).
- A small muted `P&L` tag distinguishes it from the Total figure.

All money/quantity math uses BigNumber (project rule). Percent via BigNumber,
formatted to one decimal. Currency codes referenced via existing
`src/lib/constants/currencies.ts` constants/helpers rather than string literals.

## Edge cases

- **Non-sell rows** (buy, dividend, transfer, fee, interest): no sub-line.
  Fees are out of scope by decision — sells only.
- **Sell with no prior lots** (`costBasisUsd === 0`): show the dollar figure
  (= proceeds) with the % omitted (no divide-by-zero).
- **Empty `rates`**: `fromUsdOnDate` returns the USD amount as-is; native and USD
  collapse. Acceptable — matches existing fallbacks.
- **Filtered view**: P&L stays correct because it's computed from the full SoT,
  joined by id.

## Out of scope

- Realized P&L on `fee` rows (engine computes them, but we don't surface them
  here by decision).
- A portfolio-wide realized-P&L summary card (already exists elsewhere via
  `usePnL`; not part of this change).
- Lot-level drill-down / tooltip showing which buys were consumed.

## Verification (manual, on prod)

Per project workflow (no test suite, no local dev server — iterate via
commit → push → check live):

1. AAPL scenario above → sell row shows `+$50.00` with a sensible %.
2. A non-USD sell (TRY or EUR asset) → native primary + `~$<usd> (<pct>%)`
   secondary; confirm the % is the dollar-based return, not the native one.
3. A losing sell → red, negative figure and %.
4. Apply a type/date filter that hides earlier buys → the visible sell still
   shows the correct P&L (proves full-history computation).
5. A sell with no recorded buys → dollar figure, no %, no crash.
```
