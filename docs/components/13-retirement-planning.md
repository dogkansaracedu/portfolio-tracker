# Component 13: Retirement Planning — Behavioral Spec

> Layer: behavioral (tech-agnostic). Implementation → [technical/13-retirement-planning.md](technical/13-retirement-planning.md)

## Purpose

The forward-looking counterpart to the P&L engine. Where every other component
answers "what happened to my money?", this one answers three planning questions:

1. **Plan** — if I invest a given amount monthly, what does it grow to — and the
   inverses: what monthly amount reaches my target, and how long until I get there?
2. **Compare** — the same contribution plan run through different investment
   options (US equities, gold, BES, TRY deposits, or any custom growth rate),
   side by side, **after Turkish tax**.
3. **Coast FIRE** — the portfolio value that lets growth alone finish the job,
   how far I am from it, and when I cross it.

Advanced in substance, plain in presentation: every concept carries a one-line
explainer, one term per concept app-wide, and every number on the screen derives
from a single projection core so nothing can disagree with anything else.

## Depends on

- P&L engine — the current portfolio value that seeds projections and the Coast
  FIRE comparison (Component 6)
- Database & auth — per-user persistence of scenarios (Component 2)
- Exchange-rate history — context for TRY-linked defaults (Component 5)

Explicitly **not** coupled to any budgeting feature (none exists): monthly
contribution and retirement spending are plain inputs a future budgeting
component could pre-fill.

## Concepts used — links into [GLOSSARY](GLOSSARY.md)

All new retirement terms are defined in the glossary, once, and used verbatim in
UI, docs, and code identifiers — no synonyms:

- [Contribution plan](GLOSSARY.md#contribution-plan) /
  [Contribution end age](GLOSSARY.md#contribution-end-age) /
  [Projection](GLOSSARY.md#projection) ([formula](GLOSSARY.md#projection-formula))
- [Retirement scenario](GLOSSARY.md#retirement-scenario) — the saved input set
- [Expected return](GLOSSARY.md#expected-return) — annual, compounded monthly,
  natural-currency entry for TRY-linked options
- [Nominal and real](GLOSSARY.md#nominal-and-real) — the global display toggle
- [Safe withdrawal rate (SWR)](GLOSSARY.md#safe-withdrawal-rate-swr)
- [Withdrawal strategy](GLOSSARY.md#withdrawal-strategy) — capital preservation
  vs. capital depletion
- [Retirement target](GLOSSARY.md#retirement-target)
  ([formula](GLOSSARY.md#retirement-target-formula))
- [Coast FIRE number](GLOSSARY.md#coast-fire-number)
  ([formula](GLOSSARY.md#coast-fire-number-formula)) /
  [Coast FIRE gap](GLOSSARY.md#coast-fire-gap)
- [Sensitivity insight](GLOSSARY.md#sensitivity-insight)
- [Retirement tax estimate](GLOSSARY.md#retirement-tax-estimate)
- [USD anchor](GLOSSARY.md#usd-anchor) — planning is USD-anchored like P&L

## Behaviors / rules

**One projection core.** Every figure this component shows — plan outcomes,
comparison rows, Coast FIRE numbers, sensitivity insights — is produced by the
same month-by-month [projection](GLOSSARY.md#projection-formula) recurrence or a
numeric solve against it. There is no second formula path anywhere (mirror of
the "single P&L engine" rule).

**Scenario inputs.** A [retirement scenario](GLOSSARY.md#retirement-scenario)
holds: starting amount (pre-filled from the live portfolio's current total
value, overridable), monthly contribution + annual contribution growth %,
current / [contribution end](GLOSSARY.md#contribution-end-age) / retirement /
depletion ages, monthly retirement spending (today's
USD), SWR, withdrawal strategy, and the assumption set: the **primary expected
return** triple (the user's own growth assumption — it drives the Plan and
Coast FIRE views), per-option expected-return triples (they drive Compare),
USD inflation, TRY inflation, TRY depreciation. Scenarios are
named, persist per user across devices, and one is the default loaded on entry.

**Three phases.** Every projection runs contributing → coasting → retirement.
Contributions stop at the [contribution end
age](GLOSSARY.md#contribution-end-age); from there to retirement the plan
**coasts** on growth alone, with no contributions and no withdrawals. The field
defaults to the retirement age, which makes the coasting phase empty — the
behaviour of a plan that contributes right up to retirement. A scenario saved
before the field existed loads at that default, so no saved plan changes meaning.

**Filling in inputs saved scenarios lack.** Inputs added after a scenario was
saved are filled in when it is loaded, always with the behaviour that scenario
was saved under, and clamped to stay consistent with the ages around them. No
view or calculation ever sees a half-populated scenario.

**Bands, not lines.** Every projection runs three times — pessimistic / base /
optimistic expected returns — and renders as a base line inside a shaded band.
Single-line outputs (tables, insights) use the base case and say so.

**Nominal / real toggle.** One global toggle per the glossary definition;
default nominal; real views labeled "today's purchasing power". The toggle
re-derives displayed values only — stored inputs are unchanged.

### Plan tab

- Solves all three directions of the same problem, each a first-class mode:
  final value (given contribution + horizon), required monthly contribution
  (given target + horizon), time to target (given contribution + target).
- Chart: projected portfolio value over time (band), with the retirement age
  and target marked — and, when the plan coasts, the age contributions stop.
  Both withdrawal strategies continue past retirement,
  showing the same drawdown — retirement spending, stepped up annually with
  inflation — up to the age entered alongside the retirement age. That age
  reads two ways: under capital depletion it is the depletion age the portfolio
  is spent to zero by; under capital preservation it only says how far past
  retirement to draw the chart, and the line typically keeps rising there
  because the withdrawal stays inside the safe withdrawal rate.
- **Milestones table** under the chart, answering "how much do I have at age X?"
  without hovering the line. One row per milestone age, ascending and deduped:
  the [contribution end age](GLOSSARY.md#contribution-end-age) when it is short
  of retirement, the retirement age, then every five years out to the chart's
  own horizon (the depletion age when depleting, the show-until age when
  preserving) with that horizon age always included. Each row names the age, the
  phase it falls in (Contributing / Coasting / Retirement — the phase of the
  month ending at that age), and the projected value under each of the three
  bands, with the base case emphasised. Values are read from the same three
  projections the chart draws, so table and line can never disagree, and they
  follow the nominal/real toggle like everything else.
- Shows [sensitivity insights](GLOSSARY.md#sensitivity-insight): at least
  contribution steps (+25% / +50% → time saved) and retirement-age shifts
  (±5 years → required contribution). Insights are solver outputs, phrased in
  full sentences with the changed input and the moved output both explicit.

### Compare tab

- A comparison = **one contribution plan × N options**. Same flows into every
  option; only growth and tax differ (same-flows philosophy as the
  [what-if index](GLOSSARY.md#what-if-index-same-flows-benchmark)).
- Ships with four **presets** — US equities, gold, BES, TRY deposit — plus
  user-defined **custom options** (name + expected-return triple + optional
  flat effective tax rate). Preset defaults (returns and tax parameters) are
  editable; edits live in the scenario.
- Output: a table per option — final value (gross), retirement tax estimate,
  after-tax final value, after-tax real value — and one chart with a line/band
  per option. After-tax is the headline column.
- BES is modeled with its state-contribution mechanics (an additional
  contribution stream with a cap and a vesting schedule) so its comparison is
  fair rather than naively return-only.

### Turkish tax model

- Each option declares a **tax rule**; a rule maps (projection outcome ×
  scenario assumptions) → [retirement tax
  estimate](GLOSSARY.md#retirement-tax-estimate). Rules are data-driven and
  pluggable — adding an option never means editing another option's rule.
- The rule system must be able to express, at minimum:
  1. taxable gain computed **in TRY** (so the TRY-inflation and
     TRY-depreciation assumptions change the tax — a large USD gain can be a
     small taxable TRY gain when depreciation tracks inflation);
  2. acquisition-cost **indexation** by a price index, gated on a minimum
     index-increase threshold;
  3. **progressive bracket** tables;
  4. withholding whose rate depends on **holding period and/or exit age**,
     applied to the return portion or the whole balance as the law specifies;
  5. state-contribution vesting (BES);
  6. a zero-tax rule (gold-style) and a flat user-entered rate (custom options).
- **Sourcing rule:** every rate, threshold, bracket, and condition comes from
  the sourced reference [retirement-tax-rules](../retirement-tax-rules.md)
  (researched with citations to primary/professional sources), stored as data
  with its legal basis annotated. Nothing is hard-coded from memory. Anything
  the research cannot verify ships as a clearly labeled editable assumption.
- **Honesty rule:** all tax outputs are labeled estimates under current law;
  the UI never presents a 20-year tax projection as a fact.

### Coast FIRE tab

- Headline tiles: the [Coast FIRE number](GLOSSARY.md#coast-fire-number) vs.
  the live current portfolio value; the [Coast FIRE
  gap](GLOSSARY.md#coast-fire-gap) and years to the coast date; the
  [retirement target](GLOSSARY.md#retirement-target) with its own gap and
  years-to-target at the planned contribution rate.
- Already-coasting state (gap ≤ 0) is celebrated explicitly, not shown as a
  negative number to decode.
- Chart: the Coast FIRE number as a curve **rising** toward the target as
  retirement approaches, with the projected portfolio (band) overlaid; the
  crossing point is marked as the coast date.
- Respects the withdrawal strategy — depletion targets are smaller, so coast
  numbers and dates move accordingly.

### Consistency rules

- Display-currency toggle and amount obfuscation apply as elsewhere; signed
  figures use the canonical gain/loss palette; USD anchor throughout.
- Terminology singularity is a hard requirement: UI labels, code identifiers,
  and docs use the glossary term exactly (e.g. "Coast FIRE number" /
  `coastFireNumber`) — a synonym appearing anywhere is a defect.
- Deterministic three-scenario bands are the v1 uncertainty model. The
  projection core must be reusable as-is by a future Monte Carlo mode
  (re-running it under randomized rates); no other Monte Carlo provision is
  made now (explicit non-goal).

## Contract (I/O)

**Inputs:** the current portfolio total value (from the P&L engine); the user's
saved scenarios (or defaults on first use); the sourced tax-rule data.

**Outputs (rendered):** plan projection (band chart + solved figure for the
active mode); comparison table + chart (gross, tax estimate, after-tax, real
after-tax per option); Coast FIRE tiles + crossing chart; sensitivity insights.
All monetary outputs available in nominal and real, USD-anchored, in the display
currency.

**Persistence:** scenarios (named input sets) per user, cross-device; exactly
one default scenario. Nothing else this component computes is stored — outputs
are always recomputed from inputs.

## UI contract

- A dedicated top-level destination ("Retirement") alongside the existing
  pages, with three tabs: **Plan / Compare / Coast FIRE**.
- A persistent scenario panel: scenario picker (create / rename / save /
  delete / set default), the input fields above, and the assumption set behind
  a collapsible "Assumptions" section so casual use isn't buried in knobs.
- Every advanced term surfaces its one-line glossary explainer inline
  (tooltip or caption).
- Charts follow the app's existing chart conventions (responsive, themed,
  tooltips with formatted currency); tables follow existing table/card
  conventions on desktop/mobile.
- States: sensible defaults render a working projection before any input is
  touched; impossible solves (e.g. target unreachable at any horizon under the
  pessimistic rate) render an explicit "not reachable under these assumptions"
  message, never a fabricated number ("—" convention).
- Editing an input never blocks the edit: the field accepts typing at full
  speed, and the projections, tables and insights re-derive behind it — the
  figures may lag the keystroke by a moment, but the input itself never does.
  Only the figures actually on screen are computed (the tab you are on, the
  Plan mode you selected); intermediate values typed through are never worth
  solving for.

## Acceptance

- [ ] All three Plan modes solve correctly and agree with each other (solving
      for the contribution then projecting it reproduces the target).
- [ ] Projection uses monthly compounding derived as `(1+r)^(1/12) − 1`; a
      worked numeric case in the test suite pins this.
- [ ] Compare runs identical flows through every option; after-tax is the
      headline; BES includes state contribution with cap + vesting.
- [ ] Tax rules cover the six capability classes; every constant traces to
      [retirement-tax-rules](../retirement-tax-rules.md) with a citation;
      unverifiable items are labeled editable assumptions.
- [ ] A TRY-taxed option's tax estimate responds to the TRY-inflation and
      TRY-depreciation assumptions (test: same USD gain, different
      depreciation ⇒ different tax).
- [ ] Coast FIRE tiles, curve, and coast date derive from the same projection
      core as the Plan tab; already-coasting renders its explicit state.
- [ ] Capital preservation vs. capital depletion produce different targets and
      Coast FIRE numbers per the glossary formulas (worked cases in tests).
- [ ] A plan whose contributions stop before retirement coasts: the months
      between carry no contribution and no withdrawal, and the phase boundaries
      (contributing → coasting → retirement) land on the entered ages.
- [ ] Every derived figure respects the contribution end age — solvers,
      sensitivity insights, comparison rows and the tax estimate alike; an
      unreachable target under a coasting window renders "not reachable under
      these assumptions" rather than a fabricated contribution.
- [ ] A scenario saved before the contribution end age existed loads with it at
      the retirement age, and its projections are unchanged.
- [ ] The Plan milestones table lists the contribution end age (when short of
      retirement), the retirement age, five-year steps and the horizon age, and
      its values equal the chart's at those ages under both nominal and real.
- [ ] Sensitivity insights are solver outputs and match the charts exactly.
- [ ] Nominal/real toggle re-derives all displayed values; real views are
      labeled "today's purchasing power".
- [ ] Scenarios persist per user across devices; the default loads on entry;
      first use renders with sensible defaults.
- [ ] Glossary-term singularity holds across UI, code identifiers, and docs.
- [ ] Impossible solves render the "—"/not-reachable convention, never a
      fabricated number.
