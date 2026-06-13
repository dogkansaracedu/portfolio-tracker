# Return Metrics — Which Number Answers Which Question

Date: 2026-06-14 · Status: discussion capture / reference (pre-implementation)

Companion to [pnl-methodology.md](pnl-methodology.md). Captures the discussion on
return-metric choices for three distinct questions: (1) compare vs index funds,
(2) growth from investing, (3) per-dollar return rate. Worked numeric behaviour for
the shipped engine lives in [pnl-test-cases.md](pnl-test-cases.md).

## TL;DR — three goals, three metrics

| # | Question | Metric | On a withdrawal |
|---|---|---|---|
| 1 | "Did I beat the index?" | **TWR** (mine vs the index's) | Invisible — by design |
| 2 | "How much did I grow from *investing*, not from adding cash?" | **Simple ROI** = Total P&L $ ÷ peak net invested | $ preserved, % stable |
| 3 | "What % did each of my dollars earn?" | **Modified Dietz** (money-weighted) | Negative weighted flow → lower avg capital; rate stays honest |

XIRR = the **annualized** version of #3 (optional; defer unless a per-year rate is wanted).

## The metrics, precisely

Worked on one example — **$1,000/month for 12 months ($12,000 in), asset compounds to
+25% over the year → ends ≈ $13,570, gain ≈ $1,570**:

| Metric | Formula | Value | Accounts for… |
|---|---|---|---|
| **Simple ROI** | gain ÷ money in | **13%** | dollars only (ignores time) |
| **Modified Dietz** | gain ÷ time-weighted avg capital | **24%** | dollars + time (linear weight) |
| **XIRR** | rate `r` solving NPV = 0 | **25%/yr** | dollars + time + compounding/annualized |
| **TWR** | chain `(1 + r_subperiod)` | n/a here | nothing about cash flows — pure price path |

Key intuitions:
- The $12k averaged only **~half a year invested** (Jan's dollar worked 12 months, Dec's
  worked 1). A 13% total gain over ~½ year annualizes to ~25%/yr — **same performance,
  different lens.**
- **Simple ROI** = total gain ÷ total money in. Not a rate, not annualized. "How much I'm
  up on what I put in." A regular monthly contributor will see this **understate** them
  (it divides by money that barely had time to work).
- **Modified Dietz** = "XIRR's simpler cousin." Money-weighted, **not** annualized, linear
  time weight. Needs only start/end value + dated flows (**no daily snapshots**). The app
  already computes it for monthly returns.
- **XIRR** = money-weighted **and** annualized. Standard brokerage "personal rate of
  return." Annualization can look inflated over short / heavy-DCA windows (that's the 25%).
- **TWR** = removes cash-flow timing entirely; chains per-period returns. **The basis
  indices quote their returns on.**

## The apples-to-oranges trap (key for index comparison)

- "SPY +25% this year" is a **buy-&-hold-from-Jan-1 (TWR)** number. You never had all your
  money in on Jan 1.
- If you fed your real monthly contributions into SPY, SPY would also hand you **~13%**
  (same dollar-cost-averaging drag).
- **Fair fight = same basis on both sides.** Either my-TWR vs index-TWR, or
  my-same-cash-flow vs index-same-cash-flow. **Never** my-DCA-13% vs index-headline-25%.

## Modified Dietz — second worked example (the 50k/10k case)

- Start 2026: **$50k**. Add **$10k** spread through the year (≈ invested ½ year, weight ≈
  0.5). $50k earns 10% (+$5k), $10k earns 20% (+$2k) → gain **$7k**.
- `R = 7,000 ÷ (50,000 + 10,000 × 0.5) = 7,000 ÷ 55,000 = `**`12.7%`** — correctly **below
  the naive 15% average** (most dollars earned the lower 10%, and the $10k wasn't there the
  whole year).
- Simple ROI for contrast = 7,000 ÷ 60,000 = **11.7%** (ignores the time the $10k was in).

## "Net invested changes over time" → which denominator?

Net invested is a **running ledger** (buys/deposits +, sells/withdrawals −). The app
resolves the moving denominator by using **two different readings**:

```
Simple ROI % = (current value − CURRENT net invested) ÷ PEAK net invested
```

- **$ numerator** uses **current** net invested (`computeCurrentInvestedUsd`).
- **% denominator** uses **peak** = running max (`computePeakInvestedUsd`); ratchets up
  only → a withdrawal can't shrink it (so the % can't be inflated by pulling money out).
- **No-withdrawal case:** current = peak = total contributed → Simple ROI = gain ÷ total
  contributed (the intuitive number). Peak only *matters* once you withdraw.

Withdrawal example: buy $30k → buy $20k (peak $50k) → withdraw $25k (current $25k, peak
**$50k**). Value $26k → P&L $ = 26 − 25 = **+$1k**; ROI % = 1 ÷ 50 = **+2%**.

## Current app model (shipped 2026-06-14)

- **One engine** (`computePortfolioPnL`), headline = **Simple ROI over peak** (= metric #2):
  - `Total P&L $ = current value − current net invested` (money-weighted, USD anchor).
  - `Total P&L % = ÷ peak net invested`.
- Realized (FIFO) + unrealized = sub-views; fiat carries FX P&L; PPF after-tax overlay.
- **Performance page:** Modified Dietz monthly returns, YTD, CAGR, max drawdown — **not**
  wired to the headline.
- **Benchmark:** normalized SPY/QQQ price line overlaid on the P&L chart (visual only; a
  cumulative `close/base − 1` line — **not** cash-flow-simulated, no head-to-head number).
- **Gaps:** #1 (real TWR-vs-index) and #3 (windowed Modified-Dietz rate) not yet built.
  #3 reuses the existing Modified Dietz machinery.

## UI direction

Separate views, each with a one-line "what this answers" header — **don't cram different
questions into one graph:**

- **vs Market** — "Are my picks beating the S&P 500?" → my TWR vs index TWR
- **My gains** — "How much I'm up on what I've put in" → Total P&L $ + Simple ROI %
- **My money's rate** — "What each of my dollars earned" → Modified Dietz %

## Decisions

- **Index comparison → TWR**, and **TWR is the default dashboard return metric** — it
  replaces the money-weighted % as the dashboard headline and the P&L-view chart
  (spec'd 2026-06-14, `superpowers/specs/2026-06-14-twr-vs-market-design.md`). Scope:
  portfolio-level dashboard only; the money-weighted **engine**, the dollar **Total P&L**,
  and **per-asset / Portfolio-page** figures are unchanged. Dollars stay as headline stats.
- **Growth from investing → Simple ROI** (money-weighted % demoted to secondary, still
  shown on the Portfolio page — metric #2).
- **Per-dollar rate → Modified Dietz** (extend the existing monthly-returns code to a window).
- **XIRR → optional** (annualized #3); defer unless explicitly wanted.

## Caveats

- **TWR needs a clean, gap-free daily snapshot series** (more data-hungry than Modified
  Dietz / Simple ROI, which only need dated cash flows). Mind the snapshot-backfill history.
- The index "return" should be **total return** (dividend-adjusted close) for fairness;
  Yahoo `adjclose` handles this.
