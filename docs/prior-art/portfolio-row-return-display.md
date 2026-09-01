# Prior art — What a portfolio row's return figure shows

## Question

On the main portfolio/holdings screen, does a per-position row show the **open
position's unrealized P&L** or a **lifetime total** including realized gains
from closed round-trips and income? What is the % methodology, what happens to
a sold-then-rebought position, and how is FX P&L on held foreign cash shown?

Triggered by 0.11.0 (2026-09-01), which switched rows to lifetime money-weighted
totals and was reverted the same day (0.11.1) after a re-entered position showed
its old trades' P&L.

**Apps researched:** IBKR, Sharesight, Ghostfolio, Delta Investment Tracker.
**Researched:** 2026-09-01, via `prior-art-researcher` agents (web research only).

---

## IBKR (Client Portal / TWS / Mobile positions screen)

- **Unrealized-only rows**: Unrealized P&L = "(current market price − average
  cost/share) × total number of shares"; the optional % is "a percentage of the
  initial investment" (right-click → Display Both).
- **Realized P&L is a separate column that resets daily** — a round-trip closed
  last month simply isn't on the positions screen. Lifetime realized lives in
  Activity Statements and PortfolioAnalyst.
- **Dividends are in neither row figure** (statement-level component only).
- **Daily P&L** is mark-to-market since an instrument-specific reset:
  `PositionNow × PriceNow − positionAtReset × priceAtReset + NetAmountTraded`.
- **FX on cash: currency is a position.** The "FX Portfolio" (virtual FX
  position) tracks "average cost and running P&L on currency trades":
  unrealized = (market rate − avg cost) × position, incl. commissions. Kept
  separate from the real cash-balances view, with loud warnings about which is
  which.
- **PortfolioAnalyst uses a different methodology** (TWR default, MWR optional)
  than the positions screen — two "returns" for the same holding, unlinked in
  the UI (their own docs admit screens "will sometimes differ").
- Sources: ibkrguides.com — traderworkstation/profit-and-loss.htm,
  position-and-pnl.htm, ibkrdesktop/fx-portfolio.htm,
  brokerportal/…/pa_customreports_create.htm. Confidence: high (re-open case
  medium — inferred from "average cost of the current position").

## Sharesight (portfolio overview)

- **Default is open positions only**: "Fully sold holdings are excluded from
  performance figures"; a partial sale shows "only remaining shares". Including
  realized history is an explicit named toggle ("Open & Closed Positions"),
  plus a separate Sold Securities Report.
- **Row % is money-weighted** (a Modified Dietz variant), numerator = capital
  gain + dividends + currency gain (each also its own column), annualized
  **only when Average Years Invested ≥ 1** — under that, holding-period %
  (kills the "bought 3 days ago, +1,825%/yr" artifact).
- **Cash accounts count in value but are excluded from returns** — a documented
  weakness (community complaints about understated total return).
- Sources: help.sharesight.com — show_portfolio,
  open-positions-and-open-and-closed-positions, performance_calculation_method,
  absolute-and-annualised-return, creating-a-cash-account. Confidence: high.

## Ghostfolio (holdings tab; source-verified on main)

- **Lifetime rows including realized round-trips** (default range "max"):
  `grossPerformanceFromSells` accumulates and never resets when quantity hits
  zero. **This is their most-complained-about behaviour** — discussion #3579 is
  verbatim our TTWO case ("I want +33%, not some negative number because I
  registered a loss months ago"); no fix on main. Dividends excluded from
  performance (separate total; FAQ admits it, PR #3857 unmerged).
- **% is "ROAI"** — net performance ÷ time-weighted average investment. The
  denominator is invisible on screen, generating recurring "wrong performance"
  bug reports (#5793, #5526, #4341).
- **Cash is hard-zeroed on every performance field**; FX movement on a foreign
  cash balance changes displayed value but is never attributed as P&L.
- Sources: apps/api/src/app/portfolio/calculator/roai/portfolio-calculator.ts,
  portfolio.service.ts, holdings-table.component.html; discussions #3579,
  #4341. Confidence: high (read from source).

## Delta Investment Tracker

- **Lifetime absolute on the ALL frame** ("the sum of unrealized and realized
  gains in the time frame chosen", dividends included); sold-out assets keep a
  zero-quantity row unless hidden (calculation-neutral "Hide Zero Holdings").
- **The row's % is a different basis than its $**: short frames = pure unit
  price change; ALL = simple ROI over summed cost basis. No IRR/TWR anywhere;
  realized-vs-unrealized decomposition is paywalled (PRO Advanced Metrics).
- **Cash carries no P&L** ("This will not affect your portfolio's P/L");
  multi-currency balances just convert for display.
- Average-cost basis only (no FIFO); unknown cost basis → flagged error, never
  a guessed number.
- Sources: support.delta.app articles 4590265, 4590298, 3797469, 7039290,
  4682721 (via text proxy — direct fetches 403). Confidence: medium-high
  (formulas are un-alt-texted images, recovered from search-indexed copies).

---

## Cross-app synthesis

- **Current-position rows are the convention.** The broker (IBKR) and the
  performance specialist's default (Sharesight) both scope rows to held lots vs
  their cost. The two apps that blend lifetime realized into rows either have
  it as their top open complaint (Ghostfolio #3579) or paywall the
  decomposition and mismatch $ vs % bases (Delta).
- **Lifetime belongs in a dedicated view** everywhere: IBKR statements /
  PortfolioAnalyst, Sharesight's toggle + Sold Securities Report, Delta's asset
  page. (Ours: Asset Detail.)
- **Nobody but IBKR attributes FX P&L on held cash** — Sharesight/Ghostfolio/
  Delta all show cash in value but zero it out of returns, and Sharesight's
  users complain about the resulting understatement. IBKR's FX-position model
  (currency as a position with average cost; conversions realize
  (market − avg cost) × amount) is the only principled treatment found, and it
  matches our existing Fiat FX P&L stance (fiat is not zero-P&L).
- **% methodology chaos is the recurring failure**: Ghostfolio's invisible
  denominator, Delta's $-vs-% base mismatch, IBKR's two unlinked "returns".
  Whatever we show, the denominator must be statable in one sentence.

## What we decided

- **2026-09-01:** 0.11.0 (lifetime money-weighted rows) reverted the same day
  as 0.11.1 — validated by this research: rows stay **current-position
  unrealized** (value − cost basis of held lots), matching the broker
  convention; lifetime MWR stays on Asset Detail and the summary bar.
- **Proposed for fiat (pending):** adopt the IBKR FX-position model in the P&L
  engine — fiat holdings carry an **average cost** basis; conversions and
  withdrawals consume at average cost and **book realized FX P&L**
  (market − avg cost) at that moment, so the fiat row's unrealized % is the
  held pile vs its cost (no more shrinking-denominator distortion), and the
  invariant `unrealized + realized = value − net deployed` is preserved by
  construction. Open design points: whether a buy's `cash_debit` also realizes
  (consistent, and automatically zero for USD/USDT at peg), and carrying basis
  (not realizing) across linked platform-to-platform fiat transfers.
  Owned by [06 P&L Engine](../components/06-pnl-engine.md) once shipped.
