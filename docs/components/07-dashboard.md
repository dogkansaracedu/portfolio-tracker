# Component 7: Dashboard — Behavioral Spec

> Layer: behavioral (tech-agnostic). Implementation → [technical/07-dashboard.md](technical/07-dashboard.md)

## Purpose

The primary landing view after login — a one-glance summary of the whole
portfolio. It answers "what am I worth, where is it, and how has it moved?" with:
net worth in the chosen display currency, an [allocation](GLOSSARY.md#allocation)
breakdown, per-[Platform](GLOSSARY.md#platform) and per-native-currency
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
- [Money-weighted](GLOSSARY.md#money-weighted) — basis for the hero's dollar Total P&L and period delta
- [Time-Weighted Return](GLOSSARY.md#time-weighted-return-twr) — the hero's default vs-market headline (your return vs the index's)
- [USD anchor](GLOSSARY.md#usd-anchor) — all P&L measured in USD before display conversion
- [Snapshot price / live quantity](GLOSSARY.md#snapshot-price-and-live-quantity) — rule wherever a value depends on quantity
- [Foreign-declarable income](GLOSSARY.md#foreign-declarable-income) — the YTD figure the 22k heads-up tracks
- [At-source tax](GLOSSARY.md#at-source-tax) — excludes PPF / withheld income from the heads-up

## Behaviors / rules

**Snapshot-sourced by construction.** Net worth and every breakdown
(allocation / [Platform](GLOSSARY.md#platform) / native currency) come from the
latest [Snapshot](GLOSSARY.md#snapshot) — never re-derived from holdings × prices on the
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

**Allocation interaction.** The donut is interactive: with nothing hovered, the
center shows the portfolio total; hovering any slice — or its legend row —
highlights that slice (and its related parent/children) while dimming the rest,
and the center swaps to the hovered slice's name, value, and share. Chart and
legend highlight together. Each legend row shows the slice's value **and** its
[allocation](GLOSSARY.md#allocation) percent; values follow the privacy toggle
(masked when amounts are hidden), percentages stay visible.

**Platform breakdown.** A ranked list (largest first) of each
[Platform](GLOSSARY.md#platform): its color, value, and percent share, with a
proportional bar. More legible than a chart for a handful of platforms.

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

**Hero — vs-market (Performance) or value over a range.** A large card with two
view modes and a selectable time range. **The vs-market (Performance) view is the
default.**

- **Performance mode (default) — a vs-market percent race:** the chart draws **two
  percent lines from 0% at the window's left edge** — the portfolio's
  [time-weighted return](GLOSSARY.md#time-weighted-return-twr) and the index's
  cumulative return over the same window — so the reader sees who is ahead at a
  glance. The **headline is the portfolio's time-weighted return %** for the
  range, with the period's **money gain in smaller type beside it** (display
  currency, masked under the privacy toggle, and **colored by its own sign** —
  a large mid-window deposit can leave the money gain positive while the
  time-weighted % is negative, and each then keeps its own color) — e.g.
  "10.71% $3,770"; beneath
  it a subtitle carries the index's return and the **gap between
  them in percentage points** (your TWR − the index), plus the **dollar lifetime
  Total P&L** (the same [money-weighted](GLOSSARY.md#money-weighted) total the
  Portfolio page reports — the dollar alone, no percent companion; the % lenses
  here are the headline TWR and the MWR chip, and the cumulative money-weighted
  % lives on the [Portfolio page](08-portfolio-page.md)) and the period's
  delta percent. Time-weighting means deposits and withdrawals are removed, so
  the comparison is fair: it is the holdings' performance against the index, not
  a head start from when cash happened to go in. When older history is only
  weekly-sampled **and** a deposit or withdrawal lands inside one of those
  multi-day periods, the return is an approximation and an **"approximate"**
  marker is shown. Hovering any point shows, beside the portfolio's cumulative
  return %, the **money gained or lost since the window start as of that date**
  (in the display currency, masked under the privacy toggle) — so the reader
  can see what a period earned in currency, not just in percent. The window's
  first point reads 0, and the "now" point matches the period delta. The index
  row stays percent-only — an amount would imply the reader's money was in the
  index.
- **Measure toggle (TWR | MWR), inside Performance mode:** a small secondary
  switch selects which return measure the percent race plots. **TWR is the
  default** (the fair strategy-vs-index frame above). Switching to **MWR** re-draws
  the same window as a
  [money-weighted](GLOSSARY.md#money-weighted-return-mwr--xirr) race: the
  portfolio line becomes the **cumulative money-weighted (XIRR) return from the
  window start** — deposit/withdrawal timing now *counts, by design* — and the
  index line becomes the [what-if index](GLOSSARY.md#what-if-index-same-flows-benchmark):
  the same external flows placed into the index on the same dates, measured the
  same way. The headline is the portfolio's window MWR %, and the gap-in-points
  chip compares it against the what-if index ("would the same money, moved on the
  same days, have done better in the index?"). The two measures answer different
  questions — TWR scores the strategy, MWR scores the investor's actual dollars —
  and the visible gap between them is the cost (or benefit) of the user's own
  flow timing. MWR needs no intermediate valuations, so it carries **no
  "approximate" marker**. The toggle is hidden in the 1-day range (intraday is
  always the simple intraday change) and in value mode. The selected measure
  persists like the view mode.
- **Lifetime MWR chip:** the Performance-mode subtitle's lifetime Total P&L also
  carries the **lifetime annualized [money-weighted return](GLOSSARY.md#money-weighted-return-mwr--xirr)**
  ("MWR +X.X%/yr") once the transaction history spans at least a year — the rigorous
  "what did each of my dollars earn per year" companion to the Total P&L
  dollars. Hidden (not zeroed) when the history is shorter or the solver has no
  solution.
- **Value mode:** headline = current total value; an area line of value over the
  range; period delta = ΔValue (end − start) with its percent; a secondary
  reference line for **net invested**.
- **A window with no real starting base shows no gain.** When the range reaches
  back before the portfolio existed (or starts at a synthetic zero), the period
  percent is already hidden — the **amount follows the same rule**: it renders
  in the neutral tone (never the gain/loss palette) and is labelled
  "since first deposit", because it is the whole portfolio measured against
  nothing, not a period gain. The same applies to the tooltip's period row.
- **One name for net invested.** The Value-mode subtitle, the Performance
  subtitle, the dashed reference series and its tooltip row all call it
  **"Net invested"**. "Cost basis" is a different glossary term and stays
  reserved for the FIFO figures (the Portfolio table's Bought column, Asset
  Detail's Cost Basis).
- **Both chart lines are named where they are read.** The index line is a solid
  line in its own neutral (not a hairline — the card's whole point is the
  comparison), and each line's colour is carried as a dot on the subtitle chip
  that names it, so no separate legend row is needed at any width. The names
  follow the measure switch exactly as the tooltip does: "You (TWR)" /
  "You (MWR)", and the index becomes "<index> (same flows)" under MWR.
- **Axis ticks land on round numbers.** The percent gridlines step in round
  increments (0.5 / 1 / 2 / 5 …), never at whatever the money ticks happened to
  divide into.
- **The hero speaks the app's language.** Axis and tooltip dates render in the
  app's display locale, and the live right-edge point is labelled "Now".

**Lifetime total stays gross of the tax accrual.** The subtitle's lifetime total
P&L (a dollar figure only) carries no
[at-source](GLOSSARY.md#at-source-tax) accrual adjustment — the
[after-tax](GLOSSARY.md#after-tax-pl) (net) view is deliberately confined to taxed
asset rows on the [Portfolio page](08-portfolio-page.md), and no tax figure renders
here.

**Headline = the portfolio's time-weighted return; the dollar total stays in the
subtitle.** In the default vs-market view the headline is the portfolio's
[time-weighted return](GLOSSARY.md#time-weighted-return-twr) % over the range — the
end value of the upper chart line — and the lower chart line is the index's
return; the gap between the two lines is reported in points. The dollar lifetime
Total P&L stays a [money-weighted](GLOSSARY.md#money-weighted) figure (value − net
cash deployed) shown in the subtitle, so the two questions — "did I beat the
index?" and "how much am I up in dollars?" — each get their own answer instead of
one number standing in for both. Across both metrics, deposits and withdrawals
during the period are neutral cash flows, so they never masquerade as gains. (Same
methodology as the P&L engine — Component 6 /
[P&L Methodology](../pnl-methodology.md).)

**Time ranges.** Selectable windows: 1D, 1W, 1M, 3M, YTD, 1Y, **2Y**, and ALL.
The series is anchored to the user's first activity, so a short-history portfolio
on a long range still renders cleanly from the actual entry point rather than from
an empty window edge. The 1-day range shows intraday (hourly) detail on a
time-of-day axis; longer ranges use daily snapshots. The market-index comparison
is hidden in the 1-day range.

**Percent denominator rules** (so a percent is never misleading):
- Value mode, normal window → ΔValue ÷ starting value of the period.
- A window with no real starting base (~$0: ALL's synthetic zero anchor, or a
  period beginning before any priceable holdings) → **no percent at all** — the
  Δ against ~$0 has no meaningful base, so the figure is hidden rather than
  fabricated (the chart already shows the flat run-in, and the lifetime %
  lives on the Portfolio page as the MWR headline). No fallback denominator
  exists — peak-invested calculations were removed app-wide (2026-08-28).
- Performance mode never renders this delta percent (its % lenses are the
  TWR/MWR measure headline and the MWR chip).

**Privacy / obfuscation toggle.** A global toggle hides monetary amounts (net
worth, breakdown values, hero figures, tooltips) by masking them — but
**percentages stay visible**. The hero chart's **money axis drops its tick
labels** while amounts are hidden (the line keeps its scale, and the reclaimed
gutter goes to the plot) and its **percent axis keeps them**: a % scale alone
yields no amount, since recovering one needs the window's starting value, itself
a hidden figure. See Component 11 for the app-wide rule. Allocation percents, the period/total percent, and
benchmark percent are never masked, so the shape of the portfolio is still legible
with amounts hidden.

**Display currency.** A global USD/TRY toggle drives every currency figure;
switching it re-renders the page. Conversions use snapshot-recorded FX (per-point
in the chart) so historical points aren't retro-converted at today's rate.

**Empty / loading.** While data loads, show placeholder cards. With no assets at
all, show a welcome/empty state linking to settings. The hero shows a "not enough
data" placeholder when fewer than two points exist for the chosen range.

### Worked example — vs-market percent race

Range = 1M. Over the month the holdings gain **+5%** in the first half and **−2%**
in the second; the user deposits **$2,000** mid-month. The chosen index returns
**+4%** over the same window.

- The portfolio's [time-weighted return](GLOSSARY.md#time-weighted-return-twr)
  chains the two halves with the deposit removed: `(1.05 × 0.98) − 1 ≈` **+2.9%**.
  The $2,000 lands as a neutral cash flow, so it is **not** counted as a gain — the
  return reflects only how the holdings performed.
- The chart draws **two lines from 0% at the left edge**: the portfolio ending at
  **+2.9%** and the index ending at **+4%**. The headline reads **+2.9%**, and the
  subtitle reports the index at **+4%** with the gap **−1.1 pts** (the portfolio
  trailed the index this month).
- Separately, the subtitle still shows the dollar lifetime
  [Total P&L](GLOSSARY.md#total-pl) (money-weighted, dollar only) — the "how much
  am I up in dollars" answer, unaffected by the time-weighting above.

## Contract (I/O)

**Inputs:** the latest [Snapshot](GLOSSARY.md#snapshot) (totals + by-platform /
by-asset breakdowns; the allocation donut is derived from by-asset) and the
snapshot history; the live
money-weighted total value and total P&L (USD + TRY + %); the latest FX rate; the
asset set and transaction history (for top-movers cost basis and for netting
period-deployed capital); a chosen benchmark series for the Performance overlay; the
display currency and the amount-obfuscation flag.

**Outputs (rendered):** net worth (primary + secondary currency); the allocation
donut; platform and native-currency breakdown lists; the foreign-income
heads-up card (YTD vs threshold + progress bar) and, on first crossing, a one-shot
notification; the top-movers list; the hero — in the default vs-market view, the
portfolio's time-weighted return % headline, the two-line percent race (portfolio
vs index from 0%), the index return + gap-in-points + dollar lifetime-total
subtitle, and the "approximate" marker; in value mode, the value chart with its
cost-basis reference line and ΔValue delta. Session UI state: view mode
(vs-market/value, defaulting to vs-market), time range, and selected benchmark
(persisted across re-mounts); display currency and obfuscation come from the global
display state.

## UI contract — net worth, allocation, platform breakdown, top movers, hero with range, privacy toggle

- **Net worth:** large primary amount in the selected currency; smaller secondary
  amount in the other currency. Empty-state copy when there is nothing to show.
- **Allocation:** a two-ring donut, starting at 12 o'clock and sweeping
  clockwise — inner ring = the top categories (Fiat as one wedge), outer ring =
  the same order with Fiat split into its currencies and every other category
  passing through unchanged. The fiat currencies share one colour family so the
  cash wedge still reads as a single block, and that family is **the same one
  the Currencies card uses** — a currency is one colour app-wide. The family is
  deliberately one no platform colour uses, so a currency dot can never be
  mistaken for a platform dot. The center shows the portfolio total
  at rest and the hovered slice's name/value/percent on hover; hovering a slice
  or legend row highlights it and dims the rest (chart and legend in sync). A
  caption notes "inner: asset class · outer: fiat by currency". The legend lists
  each slice's value + percent (value masked under the privacy toggle), with
  Fiat's currency breakdown (TRY/USD/EUR/USDC/USDT) indented beneath it.
- **Platform breakdown:** ranked rows — color dot, name, percent, value, and a
  proportional bar (largest first).
- **Currency breakdown:** ranked rows — color dot, native currency code, percent,
  value, and a proportional bar (largest first); empty-state copy when none.
  Colours come from the shared currency palette (see Allocation).
- **Foreign-income heads-up:** a "Foreign income · <year>" card — YTD TRY amount,
  the threshold, the percent reached, and a progress bar (default → amber at ≥ 80 %
  → red once crossed); a one-shot notification on the first crossing of the tax year.
- **Top movers:** compact rows — asset icon + ticker, gain/loss amount, gain/loss
  percent; gain/loss colored; empty-state copy when none.
- **Hero:** view-mode switch (Performance | Value), **defaulting to Performance**;
  headline = the portfolio's time-weighted return % in Performance mode, or current
  total value in value mode. In **Performance mode** the chart is a **two-line percent race** — the portfolio's
  TWR and the index's return, both from 0% at the left edge — with a subtitle
  showing the index return, the gap in **points** (TWR − index), the dollar
  lifetime Total P&L (+ %), the period delta %, and an **"approximate"** marker when
  weekly-sampled history holds a flow. A **TWR | MWR measure switch** (default TWR,
  hidden in 1D and in value mode, persisted) re-draws the race money-weighted: the
  portfolio's cumulative window XIRR vs the same-flows what-if index, headline and
  gap following the selected measure, with no "approximate" marker in MWR. The
  subtitle also shows the **lifetime annualized MWR** ("+X.X%/yr") when the
  history spans ≥ 1 year. In **value mode** the chart is the value
  area with a **net invested** reference line and a ΔValue delta (amount +
  percent). A row of time-range choices including **2Y**, in the app's single
  pick-one control idiom (the same one the view and measure switches use); the portfolio line is colored green when
  up / red when down for the period, keyed to whatever that line plots — the
  selected return measure (TWR or MWR) in Performance mode, the period ΔValue in
  value mode — so the line always agrees with the headline; a "not enough data"
  placeholder when the range has < 2 points.
- **Privacy toggle:** hides currency amounts everywhere on the page — the chart's
  money axis labels included — while leaving **all percentages visible**
  (allocation %, period %, total %, benchmark %, and the chart's percent axis).
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
      USD, EUR, USDC, USDT). Currency children reconcile to the Fiat whole.
- [ ] The allocation donut is interactive: the center shows the total at rest and
      the hovered slice's name/value/percent on hover; hovering a slice or its
      legend row highlights it (and its parent/children) and dims the rest, chart
      and legend in sync. Legend rows show value + percent (value masked under the
      privacy toggle).
- [ ] Platform and native-currency breakdowns each render ranked rows with
      value, percent, and a proportional bar.
- [ ] The foreign-income card shows YTD foreign (non-TRY, non-withheld) dividend +
      interest in TRY vs the 22,000 TL threshold, with a progress bar that goes
      **amber at ≥ 80 %** and **red once crossed**; PPF / at-source-taxed income is
      excluded, and a one-shot notification fires the first time the threshold is
      crossed in a tax year (once per year per browser).
- [ ] Top movers lists the largest-absolute unrealized gain/loss assets (fiat
      excluded), gain/loss colored, amount + percent.
- [ ] The hero offers time ranges 1D / 1W / 1M / 3M / YTD / 1Y / **2Y** / ALL.
- [ ] The hero **defaults to the vs-market (Performance) view**.
- [ ] In the vs-market view the chart shows **two percent lines starting at 0%** at
      the window's left edge — the portfolio's **time-weighted return** and the
      index's return — the **headline is the portfolio's TWR %**, and the subtitle
      reports the index return and the **gap in percentage points**. Deposits and
      withdrawals are removed, so they do not count as gains.
- [ ] When older history is weekly-sampled **and** a deposit/withdrawal lands inside
      one of those multi-day periods, an **"approximate"** marker appears.
- [ ] Performance mode offers a **TWR | MWR** measure switch (default TWR; hidden in
      the 1-day range and in value mode; persisted). Under MWR the portfolio line is
      the **cumulative window money-weighted (XIRR) return**, the index line is the
      **same-flows what-if index**, the headline and gap-in-points follow the selected
      measure, and **no "approximate" marker** is shown.
- [ ] The Performance-mode subtitle shows the **lifetime annualized MWR** ("+X.X%/yr")
      only when the transaction history spans ≥ 1 year and the solver has a solution;
      otherwise the chip is absent (never a fabricated 0).
- [ ] In the vs-market view, the subtitle's dollar lifetime **Total** P&L is
      money-weighted with no tax annotation, rendered as a dollar only (no
      percent companion). After-tax detail appears only on the Portfolio page's
      taxed rows.
- [ ] Toggling privacy **hides amounts but keeps percentages visible** (allocation
      %, period %, total %, benchmark %) — including on the chart, where the money
      axis loses its labels and the percent axis keeps them.
- [ ] With < 2 points in the chosen range the hero shows a "not enough data"
      placeholder; with no assets the page shows the welcome/empty state.
- [ ] A range with no real starting base shows its delta **in the neutral tone**,
      labelled "since first deposit" — never in the gain colour.
- [ ] The figure the Value subtitle, the dashed series and its tooltip row name is
      called **"Net invested"** in all three places.
- [ ] Both chart lines are identified by a coloured dot on the subtitle chip that
      names them, and the index line reads as a line, not a hairline.
- [ ] Percent gridlines land on round steps.
- [ ] Every hero date, and the live right-edge label ("Now"), renders in the app's
      display locale — no Turkish strings.
- [ ] A currency has the same colour in the Allocation donut and the Currencies
      card, and that colour is used by no platform.
