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
import { usePlanTracking } from "@/hooks/usePlanTracking"
import type { RetirementPlanner } from "@/hooks/useRetirementPlanner"
import { ContributionSuggestions } from "./ContributionSuggestions"
import {
  BAND_POSITION_LABELS,
  BASE_CASE_CAPTION,
  GLOSSARY_HINTS,
  NOT_REACHABLE,
  PLAN_HEADLINE_LABELS,
  PLAN_MODE,
  PLAN_MODE_LABELS,
  PLAN_STARTED_CAPTION,
  TRACKING_HEADLINE_CAPTION,
  TRACKING_LABELS,
  TRACKING_NOT_STARTED_CAPTION,
  type PlanMode,
} from "./constants"
import {
  describeGap,
  formatAge,
  formatAgeLabel,
  formatPlanDay,
  type RetirementDisplay,
} from "./display"
import { PlanCoastMode } from "./PlanCoastMode"
import { PlanMilestones } from "./PlanMilestones"
import { PlanTrackingMode } from "./PlanTrackingMode"
import { PlanVerdict } from "./PlanVerdict"
import { SegmentedControl, StatTile } from "./RetirementControls"
import { SensitivityInsights } from "./SensitivityInsights"
import { NOW_LABEL } from "@/lib/constants/app"

/**
 * Plan — five questions about the same projection, each a first-class mode. The
 * mode label IS the question, the headline under it is the answer, and where
 * the retirement age is an input rather than the answer a `PlanVerdict` says
 * yes or no in words. "Am I on track?" is the odd one out: it looks backwards
 * at the frozen plan start rather than forward from the draft, so it solves
 * nothing and carries no verdict.
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
  { id: PLAN_MODE.onTrack, label: PLAN_MODE_LABELS[PLAN_MODE.onTrack] },
]

/** An answer that is a phrase, not a figure — sized down to read as one. */
const MUTED_ANSWER_CLASS = "text-base font-medium text-muted-foreground"

interface Props {
  inputs: RetirementScenarioInputs
  startingAmountUsd: BigNumber
  display: RetirementDisplay
  /** "Am I on track?" measures against the FROZEN plan, not the draft above —
   *  the only part of the Plan tab that reads the planner rather than inputs. */
  planner: Pick<
    RetirementPlanner,
    | "planStart"
    | "startPlan"
    | "clearPlanStart"
    | "saving"
    | "error"
    | "liveValueUsd"
    | "liveValueReady"
  >
}

/** The active mode's solved figure — the other four modes are never solved. */
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
  | { mode: typeof PLAN_MODE.onTrack }

export function PlanTab({
  inputs,
  startingAmountUsd,
  display,
  planner,
}: Props) {
  const [mode, setMode] = useState<PlanMode>(PLAN_MODE.earliestRetirement)

  const monthsToRetirement = monthsToRetirementOf(inputs)
  /** A plan that stops contributing before retirement coasts to it. */
  const plansToCoast = inputs.contributionEndAge < inputs.retirementAge

  /**
   * The frozen plan re-projected against what actually happened. Null unless
   * "am I on track?" is open (and the scenario has been started) — it is three
   * more full projections, and it is the only figure here that ignores the
   * draft inputs entirely. Computed once, at the tab, so the headline answer
   * and the question's own body read the same object.
   */
  const tracking = usePlanTracking(
    planner.planStart,
    planner.liveValueUsd,
    mode === PLAN_MODE.onTrack,
  )

  /**
   * The band the plan chart and the milestones read. Null in the coast
   * question, which draws its own accumulation-only bands against the curve,
   * and in the tracking question, which draws the FROZEN plan's bands instead —
   * a projection nobody is looking at is not worth running.
   */
  const projections = useMemo<Record<ProjectionBand, Projection> | null>(() => {
    if (mode === PLAN_MODE.coast || mode === PLAN_MODE.onTrack) return null
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
    if (mode === PLAN_MODE.onTrack) return null
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
      case PLAN_MODE.onTrack:
        // Nothing to solve: the answer is read off `tracking`, which is not
        // derived from the draft inputs this memo watches.
        return { mode }
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
    /** Set only where the answer carries its own tone (the tracking gap). */
    valueClassName?: string
    caption: ReactNode
    /** False where the answer is not a base-case figure at all, so the
     *  which-case footnote below it would be describing nothing. */
    showsBaseCaseFigure?: boolean
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
      case PLAN_MODE.onTrack: {
        const label = PLAN_HEADLINE_LABELS[PLAN_MODE.onTrack]
        if (!tracking) {
          return {
            label,
            hint: GLOSSARY_HINTS.valueGap,
            value: TRACKING_LABELS.notStarted,
            valueClassName: MUTED_ANSWER_CLASS,
            caption: TRACKING_NOT_STARTED_CAPTION,
            showsBaseCaseFigure: false,
          }
        }
        const gap = describeGap(tracking.valueGapUsd, display)
        return {
          label,
          hint: GLOSSARY_HINTS.valueGap,
          value: gap.value,
          valueClassName: gap.className,
          caption: `${TRACKING_HEADLINE_CAPTION(
            display.money(tracking.actualValueUsd),
            display.money(tracking.plannedValueUsd[PROJECTION_BAND.base]),
            BAND_POSITION_LABELS[tracking.bandPosition],
          )} ${PLAN_STARTED_CAPTION(formatPlanDay(tracking.startedAt))}`,
        }
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
              headline.valueClassName ??
              (headlineIsFigure ? undefined : MUTED_ANSWER_CLASS)
            }
            caption={
              <>
                {headline.caption}
                {headline.showsBaseCaseFigure !== false && (
                  <> {BASE_CASE_CAPTION}</>
                )}
              </>
            }
          />
        </CardContent>
      </Card>

      {/* Every forward-looking question but "when can I retire?" fixes the
          retirement age, so every one of them can be answered yes or no.
          "Am I on track?" is backward-looking — its answer IS the verdict. */}
      {mode !== PLAN_MODE.earliestRetirement && mode !== PLAN_MODE.onTrack && (
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

      {mode === PLAN_MODE.onTrack ? (
        <PlanTrackingMode
          tracking={tracking}
          display={display}
          saving={planner.saving}
          liveValueReady={planner.liveValueReady}
          error={planner.error}
          onStartPlan={planner.startPlan}
          onClearPlanStart={planner.clearPlanStart}
        />
      ) : mode === PLAN_MODE.coast && coastOutlook ? (
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
              withdrawalStrategy={inputs.withdrawalStrategy}
              plannedDepletionAge={inputs.depletionAge}
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
