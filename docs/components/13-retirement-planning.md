# Component 13: Retirement Planning — Behavioral Spec

> Layer: behavioral (tech-agnostic). Implementation → [technical/13-retirement-planning.md](technical/13-retirement-planning.md)

## Purpose

The forward-looking counterpart to the P&L engine. Where every other component
answers "what happened to my money?", this one answers the planning questions:

1. **Plan** — four questions about one plan, each asked in the user's own words:
   *when can I retire?*, *when can I stop contributing?*, *how much should I
   contribute?*, *what will I have?* Each is answered with the answer itself,
   and — wherever the retirement age is something the user entered rather than
   the thing being solved for — with an explicit verdict: does this plan work,
   yes or no.
2. **Compare** — the same contribution plan run through different investment
   options (US equities, gold, BES, TRY deposits, or any custom growth rate),
   side by side, **after Turkish tax**.

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
- [Earliest retirement age](GLOSSARY.md#earliest-retirement-age) — the answer to
  "when can I retire?"
- [Supported spending](GLOSSARY.md#supported-spending) — the "spend less" escape
  route of a falling-short verdict
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

**Question-first.** The tab is a switch between four questions, and the switch's
own labels ARE the questions. Under the chosen question sits its answer, as
large as any headline figure on the app: an age, a monthly amount, a value. A
question whose answer does not exist under the assumptions says so in words and
never shows a number.

1. **"When can I retire?"** — given the plan's contribution and spending, the
   earliest age whose projected value reaches the [retirement
   target](GLOSSARY.md#retirement-target) *for that age*. The target moves with
   the age asked about — retiring later inflates the spending it has to fund,
   and under capital depletion shortens the drawdown it has to buy — so it is
   re-derived for every candidate age; comparing every age against the target of
   the age in the plan would answer a different question. A candidate's
   [contribution end age](GLOSSARY.md#contribution-end-age) is the earlier of
   the saved one and the candidate itself, so a plan that contributes right up
   to retirement goes on doing that at every age asked about, and a plan that
   stops early goes on stopping there. The answer is also marked on the chart.
2. **"When can I stop contributing?"** — the [coast
   date](GLOSSARY.md#coast-fire-gap) expressed as an age: the first age at which
   growth alone is projected to finish the job. A plan already past its [Coast
   FIRE number](GLOSSARY.md#coast-fire-number) answers "now" and is celebrated
   explicitly rather than shown as a negative number to decode. This question
   carries the Coast FIRE figures with it: the Coast FIRE number against the
   current portfolio value, the [Coast FIRE gap](GLOSSARY.md#coast-fire-gap)
   with the time to the coast date, and the retirement target with its own gap
   and time-to-target at the planned contribution. Like every Coast FIRE figure
   it respects the withdrawal strategy: depletion targets are smaller, so coast
   numbers and dates move with them.
3. **"How much should I contribute?"** — the monthly contribution that reaches
   the target by the retirement age, plus a short menu of **round-number
   alternatives** around it. Each suggested amount carries what it buys: the
   earliest retirement age it allows, the age it could stop contributing at, and
   whether it clears the target at the retirement age in the plan. The menu's
   figures come from the same solves as the headline answers, so a row and a
   headline can never disagree.
4. **"What will I have?"** — the projected value at the retirement age, against
   the target, with the milestones table underneath.

**Verdict.** Every question except the first fixes the retirement age as an
input, so every one of them can be answered yes or no, and is — in a sentence,
in the canonical gain/loss colours. A plan that works says by how much it works
(the surplus, and how many years earlier it could have retired). A plan that
falls short says by how much, then offers the three ways out of the same
shortfall: **retire later** (the earliest age that does work), **contribute
more** (the required monthly amount), or **spend less** (the monthly spending,
in today's money, the plan's projected value actually supports). A route whose
solve has no answer is left out rather than fabricated; when none of them has an
answer, the verdict says the target is not reachable under these assumptions.

- Chart: projected portfolio value over time (band), with the retirement age
  and the target — **labelled with the target's own value** — marked, and, when
  the plan coasts, BOTH the age contributions are planned to stop and the
  earliest age they could stop, each labelled with its own age. **A displayed
  portfolio value never goes below zero:** a plan that overspends runs negative
  in the maths (deliberately — the solvers need to see how far short it falls),
  but the chart, its axis and the milestone figures are floored at 0, and the
  band that has run out says **"depleted at age N"** — in its cell, in the
  tooltip, and as a marker on the chart — instead of showing a floored zero or
  a −$2.16M "value". Age markers never overprint each other: they sit on
  opposite sides of their lines and on different rows. The "when can I stop contributing?" question shows that pairing over
  the rising Coast FIRE curve, with the crossing marked as the coast date;
  the other questions show it over the plan projection.
  Both withdrawal strategies continue past retirement,
  showing the same drawdown — retirement spending, stepped up annually with
  inflation — up to the age entered alongside the retirement age. That age
  reads two ways: under capital depletion it is the depletion age the portfolio
  is spent to zero by; under capital preservation it only says how far past
  retirement to draw the chart, and the line typically keeps rising there
  because the withdrawal stays inside the safe withdrawal rate.
- **Milestones table** under the chart of "what will I have?", answering "how
  much do I have at age X?"
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

**Outputs (rendered):** the answer to the active Plan question and its verdict;
the plan projection (band chart) or the Coast FIRE crossing chart, per question;
the suggested-contribution menu and the milestones table, each under the
question it belongs to; the comparison table + chart (gross, tax estimate,
after-tax, real after-tax per option); sensitivity insights.
All monetary outputs available in nominal and real, USD-anchored, in the display
currency.

**Persistence:** scenarios (named input sets) per user, cross-device; exactly
one default scenario. Nothing else this component computes is stored — outputs
are always recomputed from inputs.

## UI contract

- A dedicated top-level destination ("Retirement") alongside the existing
  pages, with two tabs: **Plan / Compare**. The Coast FIRE figures are not a
  destination of their own — they are the answer to a Plan question, and live
  inside it.
- A persistent scenario panel: scenario picker (create / rename / save /
  delete / set default), the input fields above, and the assumption set behind
  a collapsible "Assumptions" section so casual use isn't buried in knobs.
  On a phone the **whole panel** starts collapsed behind a one-line summary of
  the plan (monthly contribution · retirement age · safe withdrawal rate, with
  an Edit affordance), so the question tabs and their answer are on screen
  without scrolling past a dozen inputs; from the small width up the panel is
  always open.
- Every advanced term surfaces its one-line glossary explainer inline
  (tooltip or caption).
- An input that the loaded withdrawal strategy does not use is shown but not
  editable, with an explainer saying why: under capital depletion the safe
  withdrawal rate drives nothing (the target is the spending to the depletion
  age), so the field is inert — and the value it holds is left untouched, ready
  for a switch back to capital preservation.
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

- [ ] All four Plan questions solve correctly and agree with each other:
      solving for the contribution then projecting it reproduces the target;
      projecting at the earliest retirement age reaches that age's own target
      while the year before it falls short.
- [ ] The earliest retirement age re-derives the target for every candidate age
      (a test pins that a frozen target answers earlier), keeps a contribution
      end age that is short of the candidate, and renders "not reachable under
      these assumptions" rather than an age past the depletion age.
- [ ] The spending a projected value supports inverts the retirement-target
      formulas exactly, under both withdrawal strategies (round-trip tests), and
      is reported in today's money like the spending input it answers.
- [ ] The verdict is explicit on every question that fixes the retirement age:
      works (with the surplus and the years it could be brought forward) or
      falls short (with the shortfall and the three escape routes), in the
      canonical gain/loss palette. A route with no solve is omitted, never
      fabricated.
- [ ] The suggested-contribution menu's figures come from the same solvers as
      the headline answers, and its "reaches the target" column agrees with the
      verdict at the plan's own contribution.
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
- [ ] The Coast FIRE figures, curve and coast date derive from the same
      projection core as every other Plan figure; already-coasting renders its
      explicit celebratory state as that question's verdict.
- [ ] A plan that coasts marks BOTH coast ages on its chart — the planned one
      and the earliest possible one — each labelled with its own age (never
      overprinting), and the
      two collapse to one marker when they are the same month.
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
- [ ] The Plan milestones table (under "what will I have?") lists the contribution end age (when short of
      retirement), the retirement age, five-year steps and the horizon age, and
      its values equal the chart's at those ages under both nominal and real.
- [ ] Sensitivity insights are solver outputs and match the charts exactly.
- [ ] Nominal/real toggle re-derives all displayed values; real views are
      labeled "today's purchasing power".
- [ ] No displayed projection figure is negative: the chart, its y-axis and the
      milestone table floor at zero, and a depleted band names the age it ran
      out at. The solvers keep the unfloored series.
- [ ] The target line carries its own value.
- [ ] Scenarios persist per user across devices; the default loads on entry;
      first use renders with sensible defaults.
- [ ] Glossary-term singularity holds across UI, code identifiers, and docs.
- [ ] Impossible solves render the "—"/not-reachable convention, never a
      fabricated number.
