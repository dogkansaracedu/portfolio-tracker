# Component 7: Dashboard — Behavioral Spec

> Layer: behavioral (tech-agnostic). Implementation → [technical/07-dashboard.md](technical/07-dashboard.md)

## Purpose

The primary landing view after login — a one-glance summary of the whole
portfolio. It answers "what am I worth, where is it, and how has it moved?" with:
net worth in the chosen display currency, an [allocation](GLOSSARY.md#allocation)
breakdown, per-[Platform](GLOSSARY.md#platform), per-tag, and per-native-currency
breakdowns, the top movers, and a hero showing total value (or period gain/loss) over a selectable
time range — all derived from the latest [Snapshot](GLOSSARY.md#snapshot) so the
numbers agree with the Portfolio page by construction.

## Depends on

- Price engine — current/cached prices + FX rate, for the hero's live "now" anchor (Component 5)
- P&L engine — the money-weighted total used for the hero's headline and period delta (Component 6)
- Platform & asset management — asset/platform records behind the breakdowns (Component 3)
- Snapshots — the latest snapshot supplies every total and breakdown; the history feeds the hero chart (Component 10)

## Concepts used — links into GLOSSARY

- [Snapshot](GLOSSARY.md#snapshot) — the authoritative source for all totals and breakdowns
- [Allocation](GLOSSARY.md#allocation) — each group's share of total value
- [Platform](GLOSSARY.md#platform) — one breakdown axis (carries a display color)
- [Money-weighted](GLOSSARY.md#money-weighted) — basis for the hero's period P&L and total
- [USD anchor](GLOSSARY.md#usd-anchor) — all P&L measured in USD before display conversion
- [Snapshot price / live quantity](GLOSSARY.md#snapshot-price-and-live-quantity) — rule wherever a value depends on quantity
- [Foreign-declarable income](GLOSSARY.md#foreign-declarable-income) — the YTD figure the 22k heads-up tracks
- [At-source tax](GLOSSARY.md#at-source-tax) — excludes PPF / withheld income from the heads-up

## Behaviors / rules

**Snapshot-sourced by construction.** Net worth and every breakdown
(category / [Platform](GLOSSARY.md#platform) / tag) come from the latest
[Snapshot](GLOSSARY.md#snapshot) — never re-derived from holdings × prices on the
client. This guarantees the dashboard's net worth equals the Portfolio page total.
Where a value depends on live quantity, the
[snapshot price / live quantity](GLOSSARY.md#snapshot-price-and-live-quantity) rule
applies. Freshness is the snapshot writer's job, not the dashboard's.

**Net worth.** Show the portfolio total in the selected display currency (USD or
TRY), with the other currency as a smaller secondary line. Both come straight from
the latest snapshot's totals.

**Allocation breakdown.** A two-level donut of value-by-category with the total
in the center. Most categories are asset classes (stocks, gold, crypto, …), but
**cash-equivalents collapse into a single "Fiat" category**: real fiat cash, PPF
funds, and USD-pegged stablecoins (USDT/USDC) all count as fiat — so funds are
**not** a standalone slice and stablecoins are **excluded from crypto**. The Fiat
category is then broken down **by currency** (TRY incl. PPF funds, USD, EUR, and
each stablecoin shown distinctly) on an outer ring around its inner-ring whole,
so the user reads both "how much is cash" and "in which currencies" at once.
Other categories pass straight through to the outer ring. The legend lists each
category's [allocation](GLOSSARY.md#allocation) percent, with Fiat's per-currency
split indented beneath it. This mirrors the Portfolio table's nesting of
cash-equivalents under their fiat currency (Component 8). The separate currency
breakdown below is a different view (every asset by its native currency).

**Platform breakdown.** A ranked list (largest first) of each
[Platform](GLOSSARY.md#platform): its color, value, and percent share, with a
proportional bar. More legible than a chart for a handful of platforms.

**Tag breakdown.** The same ranked-list treatment for cross-cutting tags (e.g.
`usd`, `crypto`, `commodity`) — independent of the category axis, since one asset
can carry several tags.

**Currency breakdown.** The same ranked-list treatment by each asset's
**native currency** (the currency its price is natively quoted in — e.g. USD,
TRY, EUR), summing each holding's value into its native currency's bucket. Shows
the [allocation](GLOSSARY.md#allocation) share so the user can see their
currency exposure at a glance. Distinct hues per currency, intentionally not the
gain/loss palette. Assets whose currency can't be resolved fall back to USD.

**Foreign-income heads-up.** A "Foreign income · <year>" card tracking the
current tax year's [foreign-declarable income](GLOSSARY.md#foreign-declarable-income)
— non-TRY dividend + interest with no [at-source tax](GLOSSARY.md#at-source-tax),
converted to TRY — against the Turkish declaration threshold (22,000 TL). PPF and
other at-source-taxed income are excluded. Shows the YTD amount, the threshold,
the percent of it reached, and a progress bar that turns **amber at ≥ 80 %** and
**red once the threshold is crossed**. The first time the threshold is crossed in a
given tax year, a one-shot in-app notification nudges the user that the income now
has to be declared; it fires once per tax year per browser and never re-fires on
later visits. The tax year follows the portfolio's home timezone, so it flips at
the right local midnight.

**Top movers.** The handful of assets (excluding fiat/cash) with the largest
absolute [USD-anchored](GLOSSARY.md#usd-anchor) unrealized gain/loss. Each shows
ticker/icon, the gain/loss amount, and its percent. Current value is the snapshot's
per-asset value (aggregated across platforms); cost basis is the asset's
FIFO cost basis. Sorted by absolute gain/loss, capped to the top few.

**Hero — value or P&L over a range.** A large card with two view modes and a
selectable time range:

- **Value mode:** headline = current total value; an area line of value over the
  range; period delta = ΔValue (end − start) with its percent; a secondary
  reference line for cost basis.
- **P&L mode:** headline = the period's gain/loss; the line is the
  [money-weighted](GLOSSARY.md#money-weighted) P&L (value − net cash deployed) at
  each point, zero-anchored at the range start; a subtitle shows the lifetime
  total P&L (the same money-weighted total the Portfolio page reports) and a
  benchmark's cumulative percent return over the range.

**After-tax (net) lifetime total.** The subtitle's lifetime total P&L is shown
**after tax** (`net = gross − tax`, where tax is the summed
[at-source](GLOSSARY.md#at-source-tax) accrual across taxed holdings), mirroring
the [Portfolio summary bar](08-portfolio-page.md). Its colour and sign follow the
net amount. When any tax was deducted, a muted line beneath shows the **gross**
figure and the tax taken, so nothing is hidden; with no tax it renders exactly as
before (net == gross, no extra line). The lifetime **percent stays gross** (over
[peak net invested](GLOSSARY.md#peak-net-invested-capital)) — tax adjusts the
amount, not the return ratio. The period delta and the chart stay gross.

**Period P&L = the chart's delta (money-weighted).** The hero's period change is
the [money-weighted](GLOSSARY.md#money-weighted) value change over the chosen
range, so the headline number always equals what the chart line shows end-to-end.
New deposits/withdrawals during the period are treated as neutral cash flows, so
they don't masquerade as gains. (Same methodology as the P&L engine — Component 6 /
[P&L Methodology](../pnl-methodology.md).)

**Time ranges.** Selectable windows: 1D, 1W, 1M, 3M, YTD, 1Y, **2Y**, and ALL.
The series is anchored to the user's first activity, so a short-history portfolio
on a long range still renders cleanly from the actual entry point rather than from
an empty window edge.

**Percent denominator rules** (so a percent is never misleading):
- Value mode, normal window → ΔValue ÷ starting value of the period.
- P&L mode, and any window whose start value is ~0 (e.g. ALL's synthetic zero
  anchor, or a period beginning before any priceable holdings) → divide by
  [peak net invested](GLOSSARY.md#peak-net-invested-capital) — the same base as the
  headline [Total P&L](GLOSSARY.md#total-pl) %, so the figure is stable across
  withdrawals. In the ~$0-start case the numerator is lifetime P&L (value − invested),
  so the figure equals the headline Total P&L % exactly. In the all-time window the
  period percent is suppressed on the value headline to avoid pairing a near-infinite
  "% on $0" with the dollar delta.

**Privacy / obfuscation toggle.** A global toggle hides monetary amounts (net
worth, breakdown values, hero figures, tooltips) by masking them — but
**percentages stay visible**. Allocation percents, the period/total percent, and
benchmark percent are never masked, so the shape of the portfolio is still legible
with amounts hidden.

**Display currency.** A global USD/TRY toggle drives every currency figure;
switching it re-renders the page. Conversions use snapshot-recorded FX (per-point
in the chart) so historical points aren't retro-converted at today's rate.

**Empty / loading.** While data loads, show placeholder cards. With no assets at
all, show a welcome/empty state linking to settings. The hero shows a "not enough
data" placeholder when fewer than two points exist for the chosen range.

### Worked example — hero period P&L

Range = 1M. At the range start the portfolio's money-weighted P&L was **+$1,500**;
today it is **+$4,000**, and the user deposited **$2,000** mid-month.

- Period delta = `4,000 − 1,500 = +$2,500` — the deposit is a neutral cash flow,
  so it is **not** counted as a $2,000 "gain."
- The chart line is zero-anchored at the start and ends at **+$2,500**; the
  headline reads **+$2,500**, identical to the line's end-to-end rise.
- Percent uses **peak net invested** as the base (P&L mode), not the starting P&L
  number — dividing by the start P&L would print a meaningless ratio. Peak is the same
  base as the headline Total P&L %, so the two never disagree.

## Contract (I/O)

**Inputs:** the latest [Snapshot](GLOSSARY.md#snapshot) (totals + by-category /
by-platform / by-tag / by-asset breakdowns) and the snapshot history; the live
money-weighted total value and total P&L (USD + TRY + %); the latest FX rate; the
asset set and transaction history (for top-movers cost basis and for netting
period-deployed capital); a chosen benchmark series for the P&L overlay; the
display currency and the amount-obfuscation flag.

**Outputs (rendered):** net worth (primary + secondary currency); the allocation
donut; platform, tag, and native-currency breakdown lists; the foreign-income
heads-up card (YTD vs threshold + progress bar) and, on first crossing, a one-shot
notification; the top-movers list; the hero (headline,
area chart, period delta + percent, lifetime-total subtitle, benchmark percent).
Session UI state: view mode (value/P&L), time range, and selected benchmark
(persisted across re-mounts); display currency and obfuscation come from the global
display state.

## UI contract — net worth, allocation, platform/tag breakdown, top movers, hero with range, privacy toggle

- **Net worth:** large primary amount in the selected currency; smaller secondary
  amount in the other currency. Empty-state copy when there is nothing to show.
- **Allocation:** a two-ring donut with center total — inner ring = the top
  categories (Fiat as one wedge), outer ring = the same order with Fiat split
  into its currencies and every other category passing through unchanged. Legend
  lists each category + percent, with Fiat's currency breakdown
  (TRY/USD/EUR/USDC/USDT) indented beneath it; the fiat currencies share one
  colour family so the cash wedge still reads as a single block.
- **Platform breakdown:** ranked rows — color dot, name, percent, value, and a
  proportional bar (largest first).
- **Tag breakdown:** ranked rows — color dot, tag, value, and a proportional bar.
- **Currency breakdown:** ranked rows — color dot, native currency code, percent,
  value, and a proportional bar (largest first); empty-state copy when none.
- **Foreign-income heads-up:** a "Foreign income · <year>" card — YTD TRY amount,
  the threshold, the percent reached, and a progress bar (default → amber at ≥ 80 %
  → red once crossed); a one-shot notification on the first crossing of the tax year.
- **Top movers:** compact rows — asset icon + ticker, gain/loss amount, gain/loss
  percent; gain/loss colored; empty-state copy when none.
- **Hero:** view-mode switch (Value | P&L); headline number; area chart with a
  secondary reference line (cost basis in value mode, benchmark percent in P&L
  mode); period delta (amount + percent) with a range label; a "Total" subtitle in
  P&L mode (lifetime money-weighted P&L + %); a row of time-range buttons including
  **2Y**; chart colored green when up / red when down for the period; a "not enough
  data" placeholder when the range has < 2 points.
- **Privacy toggle:** hides currency amounts everywhere on the page while leaving
  **all percentages visible** (allocation %, period %, total %, benchmark %).
- **Currency toggle:** flips every currency figure between USD and TRY.
- **Gain/loss colors:** canonical gain/loss palette — positive vs. negative drives
  color, zero is neutral; consistent across movers, hero delta, and totals.
- **Layout:** net worth / hero on top; the breakdowns and movers in a responsive
  grid (two columns on wide screens, single column stacked on narrow).

## Acceptance

- [ ] Net worth shows in the selected currency (USD/TRY), with the other currency
      secondary, and **equals the Portfolio page total**.
- [ ] The allocation donut groups cash, PPF funds, and stablecoins into one
      **Fiat** category (no standalone fund slice; crypto excludes USDT/USDC),
      and breaks Fiat down **by currency** on an outer ring (TRY incl. funds,
      USD, EUR, USDC, USDT). Currency children reconcile to the Fiat whole and
      the center shows the total.
- [ ] Platform, tag, and native-currency breakdowns each render ranked rows with
      value, percent, and a proportional bar.
- [ ] The foreign-income card shows YTD foreign (non-TRY, non-withheld) dividend +
      interest in TRY vs the 22,000 TL threshold, with a progress bar that goes
      **amber at ≥ 80 %** and **red once crossed**; PPF / at-source-taxed income is
      excluded, and a one-shot notification fires the first time the threshold is
      crossed in a tax year (once per year per browser).
- [ ] Top movers lists the largest-absolute unrealized gain/loss assets (fiat
      excluded), gain/loss colored, amount + percent.
- [ ] The hero offers time ranges 1D / 1W / 1M / 3M / YTD / 1Y / **2Y** / ALL.
- [ ] The hero's period P&L is the **money-weighted** value change over the chosen
      range and **equals the chart line's end-to-end delta**; mid-period deposits
      do not count as gains.
- [ ] In P&L mode, the lifetime **Total** subtitle shows the **after-tax (net)**
      P&L as the headline figure with **gross** and the deducted tax annotated
      beside it when taxed; untaxed portfolios render exactly as before. The
      lifetime percent stays gross; the period delta + chart stay gross.
- [ ] Toggling privacy **hides amounts but keeps percentages visible** (allocation
      %, period %, total %, benchmark %).
- [ ] With < 2 points in the chosen range the hero shows a "not enough data"
      placeholder; with no assets the page shows the welcome/empty state.
