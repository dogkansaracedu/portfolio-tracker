import { Suspense, useMemo, useState } from "react"
import type BigNumber from "bignumber.js"
import { bn } from "@/lib/config"
import { Card, CardContent } from "@/components/ui/card"
import { RetirementPlanChart } from "@/components/charts/LazyChart"
import RouteSkeleton from "@/components/layout/RouteSkeleton"
import {
  computeRetirementTarget,
  monthsToRetirement as monthsToRetirementOf,
  planMilestones,
  PROJECTION_BAND,
  projectScenario,
  solveMonthsToTarget,
  solveRequiredContribution,
  type Projection,
  type ProjectionBand,
  type RetirementScenarioInputs,
} from "@/lib/retirement"
import { gainLossClass } from "@/lib/prices"
import {
  BASE_CASE_CAPTION,
  GLOSSARY_HINTS,
  NOT_REACHABLE,
  PLAN_MODE,
  PLAN_MODE_LABELS,
  type PlanMode,
} from "./constants"
import { formatMonthsDuration, type RetirementDisplay } from "./display"
import { PlanMilestones } from "./PlanMilestones"
import { SegmentedControl, StatTile } from "./RetirementControls"
import { SensitivityInsights } from "./SensitivityInsights"

/**
 * Plan — the three directions of the same problem (final value, required
 * contribution, time to target), all solved against the one projection core,
 * plus the band chart, the milestones table that reads it age by age, and the
 * sensitivity insights that quantify the knobs.
 *
 * `inputs` here is the planner's DEFERRED draft (see `useRetirementPlanner`):
 * every derivation below re-runs whenever it changes, so only the mode actually
 * on screen is solved — a required contribution is a bisection over dozens of
 * full projections, and time-to-target projects a century of months. The
 * insights carry the same cost again and are computed inside
 * `SensitivityInsights`, behind its own component boundary, so React can leave
 * them for after the headline and the chart have painted.
 */

const MODE_OPTIONS: { id: PlanMode; label: string }[] = [
  { id: PLAN_MODE.finalValue, label: PLAN_MODE_LABELS[PLAN_MODE.finalValue] },
  {
    id: PLAN_MODE.requiredContribution,
    label: PLAN_MODE_LABELS[PLAN_MODE.requiredContribution],
  },
  { id: PLAN_MODE.timeToTarget, label: PLAN_MODE_LABELS[PLAN_MODE.timeToTarget] },
]

interface Props {
  inputs: RetirementScenarioInputs
  startingAmountUsd: BigNumber
  display: RetirementDisplay
}

/** The active mode's solved figure — the other two modes are never solved. */
type SolvedMode =
  | {
      mode: typeof PLAN_MODE.finalValue
      valueAtRetirementUsd: BigNumber
    }
  | {
      mode: typeof PLAN_MODE.requiredContribution
      /** null = not reachable under these assumptions. */
      requiredContributionUsd: BigNumber | null
    }
  | {
      mode: typeof PLAN_MODE.timeToTarget
      /** null = not reachable under these assumptions. */
      monthsToTarget: number | null
    }

export function PlanTab({ inputs, startingAmountUsd, display }: Props) {
  const [mode, setMode] = useState<PlanMode>(PLAN_MODE.finalValue)

  const monthsToRetirement = monthsToRetirementOf(inputs)

  const projections = useMemo<Record<ProjectionBand, Projection>>(() => {
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
  }, [inputs, startingAmountUsd])

  const targetUsd = useMemo(() => computeRetirementTarget(inputs), [inputs])

  // Solved for the mode on screen only: switching mode is a deliberate click,
  // while every keystroke re-runs whichever solve is mounted.
  const solved = useMemo<SolvedMode>(() => {
    switch (mode) {
      case PLAN_MODE.requiredContribution:
        return {
          mode,
          requiredContributionUsd: solveRequiredContribution(targetUsd, inputs, {
            startingAmountUsd,
          }),
        }
      case PLAN_MODE.timeToTarget:
        return {
          mode,
          monthsToTarget: solveMonthsToTarget(
            bn(inputs.monthlyContributionUsd),
            targetUsd,
            inputs,
            { startingAmountUsd },
          ),
        }
      default:
        // Accumulation only: the headline "final value" is the value AT
        // retirement, before any drawdown, so it is comparable with the target.
        return {
          mode: PLAN_MODE.finalValue,
          valueAtRetirementUsd: projectScenario(inputs, { startingAmountUsd })
            .finalValueUsd,
        }
    }
  }, [mode, targetUsd, inputs, startingAmountUsd])

  const milestones = useMemo(() => planMilestones(inputs), [inputs])

  const headline = (() => {
    switch (solved.mode) {
      case PLAN_MODE.requiredContribution:
        return {
          label: "Required monthly contribution",
          hint: GLOSSARY_HINTS.retirementTarget,
          value:
            solved.requiredContributionUsd === null
              ? NOT_REACHABLE
              : `${display.money(solved.requiredContributionUsd)} / month`,
          caption: `to reach the retirement target of ${display.money(
            targetUsd,
            monthsToRetirement,
          )} by age ${inputs.retirementAge}.`,
        }
      case PLAN_MODE.timeToTarget:
        return {
          label: "Time to the retirement target",
          hint: GLOSSARY_HINTS.retirementTarget,
          value:
            solved.monthsToTarget === null
              ? NOT_REACHABLE
              : formatMonthsDuration(solved.monthsToTarget),
          caption: `at ${display.money(
            bn(inputs.monthlyContributionUsd),
          )} / month, against a retirement target of ${display.money(
            targetUsd,
            monthsToRetirement,
          )}.`,
        }
      default: {
        const surplusUsd = solved.valueAtRetirementUsd.minus(targetUsd)
        return {
          label: `Projected value at age ${inputs.retirementAge}`,
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

      <Suspense fallback={<RouteSkeleton />}>
        <RetirementPlanChart
          projections={projections}
          currentAge={inputs.currentAge}
          retirementAge={inputs.retirementAge}
          contributionEndAge={inputs.contributionEndAge}
          startingAmountUsd={startingAmountUsd}
          targetUsd={targetUsd}
          monthsToRetirement={monthsToRetirement}
          display={display}
        />
      </Suspense>

      <PlanMilestones
        milestones={milestones}
        projections={projections}
        startingAmountUsd={startingAmountUsd}
        display={display}
      />

      <SensitivityInsights
        inputs={inputs}
        startingAmountUsd={startingAmountUsd}
        display={display}
      />
    </div>
  )
}
