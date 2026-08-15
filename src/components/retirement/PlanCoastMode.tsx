import { Suspense, useMemo } from "react"
import type BigNumber from "bignumber.js"
import { bn } from "@/lib/config"
import { Card, CardContent } from "@/components/ui/card"
import { RetirementCoastChart } from "@/components/charts/LazyChart"
import RouteSkeleton from "@/components/layout/RouteSkeleton"
import { gainLossClass } from "@/lib/prices"
import {
  monthsToRetirement as monthsToRetirementOf,
  PROJECTION_BAND,
  projectScenario,
  solveMonthsToTarget,
  type CoastOutlook,
  type Projection,
  type ProjectionBand,
  type RetirementScenarioInputs,
} from "@/lib/retirement"
import {
  BASE_CASE_CAPTION,
  COAST_STRIP_LABELS,
  GLOSSARY_HINTS,
  NOT_REACHABLE,
} from "./constants"
import { formatMonthsDuration, type RetirementDisplay } from "./display"
import { StatTile } from "./RetirementControls"

/**
 * The body of "when can I stop contributing?": the Coast FIRE figures the
 * headline answer rests on — the number itself against today's value, the gap
 * to it, and the retirement target the whole thing is aimed at — over the curve
 * the plan crosses at its coast date.
 *
 * Every figure comes from the `CoastOutlook` the tab already solved, so the
 * strip, the headline and the chart marker can never name different dates.
 */

interface Props {
  /** The planner's deferred draft — same object every other Plan figure runs on. */
  inputs: RetirementScenarioInputs
  startingAmountUsd: BigNumber
  display: RetirementDisplay
  outlook: CoastOutlook
}

export function PlanCoastMode({
  inputs,
  startingAmountUsd,
  display,
  outlook,
}: Props) {
  const monthsToRetirement = monthsToRetirementOf(inputs)

  // Accumulation only, like the curve it is drawn against: crossing the Coast
  // FIRE number is a pre-retirement event, so the drawdown is not part of it.
  const projections = useMemo<Record<ProjectionBand, Projection>>(() => {
    const forBand = (band: ProjectionBand) =>
      projectScenario(inputs, { band, startingAmountUsd })
    return {
      pessimistic: forBand(PROJECTION_BAND.pessimistic),
      base: forBand(PROJECTION_BAND.base),
      optimistic: forBand(PROJECTION_BAND.optimistic),
    }
  }, [inputs, startingAmountUsd])

  const monthsToTarget = useMemo(
    () =>
      solveMonthsToTarget(
        bn(inputs.monthlyContributionUsd),
        outlook.targetUsd,
        inputs,
        { startingAmountUsd },
      ),
    [inputs, outlook.targetUsd, startingAmountUsd],
  )

  const targetGapUsd = outlook.targetUsd.minus(startingAmountUsd)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card size="sm">
          <CardContent>
            <StatTile
              label={COAST_STRIP_LABELS.coastFireNumber}
              hint={GLOSSARY_HINTS.coastFireNumber}
              value={display.money(outlook.coastFireNumberUsd)}
              caption={`Current value ${display.money(startingAmountUsd)}.`}
            />
          </CardContent>
        </Card>

        <Card size="sm">
          <CardContent>
            <StatTile
              label={COAST_STRIP_LABELS.coastFireGap}
              hint={GLOSSARY_HINTS.coastFireGap}
              value={
                outlook.coasting
                  ? COAST_STRIP_LABELS.coasting
                  : display.money(outlook.coastFireGapUsd)
              }
              valueClassName={gainLossClass(outlook.coasting)}
              caption={
                outlook.coasting
                  ? `${display.money(outlook.coastFireGapUsd.abs())} past the Coast FIRE number.`
                  : outlook.coastDate
                    ? `Coast date in ${formatMonthsDuration(outlook.coastDate.monthsFromNow)}.`
                    : `Coast date: ${NOT_REACHABLE.toLowerCase()}.`
              }
            />
          </CardContent>
        </Card>

        <Card size="sm">
          <CardContent>
            <StatTile
              label={COAST_STRIP_LABELS.retirementTarget}
              hint={GLOSSARY_HINTS.retirementTarget}
              value={display.money(outlook.targetUsd, monthsToRetirement)}
              caption={
                targetGapUsd.isGreaterThan(0)
                  ? `${display.money(targetGapUsd, monthsToRetirement)} to go — ${
                      monthsToTarget === null
                        ? NOT_REACHABLE.toLowerCase()
                        : `reached in ${formatMonthsDuration(monthsToTarget)}`
                    }.`
                  : "Already reached."
              }
            />
          </CardContent>
        </Card>
      </div>

      <Suspense fallback={<RouteSkeleton />}>
        <RetirementCoastChart
          projections={projections}
          curve={outlook.curve}
          coastDate={outlook.coastDate}
          currentAge={inputs.currentAge}
          plannedCoastAge={inputs.contributionEndAge}
          startingAmountUsd={startingAmountUsd}
          display={display}
        />
      </Suspense>

      <p className="text-xs text-muted-foreground">{BASE_CASE_CAPTION}</p>
    </div>
  )
}
