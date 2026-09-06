# Component 13: Retirement Planning — Technical (this build)

> Layer: React/Vite/Supabase implementation. Contract → [../13-retirement-planning.md](../13-retirement-planning.md)

## Stack

- React 19 + Vite + TypeScript; Tailwind 4 + shadcn/ui (`Card`, `Tabs`,
  `Table`, `Select`, `Dialog`, `AlertDialog`, `Popover`, `Skeleton`); Recharts
  for the four charts (lazy-loaded via `LazyChart.tsx`).
- BigNumber.js everywhere money moves; `.toNumber()` only at the render
  boundary (`src/components/retirement/display.ts`) and at the one persistence
  boundary, the `plan_start` jsonb write in `useRetirementPlanner.ts`.
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
| `computePlanTracking(options)` | "Am I on track?" (`PlanTrackingMode.tsx`, chart `PlanTrackingChart.tsx`) — the frozen plan's three bands, the planned value at the elapsed month, the value gap + `bandPosition`, the planned vs. actual contributions over the covered calendar months, and the actual series to plot. Takes the `RetirementPlanStart`, `homeDayIso()`, the live total, the daily snapshots and the monthly `investedUsd` rows; filters both actual inputs itself. |
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
| `scenario.ts` | `StoredRetirementScenarioInputs` (the shape a persisted row can actually have) + `normalizeScenarioInputs` — the one read edge for saved scenarios: fills `contributionEndAge` with `retirementAge` when the row predates the field, and clamps it between `currentAge` and `retirementAge`. Add a field to `RetirementScenarioInputs` ⇒ give it a default here in the same change. Also `RetirementPlanStart` — the frozen plan (`startedAt` home-timezone `YYYY-MM-DD`, `startingAmountUsd`, the stored `inputs`) that the `plan_start` column mirrors. |
| `milestones.ts` | `planMilestones(inputs)` → the Plan table's `{ age, monthsFromNow, phase }` rows (contribution end age when short of retirement, retirement age, `MILESTONE_STEP_YEARS` steps, the horizon age; deduped, ascending) and `phaseAtMonthIndex`, which reproduces the core's own phase boundaries. Pure age arithmetic — no projection runs here. |
| `solvers.ts` | The inverse questions solved against `projectScenario`: `solveRequiredContribution` (bisection), `solveMonthsToTarget` (month scan), and `solveEarliestRetirementAge` — ONE projection over `MAX_RETIREMENT_AGE_SEARCH_YEARS` answers every candidate age, because a candidate's contributions stop at `min(saved contribution end age, candidate)`, which is exactly the `contributingMonths` that projection already carries; the target, however, is recomputed per candidate (`computeRetirementTarget` on `normalizeScenarioInputs({ ...inputs, retirementAge: age })`). Candidates at or past the depletion age are skipped under `capital_depletion` — their drawdown is zero months, which prices the target at zero (same guard as `computeSensitivityInsights`). |
| `target.ts` | `computeRetirementTarget` and its inverse `solveSupportedSpending(inputs, valueAtRetirementUsd)` — closed forms of the same two expressions (preservation: `value × SWR ÷ 12`; depletion: the growing annuity solved for `P`, degenerate `value ÷ m` when `r_m = g_m`), both de-inflated to today's USD. The inverse lives here, not in `solvers.ts`, so the pair cannot drift; a round-trip test pins them. |
| `tracking.ts` | `computePlanTracking(options)` — plan vs. actual for "am I on track?": the frozen `RetirementPlanStart` re-projected (all three bands, drawdown included, `normalizeScenarioInputs` on read), `plannedValueUsd` at `elapsedMonths` through `valueAtMonthsFromNow`, `valueGapUsd` / `contributionGapUsd` (both planned − actual) and `bandPosition` (`BAND_POSITION`). Two clocks on purpose: `elapsedMonths` (whole months, `wholeMonthsBetween`) for the value, `monthsCovered` (calendar months, ≥ 1) for the contributions. Plan-calendar helpers `planMonthDate` / `wholeMonthsBetween` are string-only Y/M/D arithmetic — no `Date`, so no timezone drift against `homeDayIso()`. |
| `coast.ts` | The Coast FIRE pieces plus `computeCoastOutlook(inputs, options)`, which assembles them (target, number, gap, `coasting`, curve, accumulation-only projection, coast date and coast **age**) so the headline, the strip, the chart marker and a suggestion row always name the same date. |
| `projection.ts` | Also carries `monthsToContributionEnd(inputs)` (capped at `monthsToRetirement`) and the `contributingMonths` parameter of `projectGrowth`/`contributionForMonth` that the coasting phase rides on. The recurrence rounds its running value to `DECIMALS.projection` each month (see the recompute path below) — the app's only mid-calculation rounding, and it belongs to `projectGrowth`, not to callers. |

### Persistence

`public.retirement_scenarios` (`supabase/migrations/20260815120000_retirement_scenarios.sql`)
holds `inputs` jsonb plus the nullable `plan_start` jsonb added by
`20260906090000_retirement_plan_start.sql` — a `RetirementPlanStart`, null until
the scenario is started as the plan; the table's `auth.uid() = user_id` policies
are column-agnostic, so no RLS change came with it.

### Route + navigation

| File | Role |
| --- | --- |
| `src/App.tsx` | `<Route path="retirement">` (lazy, inside `AppLayout`). |
| `src/lib/constants/navigation.ts` | One `navItems` entry (`PiggyBank`); `Sidebar` and `MobileNav` reuse the same array. |
| `src/components/charts/LazyChart.tsx` | Registers `RetirementPlanChart`, `RetirementCompareChart`, `RetirementCoastChart`, `RetirementTrackingChart` so Recharts stays code-split. |

### Page + state

| File | Role |
| --- | --- |
| `src/pages/RetirementPage.tsx` | Shell: header + the global Nominal/Real toggle, the shared `ScenarioPanel`, and the `Plan / Compare` tabs (Coast FIRE is a Plan question, not a tab). Its title block is the shared `PageHeading` (`src/components/common/PageHeading.tsx`, `hidden md:block`) — on a phone the app header is the only page title. Holds `tab` and `valueView`; builds the `RetirementDisplay` from the scenario's USD-inflation assumption. Renders `RetirementSkeleton` while scenarios load. The panel gets `planner.inputs`; the tabs and the display edge get `planner.engineInputs` / `engineStartingAmountUsd` (see the recompute path below). `PlanTab` additionally gets the whole `planner` (it only reads the `Pick` its props declare: `planStart` / `startPlan` / `clearPlanStart` / `saving` / `error` / `liveValueUsd`), because "am I on track?" measures against the **frozen** plan and the live total, neither of which is part of the deferred draft. |
| `src/hooks/useRetirementPlanner.ts` | The scenario state machine: shared scenarios (`useRetirementScenarios` → `RetirementScenarioContext`), the loaded default, the locally edited `inputs` draft, `dirty` (JSON compare against the saved row), and the persistence actions (`save`, `createScenario`, `renameActive`, `deleteActive`, `makeActiveDefault`, `discardEdits`). Who reports a failed write is explicit: `run` flips `saving`, clears `error`, and **lets the rejection through** — `save` / `deleteActive` / `makeActiveDefault` wrap it in `reported`, which records the message in `error` (the panel's line) and settles, while `createScenario` / `renameActive` stay rejecting so `ScenarioNameDialog` can keep itself open and report there. `run` used to swallow every rejection, which closed the name dialog on failure exactly as on success. Resolves `startingAmountUsd`: the scenario's own value, or `usePnL(useHoldings().holdings, usePrices().prices).totalCurrentValueUsd` when it is `null`. A `pendingSelectionRef` holds the adoption effect back until a just-created row lands in the refreshed list, so a create can't drag the draft onto another scenario. **Normalize-on-read:** `RetirementScenario.inputs` is typed `StoredRetirementScenarioInputs` (today's inputs minus anything added after the row was written), so every path that adopts a row — the load effect, `selectScenario`, `discardEdits` — must pass it through `normalizeScenarioInputs`, and the `dirty` comparison normalizes the saved side too so an old scenario doesn't load looking edited. Also exposes `engineInputs` / `engineStartingAmountUsd`: the same draft through one `useDeferredValue` over the `{ inputs, startingAmountUsd }` pair (deferred together, so a projection can never pair new inputs with a stale starting amount). **Plan start:** `planStart` is the active row's `plan_start` (null when none is active or it was never started); `startPlan` freezes `{ startedAt: homeDayIso(), startingAmountUsd: startingAmountUsd.toNumber(), inputs }` onto it — the *resolved* starting amount, and the only `.toNumber()` outside the render boundary, because the jsonb column cannot hold a BigNumber. When the draft is `dirty` the same `update` writes `inputs` alongside `plan_start`, so the frozen plan is the one on screen and a started scenario's saved and frozen inputs can never disagree; with no scenario at all it first creates one through `createDefaultScenario`, the helper `save` uses. There is no `restartPlan` — `startPlan` on a started scenario overwrites the freeze and the UI owns the confirmation. `clearPlanStart` writes `plan_start: null`. Both are `reported`. **`liveValueReady`** (`!useHoldings().loading && !usePnL().loading`) guards the freeze: `usePnL` returns a placeholder zero total while transactions load, and a start in that window would anchor the yardstick at $0 for good — `startPlan` throws `LIVE_VALUE_NOT_READY` (reported on the error line) when the starting amount is the live one and the total has not loaded, and the start button waits on the same flag. `dirty` stays an `inputs`-only comparison: the freeze is not part of the draft, so writing it never makes the panel look edited, and a refresh of the same row still only re-seeds on an id change. |
| `src/hooks/usePlanTracking.ts` | The data edge of "am I on track?": gathers the two actual histories from the app-wide providers — `useSnapshots()` (snapshots with a null `total_usd` are skipped: a gap in the history is not a zero portfolio) and `useTransactionData()` → `computeMonthlyBudget({ entries: [], incomeDefaults: [], transactions, rates, fromMonth: plan-start month, toMonth: this month })` for the monthly `investedUsd`, the actual side of the contribution gap (empty income inputs only null out the income/spent legs, which this never reads) — and runs `computePlanTracking` once, in one memo. Adds no fetch of its own. Third argument `enabled` is the mode gate: the hook is always called, the memo returns null unless "am I on track?" is open and the scenario has a plan start. |

### Components (`src/components/retirement/`)

| File | Role |
| --- | --- |
| `constants.ts` | Every label, tab/mode id, caption, glossary hint, chart palette and sampling cap. Labels are the GLOSSARY term verbatim, including `PROJECTION_PHASE_LABELS` (Contributing / Coasting / Retirement), the milestones-table strings, `PLAN_MODE_LABELS` (the five questions, verbatim), `PLAN_HEADLINE_LABELS`, `VERDICT_LABELS`, `COAST_LINE_LABELS` / `EARLIEST_RETIREMENT_LINE_LABEL` / `BAND_DEPLETED_LABEL` ("Pessimistic case runs out at 61" — a chart marker has no column header to say which case ran out, and it is deliberately NOT the cell's `DEPLETED_AT_LABEL` wording, since the marker floors the age and the cell does not) / `PLANNED_HORIZON_LABEL` / `CHART_TOOLTIP_AGE_PHASE` (chart markers and labels), `COAST_STRIP_LABELS`, and the suggestion-table strings + rounding steps. The `Plan tracking` section at the end holds the "am I on track?" copy: `TRACKING_LABELS` (its `valueGap` aliases `PLAN_HEADLINE_LABELS[PLAN_MODE.onTrack]`, so the term is spelled once), `BAND_POSITION_LABELS` (`Record<BandPosition, string>`), the headline / contribution / plan-start caption builders, and `TRACKING_DIALOG_COPY` for the two confirmations. |
| `display.ts` | `useRetirementDisplay(usdInflationPct, valueView)` — the single display edge: `toViewUsd` (real = `toReal`), `chartValue` (→ display currency number), `money` / `signedMoney` (formatted + obfuscation-aware), `moneyFromChartValue` (tooltips), `compactMoneyFromChartValue` (chart labels — the same compact form, `null` while amounts are hidden so the caller drops the figure instead of printing a masked one), `axisTick` (compact `$1.2M`, the shared `formatCompactCurrency`), plus the tracking question's two spellings: `describeGap` (a planned − actual gap as words + an unsigned amount in the canonical palette — positive = behind = `gainLossClass(false)`, exact zero = `NEUTRAL_FIGURE_CLASS`) and `formatPlanDay` ("Sep 6, 2026", `DISPLAY_LOCALE`, UTC-parsed so the day cannot shift). Money goes through `formatMoney` / `formatSignedMoney`, so the display edge holds the retirement-specific parts (real-terms deflation, the chart's number form) and nothing else. Also `formatMonthsDuration`, `formatAge`, `formatAgeLabel` ("Age 52" — the one spelling of an age as a label, used by the answers, the chart markers and the suggestion rows) and `wholeAge` (floor: the year a crossing happens *during*, which is the precision chart labels read a projection at). |
| `chartSeries.ts` | Projection months → chart points: `sampleMonthsFromNow` (stride sampling with pinned months), `ageAt`, `buildBandPoints` (base line + `[pessimistic, optimistic]` tuple for Recharts' range `Area`, plus the `phase` of the month each point ends — read off the base projection's own months, so a tooltip cannot disagree with the milestones table about where the phases change), plus the two display-only helpers `floorForDisplay` (clamps a plotted/tabled value at 0 — the projections themselves stay unfloored for the solvers, which is where the y-domain's old −$2.16M came from) and `depletionAge(projection, currentAge)` (first month with `valueUsd <= 0`, read from the same projection the chart draws; it stays month-precise for the milestones table, and the chart's markers floor it through `wholeAge`). The end-of-month lookup it builds on, `valueAtMonthsFromNow`, belongs to the engine (`projection.ts`) — the convention is the engine's, not the chart's. |
| `ScenarioPanel.tsx` | Scenario picker (`Select`) + create / rename / set-default / delete / save / discard, the core inputs (including the **Contribution end age** field, which sits with the other ages and carries the coasting explainer), and the collapsible **Assumptions** section (primary expected-return triple, USD/TRY inflation, TRY depreciation, per-option expected returns and any flat effective tax rate). Both collapses are the shared `components/common/Disclosure`; the outer one wraps the entire panel with `triggerClassName="sm:hidden"` and `contentClassName="… sm:block"`, so below `sm` the panel shows only the `phoneSummary` line (`SCENARIO_SUMMARY` copy over `monthlyContributionUsd` / `retirementAge` / `safeWithdrawalRatePct`) and is always open from `sm` up. The `depletionAge` field is editable under both strategies, its label/hint switching via `DEPLETION_AGE_LABELS` / `DEPLETION_AGE_HINTS` ("Depletion age" vs. "Show until age"); the `safeWithdrawalRatePct` field mirrors that per-strategy adaptation the other way — under `capital_depletion` it is `disabled` (the target is the spending annuity) and its hint switches via `SAFE_WITHDRAWAL_RATE_HINTS`, leaving the stored value untouched. The picker's `SelectValue` takes a formatter function (`scenarioLabel`) — Base UI renders the raw selected *value*, i.e. the scenario id, when given none. The starting-amount field passes `displayValue` (the live total through `formatCurrency` + `obfuscate`, the same string as the caption under it) because a disabled `NumberField` renders as text, not as a locale-formatted native number input. Fields are keyed by scenario id so their typing buffers re-seed on switch. |
| `display.ts` → `axisLabels` | One `moneyAxisLabels(obfuscated, …)` on the shared display edge (dimensions from `CHART_AXIS_FONT_SIZE` / `CHART_AXIS_WIDTH`), spread over the money `YAxis` of **all four** charts (`PlanChart`, `CompareChart`, `CoastChart`, `PlanTrackingChart`) — hidden amounts drop the labels, so the axis keeps its scale and the plot gains the 60px gutter. `axisTick` stays the plain `formatCompactCurrency`: it never runs while the labels are gone. |
| `ScenarioNameDialog.tsx` | Name prompt for create / rename, copy in `SCENARIO_NAME_DIALOG_COPY`. Owns the outcome like every other dialog form here (cf. `PlatformForm`): `onSubmit` is expected to **reject** on failure, and the catch keeps the dialog open with the typed name and renders the message in the app's error slot — `text-destructive` between `DialogBody` and `DialogFooter`, i.e. beside the Save that raised it, which on a phone sheet is above the pinned footer rather than under the field. `DialogBody` also carries `content-start`: it is `flex-1`, so a one-field grid otherwise stretched its rows apart across the full-height sheet. Both `mode` and `initialName` are **latched at open** into local state (the same render-time `wasOpen` sync) — `ScenarioPanel` clears its `nameDialog` state on close, so reading `mode` live rewrote the heading and description to the create wording mid-exit-animation. |
| `RetirementControls.tsx` | `Hint` / `HintLabel` (the glossary explainer every advanced term carries — `Hint` is a thin wrapper over the shared `common/HintPopover`, so the icon answers to a tap and carries a 40px target below `sm`), `NumberField` (string buffer so half-typed input survives; a disabled field renders as `type="text"` from `displayValue ?? String(value)` — a native number input paints its value in the *browser's* locale, e.g. `55597,51`), `SegmentedControl`, `StatTile`. |
| `PlanTab.tsx` | The five question modes (`PLAN_MODE`: earliest retirement / coast / required contribution / final value / on track), the answer headline with its "—"/not-reachable convention, and the per-question body. The headline is one memo returning the `SolvedMode` union — **only the question on screen is solved**, so an earliest-age scan or a required-contribution bisection never runs for a question nobody asked. Three more derivations are gated the same way: the band projections are skipped in the coast question (which draws its own, accumulation-only) and in the tracking question (which draws the frozen plan's), `computeCoastOutlook` runs only when the coast question is open or the plan coasts (`contributionEndAge < retirementAge`) and the chart needs the earliest-coast marker, and `usePlanTracking` is passed `mode === PLAN_MODE.onTrack` as its `enabled` gate. "Am I on track?" is the odd mode out: it solves nothing, carries no `PlanVerdict` (its answer *is* the verdict) and reads the planner's frozen `planStart` rather than the deferred draft — the tab runs the tracking hook once and hands the result to `PlanTrackingMode`, so the headline and the strip cannot disagree. Its headline is the **value gap** in words + an unsigned amount (`describeGap`), `TRACKING_LABELS.notStarted` in the muted answer style when the scenario has no plan start. `SensitivityInsights` renders in every mode, this one included. The headline's `BASE_CASE_CAPTION` footnote is suppressed (`showsBaseCaseFigure: false`) in the not-started state, where the answer is a phrase and there is no base-case figure for it to describe. |
| `PlanVerdict.tsx` | The yes/no banner for every question that fixes the retirement age. Projects once, compares with the target, and — only when short — runs the three escape routes (`solveEarliestRetirementAge`, `solveRequiredContribution`, `solveSupportedSpending`), each omitted from the sentence when its solve is null or when it does not actually improve on the plan. Given `coastingByUsd` (the coast question's gap when ≤ 0) it renders the celebratory already-coasting verdict instead and skips the solves entirely. Its own component boundary is deliberate — see the recompute path. |
| `PlanCoastMode.tsx` | The coast question's body: the three-tile Coast FIRE strip (number vs. current value, gap + coast date, retirement target + gap + time-to-target) over `CoastChart`. Reads every figure from the `CoastOutlook` `PlanTab` solved; the only solve of its own is `solveMonthsToTarget` for the third tile. |
| `PlanTrackingMode.tsx` | The tracking question's body, in two states off one prop (`tracking: PlanTracking \| null`). **Not started:** `TRACKING_START_PROMPT` over a primary "Start this plan" button (`planner.startPlan`, disabled while `saving`, `planner.error` under it) — no yardstick, so no fabricated gap. **Started:** a two-tile strip (contribution gap + its "contributed X of Y planned over N" caption; plan start = the frozen date, captioned with the frozen starting amount / monthly contribution / retirement age through `TRACKING_PLAN_START_CAPTION`, which reuses the `SCENARIO_SUMMARY` pieces) over `PlanTrackingChart`, then a compact actions row: "Restart plan" (outline) and "Stop tracking" (ghost), each behind its own `AlertDialog` because both destroy the current freeze. One dialog per action rather than one with switched copy — the state that says *which* is also the state that closes it, so a shared dialog would rewrite its heading mid-exit-animation (the bug `ScenarioNameDialog` latches around). The gap wording and the plan-date spelling come from the display edge (`describeGap` / `formatPlanDay` in `display.ts`), shared with the tab's headline and the chart's tooltip. The start button is also disabled while `liveValueReady` is false — see the planner row. |
| `PlanTrackingChart.tsx` | Registered lazily as `RetirementTrackingChart`. A `ComposedChart` on a **calendar** x axis (`type="number"` + `scale="time"`, epoch ms from `new Date(\`${day}T00:00:00Z\`)`, ticks "Sep '26" — the apostrophe is what stops a 2-digit year reading as a day of the month, and the window is too short for the hero's 4-digit form): the frozen plan's range `Area` + base `Line` (`var(--primary)`, the same fills as `PlanChart`) from `tracking.projections` sampled monthly over `planMonthDate(startedAt, t)` for `t = 0 … max(elapsed + 12, 24)`, and the actual `Line` from `tracking.actualSeries` in `TRACKING_ACTUAL_COLOR` (slot 1 of `OPTION_SERIES_COLORS`, named for the same reason `COAST_CURVE_COLOR` is — and deliberately **not** that hue, which means "Coast FIRE curve" on the other chart), ending in a `ReferenceDot` at today. The actual series is stride-sampled through the shared `sampleMonthsFromNow` / `CHART_MAX_POINTS` cap, by index rather than by month — daily snapshots would otherwise put ~730 points on a phone plot after two years, and today's point is the series' last, which the stride always keeps. A `Legend` names both lines (the `CoastChart` convention): this is the only retirement chart with two of them, which is also why it carries its own `TRACKING_CHART_CAPTION` instead of `BAND_CAPTION` — "Line = base case" would name the wrong line. Real terms deflate against **today**, so a plan month carries `t − elapsedMonths` and a snapshot carries `wholeMonthsBetween(today, its date)` — negative for the past, which `toReal` handles. Both series live in ONE data array: Recharts 3.x does let a series carry its own `data`, but the shared tooltip then resolves the hovered point by index into the *chart's* data and reads the wrong row off the other series. A snapshot between two plan months takes the band **linearly interpolated** between them — the exact point on the segment the chart already draws, so the `Area` stays dense (no nulls) and only `actual` is sparse (`connectNulls`). Values are floored through `chartSeries`' `floorForDisplay`. Custom tooltip (the `PlanChart` pattern): the date, then Actual / Base plan / pessimistic–optimistic, capped at 240px. |
| `ContributionSuggestions.tsx` | The round-number menu under "how much should I contribute?": `suggestedContributionsUsd` rounds `SUGGESTION_MULTIPLIERS` of the required figure to $250 (or $50 below $1,000), deduped and floored at one step; each row then runs `solveEarliestRetirementAge` + `computeCoastOutlook` + one `projectScenario`. Four rows is the cap on that work. When the requirement is null the table renders nothing (the headline already says not reachable); when it is zero the plan's own contribution anchors the menu. |
| `PlanMilestones.tsx` | The milestones table (desktop) / cards (mobile), same pattern as `CompareTab`: age, phase, and the pessimistic / **base** (headline weight) / optimistic value per row. A non-positive value renders `DEPLETED_AT_LABEL(age)` from `depletionAge` instead of a floored zero (hence the `currentAge` prop). Rows come from `planMilestones(inputs)`; values from `valueAtMonthsFromNow` over `PlanTab`'s projections — it never projects anything itself, and every figure goes through the `RetirementDisplay` edge. |
| `coastMarkers.tsx` | `coastMarkerLines({ plannedCoastAge, earliestCoastAge, earliestColor })` → the pair of coast `ReferenceLine`s ("Planned coast: 35" / "Could coast at: 32"), shared by both charts, with `showsEarliestCoast` dropping the second when the two land in the same month. A **function returning an array**, not a component: Recharts classifies a chart's own children, so a wrapper component would not register as reference lines at all. |
| `PlanChart.tsx` | `ComposedChart`: two `ReferenceArea` shades for the phases (coasting `--muted-foreground` at 8%, retirement at 14% — a step apart, or adjacent areas read as one phase with two names, and above the grid's own contrast, which 4%/8% was not; declared **before** the series so they stay behind the plot, and clamped to `currentAge` so a window already behind the user is not drawn), range `Area` (pessimistic–optimistic, `--primary` at 12%) + base `Line` (`var(--primary)`), then `ReferenceLine`s for the retirement age (`insideTopRight`), the retirement target — labelled with `display.compactMoneyFromChartValue`, `insideTopLeft`, which for a horizontal line means "beside the line", i.e. wherever the target value falls — the earliest retirement age when the "when can I retire?" answer is on screen (`insideTopLeft` **plus a `dy` offset row**), one marker per band that `depletionAge` reports (one row each from row 1, or row 2 when the earliest-retirement marker takes that row, all stroked `DEPLETION_MARKER_COLOR` (`--destructive`, one tone: the base case running out must not borrow the base line's own colour and read calmer than the pessimistic one), labelled `BAND_DEPLETED_LABEL(BAND_LABELS[band], formatAge(wholeAge(age)))` and side-flipped — `insideTopLeft` in the left half of the age span, `insideTopRight` in the right — because a right-anchored label grows leftward and would otherwise run off the plot into the axis gutter), the phase names as label-only `ReferenceArea`s repeated **after** the series (their shades are ground, their text is not: 11px muted read through the band's wash and crossed by the base line is the least legible thing on a phone), and — only under `WITHDRAWAL_STRATEGY.depletion`, from the optional `withdrawalStrategy` / `plannedDepletionAge` props — `PLANNED_HORIZON_LABEL` at the horizon (`insideBottomRight` lifted one row, `dy: -16`: the bottom row itself is the coast pair's, and `coastMarkers`' left-anchored "Could coast at" grows rightward into that same corner). Every vertical marker labels at the TOP so it can never land on the baseline where a low target line's label sits; markers that can be near each other get their own row, because two years of age is ~10px of chart on a phone. The rows, top down: retirement age, earliest retirement (its row is skipped in the questions that have no such answer), one per depleted band, then a row each for the phase names — the phases label at the top because the bottom belongs to the coast pair, which the coasting shade sits exactly on top of. The tooltip is a custom `content` (the DashboardHero pattern): the band is one series carrying a tuple, so the default one-row-per-series tooltip can only print it as "$a – $b" — this one reads the hovered `BandPoint` and renders `CHART_TOOLTIP_AGE_PHASE(formatAgeLabel(wholeAge(age)), PROJECTION_PHASE_LABELS[phase])` over pessimistic / **base** (headline weight) / optimistic rows, in `CHART_TOOLTIP_CONTENT_STYLE`, still capped at 240px and wrapping. The coast marker pair renders only when `contributionEndAge < retirementAge`. Points come from `buildBandPoints`, whose values are floored at 0, so the y-domain starts at zero. `PlanTab` asks `projectScenario` for `includeRetirementDrawdown` under **both** withdrawal strategies, so the line always carries on past retirement to `depletionAge` — down to zero when depleting, typically still rising under preservation. |
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
   (`SolvedMode`, plus the gated `projections`, `coastOutlook` and
   `usePlanTracking` memos): a question nobody asked is never solved.
3. **Chunked so React can interrupt** — React only yields between components, so
   a memo is all-or-nothing once entered. The three heavy passes therefore live
   in their own components rather than in `PlanTab`: `SensitivityInsights`
   (the largest), `PlanVerdict`'s escape routes, and
   `ContributionSuggestions`' four rows. The Plan tab's own render (the band
   projections + the answer headline) is the cheap half, and each of the others
   is a separate unit of work React can drop when another keystroke arrives.
   `PlanTrackingMode` and its chart are their own boundaries for the same
   reason, even though they do not read the draft: three more full projections
   should not land in the tab's own render.
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
- Custom comparison options (user-defined name + return triple + flat rate) are
  editable when present in a scenario but cannot yet be added from the UI.
- The projection recurrence is the one place in the app that rounds mid-
  calculation (`DECIMALS.projection`, see the recompute path above). It is a
  horizon-cost decision, not a display one: raise the scale and the quadratic
  precision growth comes back, lower it and the drift stops being invisible.
