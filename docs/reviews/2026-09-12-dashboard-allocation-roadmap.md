# Dashboard & Allocation Product Roadmap

Date: 2026-09-12

## Product direction

The dashboard should answer three questions in order:

1. What do I own and how is it allocated?
2. What materially changed?
3. What needs a decision?

Keep current portfolio value, performance, allocation, and movers above planning.
Do not add vehicle maintenance to the dashboard. New features should deepen the
existing allocation/action surfaces before adding more top-level cards.

## Now — highest value, existing data

### 1. Allocation drilldown that works by click, tap, and keyboard

- Selecting a donut slice should persist selection rather than relying on hover.
- Chart and legend share the same selected state.
- The center shows selected value, share, and holding count.
- The CTA becomes exact: "View 7 USD assets" or "View 4 crypto assets" and
  opens a filtered portfolio view.
- A visible Clear action restores the full portfolio.

Why first: the chart already contains the data, but the current hover interaction
does not help touch or keyboard users and the generic CTA loses context.

### 2. "What changed?" allocation deltas

- Add a 1M / 3M comparison beside each allocation row: `+2.4 pp`, `−1.1 pp`.
- Highlight the two largest changes and explain whether the cause was market
  movement or net buying/selling when the transaction history supports it.
- Use daily snapshot breakdowns; do not derive history from today's holdings.

Why: a static allocation says where the portfolio is, not why it deserves
attention today.

### 3. Transparent concentration scorecard

Show four auditable facts above or beside allocation:

- largest asset share;
- top-three asset share;
- largest platform share;
- cash/fiat share.

Use descriptive thresholds and direct drilldowns. Avoid a proprietary "risk
score" that users cannot reproduce.

### 4. One dashboard Action Center

Consolidate investment, tax, and plan prompts into a single ranked list:

- threshold/checkpoint reviews;
- expiring interest positions;
- retirement-plan drift;
- stale or missing data.

Each item needs one reason, one severity, one action, and a dismiss/snooze rule.
This prevents the dashboard from becoming a wall of unrelated warning cards.

## Next — user intent and planning

### 5. Target allocation and drift

- Let the user define versioned targets by asset class, currency, or custom tag.
- Display current vs target and drift in percentage points.
- Preserve historical target versions so old snapshots are interpreted against
  the target that existed at the time.

This needs a new `allocation_targets` model and should precede any rebalance
recommendation.

### 6. Buy-only contribution planner

- Given an amount to invest, propose purchases that reduce target drift without
  selling or creating taxable disposals.
- Respect minimum order size, selected currency, and excluded assets.
- Present it as a scenario, never as an automatic transaction.

### 7. Exposure Explorer

Replace duplicate breakdown cards with one lens switch:

- Asset class
- Currency
- Platform
- Tag

Reuse the same ranked rows, selection, deltas, and filtered CTA. The current
`by_tag` data can power the fourth lens without a new backend model.

### 8. Monthly investment goal

Use the existing budget targets to show target vs actual invested this month,
with a direct link to the underlying contributions. Keep it compact and below
portfolio insight surfaces.

## Later — only after the foundations above

- Allocation history as a stacked area view with target overlays.
- FX and market stress sandbox (for example TRY −10%, US equities −15%).
- ETF look-through for sector, country, and overlap concentration.
- Risk contribution and correlation, gated on sufficiently complete history.

## Recommended sequence

Ship 1 → 2 → 3, then consolidate the Action Center and Exposure Explorer before
adding Target Allocation → Contribution Planner. This sequence makes the current
dashboard more useful with existing data, then adds new stored intent only when
the interaction model is trustworthy.

## Success signals

- Allocation selection reaches a filtered portfolio in one action.
- Users can explain the largest monthly allocation change from the dashboard.
- Every alert has a clear next action and no duplicate card elsewhere.
- Target/drift calculations can be reproduced from visible percentages.
- Above-the-fold space remains portfolio-first on desktop and mobile.
