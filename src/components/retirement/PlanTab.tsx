import { Suspense, useMemo, useState, type ReactNode } from "react"
import type BigNumber from "bignumber.js"
import { bn } from "@/lib/config"
import { Card, CardContent } from "@/components/ui/card"
import { RetirementPlanChart } from "@/components/charts/LazyChart"
import RouteSkeleton from "@/components/layout/RouteSkeleton"
import {
  computeCoastOutlook,
  computeRetirementTarget,
  monthsToRetirement as monthsToRetirementOf,
  planMilestones,
  PROJECTION_BAND,
  projectScenario,
  solveEarliestRetirementAge,
  solveRequiredContribution,
  type CoastOutlook,
  type Projection,
  type ProjectionBand,
  type RetirementScenarioInputs,
} from "@/lib/retirement"
import { gainLossClass } from "@/lib/prices"
import { ContributionSuggestions } from "./ContributionSuggestions"
import {
  BASE_CASE_CAPTION,
  GLOSSARY_HINTS,
  NOT_REACHABLE,
  NOW_LABEL,
  PLAN_HEADLINE_LABELS,
  PLAN_MODE,
  PLAN_MODE_LABELS,
  type PlanMode,
} from "./constants"
import { formatAge, formatAgeLabel, type RetirementDisplay } from "./display"
import { PlanCoastMode } from "./PlanCoastMode"
import { PlanMilestones } from "./PlanMilestones"
import { PlanVerdict } from "./PlanVerdict"
import { SegmentedControl, StatTile } from "./RetirementControls"
import { SensitivityInsights } from "./SensitivityInsights"

/**
 * Plan — four questions about the same projection, each a first-class mode. The
 * mode label IS the question, the headline under it is the answer, and where
 * the retirement age is an input rather than the answer a `PlanVerdict` says
 * yes or no in words.
 *
 * `inputs` here is the planner's DEFERRED draft (see `useRetirementPlanner`):
 * every derivation below re-runs whenever it changes, so only the question
 * actually on screen is solved — an earliest retirement age scans a candidate
 * age per year of a lifetime, a required contribution is a bisection over
 * dozens of full projections. The heaviest passes (the verdict's escape routes,
 * the suggestion table, the sensitivity insights) sit behind their own
 * component boundaries so React can paint the headline and the chart first and
 * abandon them when the next keystroke arrives.
 */

const MODE_OPTIONS: { id: PlanMode; label: string }[] = [
  {
    id: PLAN_MODE.earliestRetirement,
    label: PLAN_MODE_LABELS[PLAN_MODE.earliestRetirement],
  },
  { id: PLAN_MODE.coast, label: PLAN_MODE_LABELS[PLAN_MODE.coast] },
  {
    id: PLAN_MODE.requiredContribution,
    label: PLAN_MODE_LABELS[PLAN_MODE.requiredContribution],
  },
  { id: PLAN_MODE.finalValue, label: PLAN_MODE_LABELS[PLAN_MODE.finalValue] },
]

interface Props {
  inputs: RetirementScenarioInputs
  startingAmountUsd: BigNumber
  display: RetirementDisplay
}

/** The active mode's solved figure — the other three modes are never solved. */
type SolvedMode =
  | {
      mode: typeof PLAN_MODE.earliestRetirement
      /** null = not reachable at any age under these assumptions. */
      earliestRetirementAge: number | null
    }
  | {
      mode: typeof PLAN_MODE.requiredContribution
      /** null = not reachable under these assumptions. */
      requiredContributionUsd: BigNumber | null
    }
  | {
      mode: typeof PLAN_MODE.finalValue
      valueAtRetirementUsd: BigNumber
    }
  | { mode: typeof PLAN_MODE.coast }

export function PlanTab({ inputs, startingAmountUsd, display }: Props) {
  const [mode, setMode] = useState<PlanMode>(PLAN_MODE.earliestRetirement)

  const monthsToRetirement = monthsToRetirementOf(inputs)
  /** A plan that stops contributing before retirement coasts to it. */
  const plansToCoast = inputs.contributionEndAge < inputs.retirementAge

  /**
   * The band the plan chart and the milestones read. Null in the coast
   * question, which draws its own accumulation-only bands against the curve —
   * a projection nobody is looking at is not worth running.
   */
  const projections = useMemo<Record<ProjectionBand, Projection> | null>(() => {
    if (mode === PLAN_MODE.coast) return null
    const forBand = (band: ProjectionBand) =>
      projectScenario(inputs, {
        band,
        startingAmountUsd,
        includeRetirementDrawdown: true,
      })
    return {
      pessimistic: forBand(PROJECTION_BAND.pessimistic),
      base: forBand(PROJECTION_BAND.base),
      optimistic: forBand(PROJECTION_BAND.optimistic),
    }
  }, [mode, inputs, startingAmountUsd])

  const targetUsd = useMemo(() => computeRetirementTarget(inputs), [inputs])

  /**
   * The coast machinery: the whole answer in "when can I stop contributing?",
   * and elsewhere only the earliest-coast marker that pairs with the planned
   * one — so a plan that contributes right up to retirement never runs it.
   */
  const coastOutlook = useMemo<CoastOutlook | null>(() => {
    if (mode !== PLAN_MODE.coast && !plansToCoast) return null
    return computeCoastOutlook(inputs, { startingAmountUsd })
  }, [mode, plansToCoast, inputs, startingAmountUsd])

  // Solved for the mode on screen only: switching mode is a deliberate click,
  // while every keystroke re-runs whichever solve is mounted.
  const solved = useMemo<SolvedMode>(() => {
    switch (mode) {
      case PLAN_MODE.earliestRetirement:
        return {
          mode,
          earliestRetirementAge: solveEarliestRetirementAge(inputs, {
            startingAmountUsd,
          }),
        }
      case PLAN_MODE.requiredContribution:
        return {
          mode,
          requiredContributionUsd: solveRequiredContribution(targetUsd, inputs, {
            startingAmountUsd,
          }),
        }
      case PLAN_MODE.finalValue:
        // Accumulation only: the headline value is the one AT retirement,
        // before any drawdown, so it is comparable with the target.
        return {
          mode,
          valueAtRetirementUsd: projectScenario(inputs, { startingAmountUsd })
            .finalValueUsd,
        }
      default:
        // The coast answer is read off `coastOutlook` — no second solve.
        return { mode: PLAN_MODE.coast }
    }
  }, [mode, targetUsd, inputs, startingAmountUsd])

  const milestones = useMemo(() => planMilestones(inputs), [inputs])

  const headline: {
    label: string
    hint: string
    value: string
    caption: ReactNode
  } = (() => {
    switch (solved.mode) {
      case PLAN_MODE.earliestRetirement: {
        const age = solved.earliestRetirementAge
        const yearsEarlier = age === null ? 0 : inputs.retirementAge - age
        return {
          label: PLAN_HEADLINE_LABELS[PLAN_MODE.earliestRetirement],
          hint: GLOSSARY_HINTS.retirementTarget,
          value: age === null ? NOT_REACHABLE : formatAgeLabel(age),
          caption:
            age === null ? (
              <>
                No retirement age reaches the retirement target at{" "}
                {display.money(bn(inputs.monthlyContributionUsd))} / month.
              </>
            ) : (
              <>
                Contributing {display.money(bn(inputs.monthlyContributionUsd))} /
                month and spending{" "}
                {display.money(bn(inputs.monthlySpendingUsd))} / month in today's
                USD — {describeAgeShift(yearsEarlier, inputs.retirementAge)}
              </>
            ),
        }
      }
      case PLAN_MODE.coast: {
        const coasting = coastOutlook?.coasting === true
        const coastAge = coastOutlook?.coastAge ?? null
        return {
          label: PLAN_HEADLINE_LABELS[PLAN_MODE.coast],
          hint: GLOSSARY_HINTS.coastDate,
          value: coasting
            ? NOW_LABEL
            : coastAge === null
              ? NOT_REACHABLE
              : formatAgeLabel(coastAge),
          caption:
            coastAge === null && !coasting ? (
              <>
                The plan never reaches its Coast FIRE number before age{" "}
                {formatAge(inputs.retirementAge)}.
              </>
            ) : (
              <>
                After that, growth alone reaches your retirement target of{" "}
                {display.money(targetUsd, monthsToRetirement)} by age{" "}
                {formatAge(inputs.retirementAge)}. Your plan stops contributing
                at {formatAge(inputs.contributionEndAge)}.
              </>
            ),
        }
      }
      case PLAN_MODE.requiredContribution:
        return {
          label: PLAN_HEADLINE_LABELS[PLAN_MODE.requiredContribution],
          hint: GLOSSARY_HINTS.retirementTarget,
          value:
            solved.requiredContributionUsd === null
              ? NOT_REACHABLE
              : `${display.money(solved.requiredContributionUsd)} / month`,
          caption: `to reach the retirement target of ${display.money(
            targetUsd,
            monthsToRetirement,
          )} by age ${formatAge(inputs.retirementAge)}.`,
        }
      default: {
        const surplusUsd = solved.valueAtRetirementUsd.minus(targetUsd)
        return {
          label: PLAN_HEADLINE_LABELS[PLAN_MODE.finalValue](
            formatAge(inputs.retirementAge),
          ),
          hint: GLOSSARY_HINTS.projection,
          value: display.money(solved.valueAtRetirementUsd, monthsToRetirement),
          caption: (
            <>
              {surplusUsd.isNegative() ? "Short of" : "Above"} the retirement
              target of {display.money(targetUsd, monthsToRetirement)} by{" "}
              <span className={gainLossClass(!surplusUsd.isNegative())}>
                {display.money(surplusUsd.abs(), monthsToRetirement)}
              </span>
              .
            </>
          ),
        }
      }
    }
  })()

  const headlineIsFigure = headline.value !== NOT_REACHABLE

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-3">
          <SegmentedControl
            size="sm"
            value={mode}
            options={MODE_OPTIONS}
            onChange={setMode}
          />
          <StatTile
            label={headline.label}
            hint={headline.hint}
            value={headline.value}
            valueClassName={
              headlineIsFigure
                ? undefined
                : "text-base font-medium text-muted-foreground"
            }
            caption={
              <>
                {headline.caption} {BASE_CASE_CAPTION}
              </>
            }
          />
        </CardContent>
      </Card>

      {/* Every question but "when can I retire?" fixes the retirement age, so
          every one of them can be answered yes or no. */}
      {mode !== PLAN_MODE.earliestRetirement && (
        <PlanVerdict
          inputs={inputs}
          startingAmountUsd={startingAmountUsd}
          display={display}
          coastingByUsd={
            mode === PLAN_MODE.coast && coastOutlook?.coasting === true
              ? coastOutlook.coastFireGapUsd
              : null
          }
        />
      )}

      {mode === PLAN_MODE.coast && coastOutlook ? (
        <PlanCoastMode
          inputs={inputs}
          startingAmountUsd={startingAmountUsd}
          display={display}
          outlook={coastOutlook}
        />
      ) : (
        projections && (
          <Suspense fallback={<RouteSkeleton />}>
            <RetirementPlanChart
              projections={projections}
              currentAge={inputs.currentAge}
              retirementAge={inputs.retirementAge}
              contributionEndAge={inputs.contributionEndAge}
              earliestCoastAge={coastOutlook?.coastAge ?? null}
              earliestRetirementAge={
                solved.mode === PLAN_MODE.earliestRetirement
                  ? solved.earliestRetirementAge
                  : null
              }
              startingAmountUsd={startingAmountUsd}
              targetUsd={targetUsd}
              monthsToRetirement={monthsToRetirement}
              display={display}
            />
          </Suspense>
        )
      )}

      {solved.mode === PLAN_MODE.requiredContribution && (
        <ContributionSuggestions
          inputs={inputs}
          startingAmountUsd={startingAmountUsd}
          targetUsd={targetUsd}
          requiredContributionUsd={solved.requiredContributionUsd}
          display={display}
        />
      )}

      {mode === PLAN_MODE.finalValue && projections && (
        <PlanMilestones
          milestones={milestones}
          projections={projections}
          startingAmountUsd={startingAmountUsd}
          currentAge={inputs.currentAge}
          display={display}
        />
      )}

      <SensitivityInsights
        inputs={inputs}
        startingAmountUsd={startingAmountUsd}
        display={display}
      />
    </div>
  )
}

/** "that is 3 years earlier than the age 55 in your plan." */
function describeAgeShift(yearsEarlier: number, retirementAge: number): string {
  const plan = `the age ${formatAge(retirementAge)} in your plan.`
  if (yearsEarlier === 0) return `the same as ${plan}`
  const years = Math.abs(yearsEarlier)
  const direction = yearsEarlier > 0 ? "earlier" : "later"
  return `that is ${years} year${years === 1 ? "" : "s"} ${direction} than ${plan}`
}
