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
| `projectScenario(inputs, { band, startingAmountUsd, includeRetirementDrawdown })` | Plan chart bands, Coast FIRE chart bands, "final value" headline (accumulation-only). |
| `computeRetirementTarget(inputs)` | Plan headline/target reference line, Coast FIRE tiles. |
| `computeCoastFireNumber` / `coastFireCurve` / `computeCoastFireGap` / `findCoastDate` | Coast FIRE tab. |
| `solveRequiredContribution` / `solveMonthsToTarget` | Plan modes 2 and 3, Coast FIRE "years to target". |
| `computeSensitivityInsights` | Plan tab insights (structured effects → sentences in the UI). |
| `runComparison(inputs, { startingAmountUsd })` | Compare tab table + chart. |
| `toReal(nominalUsd, monthsFromNow, usdInflationPct)` | The global nominal/real toggle. |
| `monthsToRetirement` / `yearsToRetirement` / `PROJECTION_BAND` / `DEFAULT_RETIREMENT_SCENARIO_INPUTS` / `RETIREMENT_OPTION_PRESETS` | Horizons, band iteration, first-use defaults. |

`ProjectionMonth.valueUsd` is an **end-of-month** value: month index `t` is
`t + 1` months from now, and `monthsFromNow = 0` is the starting amount itself
(`valueAtMonthsFromNow` in `chartSeries.ts` encodes this once).

## File map

### Route + navigation

| File | Role |
| --- | --- |
| `src/App.tsx` | `<Route path="retirement">` (lazy, inside `AppLayout`). |
| `src/components/layout/Sidebar.tsx` | One `navItems` entry (`PiggyBank`); `MobileNav` reuses the same array. |
| `src/components/charts/LazyChart.tsx` | Registers `RetirementPlanChart`, `RetirementCompareChart`, `RetirementCoastFireChart` so Recharts stays code-split. |

### Page + state

| File | Role |
| --- | --- |
| `src/pages/RetirementPage.tsx` | Shell: header + the global Nominal/Real toggle, the shared `ScenarioPanel`, and the `Plan / Compare / Coast FIRE` tabs. Holds `tab` and `valueView`; builds the `RetirementDisplay` from the scenario's USD-inflation assumption. Renders `RetirementSkeleton` while scenarios load. |
| `src/hooks/useRetirementPlanner.ts` | The scenario state machine: shared scenarios (`useRetirementScenarios` → `RetirementScenarioContext`), the loaded default, the locally edited `inputs` draft, `dirty` (JSON compare against the saved row), and the persistence actions (`save`, `createScenario`, `renameActive`, `deleteActive`, `makeActiveDefault`, `discardEdits`). Resolves `startingAmountUsd`: the scenario's own value, or `usePnL(useHoldings().holdings, usePrices().prices).totalCurrentValueUsd` when it is `null`. A `pendingSelectionRef` holds the adoption effect back until a just-created row lands in the refreshed list, so a create can't drag the draft onto another scenario. |

### Components (`src/components/retirement/`)

| File | Role |
| --- | --- |
| `constants.ts` | Every label, tab/mode id, caption, glossary hint, chart palette and sampling cap. Labels are the GLOSSARY term verbatim. |
| `display.ts` | `useRetirementDisplay(usdInflationPct, valueView)` — the single display edge: `toViewUsd` (real = `toReal`), `chartValue` (→ display currency number), `money` / `signedMoney` (formatted + obfuscation-aware), `moneyFromChartValue` (tooltips), `axisTick` (compact `$1.2M`). Also `formatMonthsDuration`. |
| `chartSeries.ts` | Projection months → chart points: `sampleMonthsFromNow` (stride sampling with pinned months), `valueAtMonthsFromNow`, `ageAt`, `buildBandPoints` (base line + `[pessimistic, optimistic]` tuple for Recharts' range `Area`). |
| `ScenarioPanel.tsx` | Scenario picker (`Select`) + create / rename / set-default / delete / save / discard, the core inputs, and the collapsible **Assumptions** section (primary expected-return triple, USD/TRY inflation, TRY depreciation, per-option expected returns and any flat effective tax rate). Fields are keyed by scenario id so their typing buffers re-seed on switch. |
| `ScenarioNameDialog.tsx` | Name prompt for create / rename. |
| `RetirementControls.tsx` | `Hint` / `HintLabel` (the glossary explainer every advanced term carries), `NumberField` (string buffer so half-typed input survives), `SegmentedControl`, `StatTile`. |
| `PlanTab.tsx` | Mode switch (final value / required contribution / time to target), the solved headline with its "—"/not-reachable convention, the band chart, and `SensitivityInsights`. |
| `PlanChart.tsx` | `ComposedChart`: range `Area` (pessimistic–optimistic, `--primary` at 12%) + base `Line` (`var(--primary)`), `ReferenceLine`s for the retirement age and the retirement target. A capital-depletion plan projects past retirement, so the line carries on to zero at the depletion age. |
| `SensitivityInsights.tsx` | Phrases the engine's structured effects as full sentences (contribution steps → time saved; retirement-age shifts → required contribution), with the not-reachable wording for null solves. |
| `CompareTab.tsx` | `runComparison` → table (desktop) / cards (mobile): gross, retirement tax estimate (its `note` as a tooltip), **after-tax** (headline weight), after-tax in today's purchasing power. Caption: estimates under current law. |
| `CompareChart.tsx` | One `Line` per option, base case only — five shaded bands would not stay legible — with a legend, a colour swatch shared with the table rows, and a fixed categorical palette (never cycled). |
| `CoastFireTab.tsx` | Tiles: Coast FIRE number vs. current value; Coast FIRE gap + coast date; retirement target + its gap and years-to-target. Gap ≤ 0 renders the explicit already-coasting state instead of a negative number. |
| `CoastFireChart.tsx` | The rising Coast FIRE curve (dashed, slot-2 hue) over the projected portfolio band, with the coast date as a `ReferenceDot`. |
| `RetirementSkeleton.tsx` | Loading placeholder for the panel + first chart. |

## Tax layer (`src/lib/retirement/tax/`)

Every rate/threshold/bracket lives in `tax/constants.ts` as data, each constant
annotated with its legal basis + source URL, all traceable to
[docs/retirement-tax-rules.md](../../retirement-tax-rules.md) (verified
2026-08-15). Never edit a constant without re-verifying that document first.

| File | Role |
| --- | --- |
| `tax/constants.ts` | The sourced rate tables: 2026 brackets (`TRY_INCOME_TAX_BRACKETS` + base year), Yİ-ÜFE ≥10% gate, BES (20% state contribution CBK 10811, cap basis 396,360 TL, vesting schedule, 15/10/5 exit withholding), deposit tiers 17.5/15/10, plus `ASSUMED_USD_TRY_SPOT_RATE` — the **one number with no legal source** (needed to scale TRY gains onto the bracket table; labeled editable assumption; seeding it from the live FX rate is a known follow-up requiring a `types.ts` contract change). |
| `tax/lots.ts` | The lot proxy: each month's contribution is one lot at that month's implied USD/TRY rate; exit value splits across lots by compounded weight. The growth factor is read back out of the projection recurrence itself, so a rule can never disagree with the projection. |
| `tax/brackets.ts` | `progressiveTaxTry` + bracket-threshold indexation by the TRY-inflation assumption (nominal-TL thresholds must grow or multi-decade projections overstate tax). |
| `tax/bes.ts` | `besContributionEnhancer` (20% match, TRY cap grown by TRY inflation, converted along the depreciation path), vesting/retirement-right helpers, principal split. |
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
