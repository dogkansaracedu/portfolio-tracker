# Component 13: Retirement Planning — Technical (this build)

> Layer: React/Vite/Supabase implementation. Contract → [../13-retirement-planning.md](../13-retirement-planning.md)

## Stack

- React 19 + Vite + TypeScript; Tailwind 4 + shadcn/ui (`Card`, `Tabs`,
  `Table`, `Select`, `Dialog`, `AlertDialog`, `Tooltip`, `Skeleton`); Recharts
  for the three charts (lazy-loaded via `LazyChart.tsx`).
- BigNumber.js everywhere money moves; `.toNumber()` only at the render
  boundary (`src/components/retirement/display.ts`).
- The engine (`src/lib/retirement/`) is pure and UI-free: the views call it,
  never re-derive it. There is no second growth or tax path in the UI.

## Engine surface the UI consumes

| Export (from `@/lib/retirement`) | Used by |
| --- | --- |
| `normalizeScenarioInputs(storedInputs)` | Every read of a saved scenario (`useRetirementPlanner`) — fills inputs the row predates, clamps the age-dependent ones. |
| `projectScenario(inputs, { band, startingAmountUsd, includeRetirementDrawdown, monthlyContributionUsd, accumulationMonths })` | Plan chart bands, coast chart bands, the "what will I have?" headline and the suggestion table's target check (both accumulation-only). |
| `valueAtMonthsFromNow(projection, monthsFromNow, startingAmountUsd)` | The end-of-month indexing convention, owned by the engine: charts, the milestones table and `solveEarliestRetirementAge` all read a projection through it. |
| `planMilestones(inputs)` | Plan tab milestones table (ages + phase; values come from the projections already computed). |
| `computeRetirementTarget(inputs)` | Every Plan headline and verdict, the target reference line, the coast strip. |
| `solveSupportedSpending(inputs, valueAtRetirementUsd)` | The "spend less" escape route of a falling-short verdict (`target.ts`, beside the formula it inverts). |
| `computeCoastOutlook(inputs, options)` | "When can I stop contributing?" — target + Coast FIRE number + gap + curve + projection + coast date + coast **age**, in one call. Also each suggestion row's coast age. Wraps `computeCoastFireNumber` / `coastFireCurve` / `computeCoastFireGap` / `findCoastDate`, which stay exported for the pieces. |
| `solveEarliestRetirementAge(inputs, options)` | "When can I retire?", the verdict's "retire later" route, and the suggestion table's earliest-retirement column. |
| `solveRequiredContribution` / `solveMonthsToTarget` | "How much should I contribute?", the verdict's "contribute more" route, the coast strip's time-to-target. |
| `computeSensitivityInsights` | Plan tab insights (structured effects → sentences in the UI). |
| `runComparison(inputs, { startingAmountUsd })` | Compare tab table + chart. |
| `toReal(nominalUsd, monthsFromNow, usdInflationPct)` | The global nominal/real toggle. |
| `monthsToRetirement` / `yearsToRetirement` / `PROJECTION_BAND` / `DEFAULT_RETIREMENT_SCENARIO_INPUTS` / `RETIREMENT_OPTION_PRESETS` | Horizons, band iteration, first-use defaults. |

`ProjectionMonth.phase` is one of `contributing` / `coasting` / `retirement`
(GLOSSARY: projection formula). The two pre-retirement phases run in **one**
loop — `contributionForMonth` returns zero from `contributingMonths` on, so a
coasting month is the same recurrence with `c_t = 0` and every downstream
replay of the schedule (BES state contribution, principal split, tax lots) gets
the coasting window for free. Nothing switches exhaustively on `phase`;
`tax/lots.ts` selects the taxable exit as "every month that is not `retirement`".

`ProjectionMonth.valueUsd` is an **end-of-month** value: month index `t` is
`t + 1` months from now, and `monthsFromNow = 0` is the starting amount itself
(`valueAtMonthsFromNow` in `projection.ts` encodes this once).

## File map

### Engine (`src/lib/retirement/`)

Pure modules; `index.ts` re-exports them all. Beyond the long-standing
`projection.ts` / `target.ts` / `coast.ts` / `solvers.ts` / `real.ts` /
`insights.ts` / `compare.ts` / `presets.ts` / `constants.ts` / `types.ts`:

| File | Role |
| --- | --- |
| `scenario.ts` | `StoredRetirementScenarioInputs` (the shape a persisted row can actually have) + `normalizeScenarioInputs` — the one read edge for saved scenarios: fills `contributionEndAge` with `retirementAge` when the row predates the field, and clamps it between `currentAge` and `retirementAge`. Add a field to `RetirementScenarioInputs` ⇒ give it a default here in the same change. |
| `milestones.ts` | `planMilestones(inputs)` → the Plan table's `{ age, monthsFromNow, phase }` rows (contribution end age when short of retirement, retirement age, `MILESTONE_STEP_YEARS` steps, the horizon age; deduped, ascending) and `phaseAtMonthIndex`, which reproduces the core's own phase boundaries. Pure age arithmetic — no projection runs here. |
| `solvers.ts` | The inverse questions solved against `projectScenario`: `solveRequiredContribution` (bisection), `solveMonthsToTarget` (month scan), and `solveEarliestRetirementAge` — ONE projection over `MAX_RETIREMENT_AGE_SEARCH_YEARS` answers every candidate age, because a candidate's contributions stop at `min(saved contribution end age, candidate)`, which is exactly the `contributingMonths` that projection already carries; the target, however, is recomputed per candidate (`computeRetirementTarget` on `normalizeScenarioInputs({ ...inputs, retirementAge: age })`). Candidates at or past the depletion age are skipped under `capital_depletion` — their drawdown is zero months, which prices the target at zero (same guard as `computeSensitivityInsights`). |
| `target.ts` | `computeRetirementTarget` and its inverse `solveSupportedSpending(inputs, valueAtRetirementUsd)` — closed forms of the same two expressions (preservation: `value × SWR ÷ 12`; depletion: the growing annuity solved for `P`, degenerate `value ÷ m` when `r_m = g_m`), both de-inflated to today's USD. The inverse lives here, not in `solvers.ts`, so the pair cannot drift; a round-trip test pins them. |
| `coast.ts` | The Coast FIRE pieces plus `computeCoastOutlook(inputs, options)`, which assembles them (target, number, gap, `coasting`, curve, accumulation-only projection, coast date and coast **age**) so the headline, the strip, the chart marker and a suggestion row always name the same date. |
| `projection.ts` | Also carries `monthsToContributionEnd(inputs)` (capped at `monthsToRetirement`) and the `contributingMonths` parameter of `projectGrowth`/`contributionForMonth` that the coasting phase rides on. The recurrence rounds its running value to `DECIMALS.projection` each month (see the recompute path below) — the app's only mid-calculation rounding, and it belongs to `projectGrowth`, not to callers. |

### Route + navigation

| File | Role |
| --- | --- |
| `src/App.tsx` | `<Route path="retirement">` (lazy, inside `AppLayout`). |
| `src/components/layout/Sidebar.tsx` | One `navItems` entry (`PiggyBank`); `MobileNav` reuses the same array. |
| `src/components/charts/LazyChart.tsx` | Registers `RetirementPlanChart`, `RetirementCompareChart`, `RetirementCoastChart` so Recharts stays code-split. |

### Page + state

| File | Role |
| --- | --- |
| `src/pages/RetirementPage.tsx` | Shell: header + the global Nominal/Real toggle, the shared `ScenarioPanel`, and the `Plan / Compare` tabs (Coast FIRE is a Plan question, not a tab). Holds `tab` and `valueView`; builds the `RetirementDisplay` from the scenario's USD-inflation assumption. Renders `RetirementSkeleton` while scenarios load. The panel gets `planner.inputs`; the tabs and the display edge get `planner.engineInputs` / `engineStartingAmountUsd` (see the recompute path below). |
| `src/hooks/useRetirementPlanner.ts` | The scenario state machine: shared scenarios (`useRetirementScenarios` → `RetirementScenarioContext`), the loaded default, the locally edited `inputs` draft, `dirty` (JSON compare against the saved row), and the persistence actions (`save`, `createScenario`, `renameActive`, `deleteActive`, `makeActiveDefault`, `discardEdits`). Resolves `startingAmountUsd`: the scenario's own value, or `usePnL(useHoldings().holdings, usePrices().prices).totalCurrentValueUsd` when it is `null`. A `pendingSelectionRef` holds the adoption effect back until a just-created row lands in the refreshed list, so a create can't drag the draft onto another scenario. **Normalize-on-read:** `RetirementScenario.inputs` is typed `StoredRetirementScenarioInputs` (today's inputs minus anything added after the row was written), so every path that adopts a row — the load effect, `selectScenario`, `discardEdits` — must pass it through `normalizeScenarioInputs`, and the `dirty` comparison normalizes the saved side too so an old scenario doesn't load looking edited. Also exposes `engineInputs` / `engineStartingAmountUsd`: the same draft through one `useDeferredValue` over the `{ inputs, startingAmountUsd }` pair (deferred together, so a projection can never pair new inputs with a stale starting amount). |

### Components (`src/components/retirement/`)

| File | Role |
| --- | --- |
| `constants.ts` | Every label, tab/mode id, caption, glossary hint, chart palette and sampling cap. Labels are the GLOSSARY term verbatim, including `PROJECTION_PHASE_LABELS` (Contributing / Coasting / Retirement), the milestones-table strings, `PLAN_MODE_LABELS` (the four questions, verbatim), `PLAN_HEADLINE_LABELS`, `VERDICT_LABELS`, `COAST_LINE_LABELS` / `EARLIEST_RETIREMENT_LINE_LABEL` (chart markers), `COAST_STRIP_LABELS`, and the suggestion-table strings + rounding steps. |
| `display.ts` | `useRetirementDisplay(usdInflationPct, valueView)` — the single display edge: `toViewUsd` (real = `toReal`), `chartValue` (→ display currency number), `money` / `signedMoney` (formatted + obfuscation-aware), `moneyFromChartValue` (tooltips), `axisTick` (compact `$1.2M`). Also `formatMonthsDuration`, `formatAge` and `formatAgeLabel` ("Age 52" — the one spelling of an age as a label, used by the answers, the chart markers and the suggestion rows). |
| `chartSeries.ts` | Projection months → chart points: `sampleMonthsFromNow` (stride sampling with pinned months), `ageAt`, `buildBandPoints` (base line + `[pessimistic, optimistic]` tuple for Recharts' range `Area`), plus the two display-only helpers `floorForDisplay` (clamps a plotted/tabled value at 0 — the projections themselves stay unfloored for the solvers, which is where the y-domain's old −$2.16M came from) and `depletionAge(projection, currentAge)` (first month with `valueUsd <= 0`, read from the same projection the chart draws). The end-of-month lookup it builds on, `valueAtMonthsFromNow`, belongs to the engine (`projection.ts`) — the convention is the engine's, not the chart's. |
| `ScenarioPanel.tsx` | Scenario picker (`Select`) + create / rename / set-default / delete / save / discard, the core inputs (including the **Contribution end age** field, which sits with the other ages and carries the coasting explainer), and the collapsible **Assumptions** section (primary expected-return triple, USD/TRY inflation, TRY depreciation, per-option expected returns and any flat effective tax rate). The `depletionAge` field is editable under both strategies, its label/hint switching via `DEPLETION_AGE_LABELS` / `DEPLETION_AGE_HINTS` ("Depletion age" vs. "Show until age"); the `safeWithdrawalRatePct` field mirrors that per-strategy adaptation the other way — under `capital_depletion` it is `disabled` (the target is the spending annuity) and its hint switches via `SAFE_WITHDRAWAL_RATE_HINTS`, leaving the stored value untouched. The picker's `SelectValue` takes a formatter function (`scenarioLabel`) — Base UI renders the raw selected *value*, i.e. the scenario id, when given none. The starting-amount field passes `displayValue` (the live total through `formatCurrency` + `obfuscate`, the same string as the caption under it) because a disabled `NumberField` renders as text, not as a locale-formatted native number input. Fields are keyed by scenario id so their typing buffers re-seed on switch. |
| `ScenarioNameDialog.tsx` | Name prompt for create / rename. |
| `RetirementControls.tsx` | `Hint` / `HintLabel` (the glossary explainer every advanced term carries), `NumberField` (string buffer so half-typed input survives; a disabled field renders as `type="text"` from `displayValue ?? String(value)` — a native number input paints its value in the *browser's* locale, e.g. `55597,51`), `SegmentedControl`, `StatTile`. |
| `PlanTab.tsx` | The four question modes (`PLAN_MODE`: earliest retirement / coast / required contribution / final value), the answer headline with its "—"/not-reachable convention, and the per-question body. The headline is one memo returning the `SolvedMode` union — **only the question on screen is solved**, so an earliest-age scan or a required-contribution bisection never runs for a question nobody asked. Two more memos are gated the same way: the band projections are skipped in the coast question (which draws its own, accumulation-only), and `computeCoastOutlook` runs only when the coast question is open or the plan coasts (`contributionEndAge < retirementAge`) and the chart needs the earliest-coast marker. |
| `PlanVerdict.tsx` | The yes/no banner for every question that fixes the retirement age. Projects once, compares with the target, and — only when short — runs the three escape routes (`solveEarliestRetirementAge`, `solveRequiredContribution`, `solveSupportedSpending`), each omitted from the sentence when its solve is null or when it does not actually improve on the plan. Given `coastingByUsd` (the coast question's gap when ≤ 0) it renders the celebratory already-coasting verdict instead and skips the solves entirely. Its own component boundary is deliberate — see the recompute path. |
| `PlanCoastMode.tsx` | The coast question's body: the three-tile Coast FIRE strip (number vs. current value, gap + coast date, retirement target + gap + time-to-target) over `CoastChart`. Reads every figure from the `CoastOutlook` `PlanTab` solved; the only solve of its own is `solveMonthsToTarget` for the third tile. |
| `ContributionSuggestions.tsx` | The round-number menu under "how much should I contribute?": `suggestedContributionsUsd` rounds `SUGGESTION_MULTIPLIERS` of the required figure to $250 (or $50 below $1,000), deduped and floored at one step; each row then runs `solveEarliestRetirementAge` + `computeCoastOutlook` + one `projectScenario`. Four rows is the cap on that work. When the requirement is null the table renders nothing (the headline already says not reachable); when it is zero the plan's own contribution anchors the menu. |
| `PlanMilestones.tsx` | The milestones table (desktop) / cards (mobile), same pattern as `CompareTab`: age, phase, and the pessimistic / **base** (headline weight) / optimistic value per row. A non-positive value renders `DEPLETED_AT_LABEL(age)` from `depletionAge` instead of a floored zero (hence the `currentAge` prop). Rows come from `planMilestones(inputs)`; values from `valueAtMonthsFromNow` over `PlanTab`'s projections — it never projects anything itself, and every figure goes through the `RetirementDisplay` edge. |
| `coastMarkers.tsx` | `coastMarkerLines({ plannedCoastAge, earliestCoastAge, earliestColor })` → the pair of coast `ReferenceLine`s ("Planned coast: 35" / "Could coast at: 32"), shared by both charts, with `showsEarliestCoast` dropping the second when the two land in the same month. A **function returning an array**, not a component: Recharts classifies a chart's own children, so a wrapper component would not register as reference lines at all. |
| `PlanChart.tsx` | `ComposedChart`: range `Area` (pessimistic–optimistic, `--primary` at 12%) + base `Line` (`var(--primary)`), `ReferenceLine`s for the retirement age (`insideTopRight`), the retirement target — labelled with its own formatted value, `insideTopLeft`, which for a horizontal line means "beside the line", i.e. wherever the target value falls — the earliest retirement age when the "when can I retire?" answer is on screen (`insideTopLeft` **plus a `dy` offset row**), and a destructive-toned `depletionAge` marker for the pessimistic band (`insideTopRight`, two rows down). Every vertical marker labels at the TOP so it can never land on the baseline where a low target line's label sits; markers that can be near each other get their own row, because two years of age is ~10px of chart on a phone. The tooltip is capped at 240px and wraps (its band row is two full money figures), and — only when `contributionEndAge < retirementAge` — the coast marker pair. Points come from `buildBandPoints`, whose values are floored at 0, so the y-domain starts at zero. `PlanTab` asks `projectScenario` for `includeRetirementDrawdown` under **both** withdrawal strategies, so the line always carries on past retirement to `depletionAge` — down to zero when depleting, typically still rising under preservation. |
| `SensitivityInsights.tsx` | Calls `computeSensitivityInsights` itself (from `PlanTab`'s inputs) and phrases the engine's structured effects as full sentences (contribution steps → time saved; retirement-age shifts → required contribution), with the not-reachable wording for null solves. The solves live here, not in `PlanTab`, so they sit behind their own component boundary — see the recompute path below. |
| `CompareTab.tsx` | `runComparison` → table (desktop) / cards (mobile): gross, retirement tax estimate (its `note` as a tooltip), **after-tax** (headline weight), after-tax in today's purchasing power. Caption: estimates under current law. |
| `CompareChart.tsx` | One `Line` per option, base case only — five shaded bands would not stay legible — with a legend, a colour swatch shared with the table rows, and a fixed categorical palette (never cycled). |
| `CoastChart.tsx` | The rising Coast FIRE curve (dashed, slot-2 hue) over the projected portfolio band, with the coast date as a `ReferenceDot` and the coast marker pair as lines. Registered lazily as `RetirementCoastChart`. |
| `RetirementSkeleton.tsx` | Loading placeholder for the panel + first chart. |

## Recompute path (why typing stays responsive)

Nothing here is cached or persisted: every figure is re-derived from the inputs,
and a single keystroke in the scenario panel invalidates all of it. On the
default scenario one edit is a few hundred month-by-month projection runs,
because the solvers are numeric: a required contribution is a bisection of ~45
projections (~22 ms), each sensitivity insight is another solve (~43 ms for the
set, still the largest single cost), and the suggestion table is four rows of
three solves. The two solvers added with the question modes are cheap by
comparison — `solveEarliestRetirementAge` is ONE long projection plus a
closed-form target per candidate age (~4 ms), and `solveSupportedSpending` is
closed form.

**The projection recurrence is rounded to `DECIMALS.projection` (10 dp) every
month** — `projectGrowth` in `projection.ts`, both the accumulation and the
drawdown step. BigNumber's `times` is exact, so an unrounded running value gains
the growth factor's whole decimal expansion every month (4,797 decimal places by
month 300, 19,197 by the 1,200-month horizon `solveMonthsToTarget` scans) and a
projection's cost turns quadratic in its horizon. The cap makes one settled edit
**~43x cheaper** (2,142 ms → 50 ms; the 1,200-month scan alone went 185 ms →
0.9 ms). It is a real change to the numbers and deliberately bounded: measured
against the unrounded recurrence across targets, band projections, solver
outputs, insights and every comparison row, the largest drift was **6e-8 USD**
on a $52M 60-year figure — ~1e-15 relative, below double precision and far below
the cent everything here displays and compares at. No test expectation moved.

Three things then keep that work off the keystroke:

1. **Deferred engine inputs** — `useRetirementPlanner` exposes the draft twice.
   `ScenarioPanel`'s fields render from `inputs` (urgent), everything that runs
   the engine renders from `engineInputs` (`useDeferredValue`), so React commits
   the typed character before starting the recompute and abandons intermediate
   values when the next keystroke lands first.
2. **Only the mounted tab computes** — Base UI's `Tabs.Panel` defaults to
   `keepMounted={false}`, so the hidden tab is unmounted and `runComparison`
   does not run while the Plan tab is open. Do not add `keepMounted` here.
   Within the Plan tab the same rule applies to the question switch
   (`SolvedMode`, plus the gated `projections` and `coastOutlook` memos): a
   question nobody asked is never solved.
3. **Chunked so React can interrupt** — React only yields between components, so
   a memo is all-or-nothing once entered. The three heavy passes therefore live
   in their own components rather than in `PlanTab`: `SensitivityInsights`
   (the largest), `PlanVerdict`'s escape routes, and
   `ContributionSuggestions`' four rows. The Plan tab's own render (the band
   projections + the answer headline) is the cheap half, and each of the others
   is a separate unit of work React can drop when another keystroke arrives.
   Keep it that way — and keep the suggestion menu at four rows.

## Tax layer (`src/lib/retirement/tax/`)

Every rate/threshold/bracket lives in `tax/constants.ts` as data, each constant
annotated with its legal basis + source URL, all traceable to
[docs/retirement-tax-rules.md](../../retirement-tax-rules.md) (verified
2026-08-15). Never edit a constant without re-verifying that document first.

| File | Role |
| --- | --- |
| `tax/constants.ts` | The sourced rate tables: 2026 brackets (`TRY_INCOME_TAX_BRACKETS` + base year), Yİ-ÜFE ≥10% gate, BES (20% state contribution CBK 10811, cap basis 396,360 TL, vesting schedule, 15/10/5 exit withholding), deposit tiers 17.5/15/10, plus `ASSUMED_USD_TRY_SPOT_RATE` — the **one number with no legal source** (needed to scale TRY gains onto the bracket table; labeled editable assumption; seeding it from the live FX rate is a known follow-up requiring a `types.ts` contract change). |
| `tax/lots.ts` | The lot proxy: each month's contribution is one lot at that month's implied USD/TRY rate; exit value splits across lots by compounded weight. The taxable exit is the end of accumulation — every month whose phase is not `retirement`, so a coasting window keeps compounding the position instead of exiting it early, and it simply produces no lot. The growth factor is read back out of the projection recurrence itself, so a rule can never disagree with the projection. |
| `tax/brackets.ts` | `progressiveTaxTry` + bracket-threshold indexation by the TRY-inflation assumption (nominal-TL thresholds must grow or multi-decade projections overstate tax). |
| `tax/bes.ts` | `besContributionEnhancer` (20% match, TRY cap grown by TRY inflation, converted along the depreciation path), vesting/retirement-right helpers, principal split. `besPrincipalSplitUsd` replays the schedule through `contributionForMonth` with the scenario's own `contributingMonths`, so a coasting month pays nothing in — participant and state alike. |
| `tax/rules.ts` | `TAX_RULES` registry keyed by `TaxRuleId`; `estimateRetirementTax`. Adding an option never edits another option's rule. |
| `compare.ts` | `runComparison`: per option × band — resolve the USD rate (`usdRateFromTryRate` for TRY returns), project (BES gets the enhancer), apply the tax rule, derive after-tax and after-tax-real. Comparison stops at retirement (`includeRetirementDrawdown: false`) — the taxable exit is the end of accumulation. |
| `presets.ts` | `RETIREMENT_OPTION_PRESETS` (US equities / gold / BES / TRY deposit) + `DEFAULT_RETIREMENT_SCENARIO_INPUTS`, each default return sourced in a comment (Damodaran, World Gold Council); BES and TRY-deposit long-run returns have no published series and are flagged editable. |

Documented modeling simplifications (all in-code where they apply):
TRY inflation stands in for Yİ-ÜFE (the ≥10% gate applies per lot over its own
holding period); unvested BES state money is forfeited at exit in law but the
projected balance still holds it, so short-horizon estimates overstate payout
and tax (non-binding at a retirement horizon, where vesting is 100%); the BES
principal split replays the scenario's own contribution schedule; TRY-deposit
withholding taxes the nominal TRY interest (the lira principal is fixed in
lira, so depreciation-compensating interest is fully taxable) at the >1-year
tier, applied once at exit — a saver rolling 3-month deposits pays 17.5%, and
the single application is slightly optimistic.

One behavior worth knowing (pinned by test, captioned in the Compare tab):
with high TRY inflation but **low** depreciation, Yİ-ÜFE indexation can push
the indexed cost above the TRY sale value → zero tax; inflation-matching
depreciation exposes the full real gain. The opposite of the "weaker lira =
less tax" intuition.

## Conventions honoured

- **Display currency + obfuscation** — `DisplayContext`; USD figures convert at
  the live `usd_try`, amounts obfuscate, durations and percentages stay visible.
  Axis ticks follow the Dashboard hero's convention (compact, not obfuscated).
- **Signed figures** — `gainLossClass` / `formatSignedCurrency` from
  `@/lib/prices`; nothing re-implements the palette.
- **Charts** — `ResponsiveContainer` inside a `Card`, `stroke-border` grid,
  `var(--primary)` for the user's own projection, themed tooltips.
- **Nominal / real** — a display re-derivation only; stored inputs never change.
  Real views are labelled "today's purchasing power".
- **Null solves** — `NOT_REACHABLE` / `EMPTY_FIGURE`, never a fabricated number.

## Known edges

- The display-currency toggle converts future USD figures at **today's**
  `usd_try` (no forward FX path exists); planning stays USD-anchored.
- `display.ts` carries its own compact-money helper; `DashboardHero.tsx` has a
  private twin of it. Worth promoting to `@/lib/prices` when that file is next
  touched.
- Custom comparison options (user-defined name + return triple + flat rate) are
  editable when present in a scenario but cannot yet be added from the UI.
- The projection recurrence is the one place in the app that rounds mid-
  calculation (`DECIMALS.projection`, see the recompute path above). It is a
  horizon-cost decision, not a display one: raise the scale and the quadratic
  precision growth comes back, lower it and the drift stops being invisible.
