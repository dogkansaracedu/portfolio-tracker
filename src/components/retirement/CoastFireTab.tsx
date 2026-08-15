import { Suspense, useMemo } from "react"
import type BigNumber from "bignumber.js"
import { PartyPopper } from "lucide-react"
import { bn } from "@/lib/config"
import { Card, CardContent } from "@/components/ui/card"
import { RetirementCoastFireChart } from "@/components/charts/LazyChart"
import RouteSkeleton from "@/components/layout/RouteSkeleton"
import { gainLossClass } from "@/lib/prices"
import {
  coastFireCurve,
  computeCoastFireGap,
  computeCoastFireNumber,
  computeRetirementTarget,
  findCoastDate,
  monthsToRetirement as monthsToRetirementOf,
  PROJECTION_BAND,
  projectScenario,
  solveMonthsToTarget,
  yearsToRetirement as yearsToRetirementOf,
  type Projection,
  type ProjectionBand,
  type RetirementScenarioInputs,
} from "@/lib/retirement"
import {
  BASE_CASE_CAPTION,
  GLOSSARY_HINTS,
  NOT_REACHABLE,
} from "./constants"
import { formatMonthsDuration, type RetirementDisplay } from "./display"
import { StatTile } from "./RetirementControls"

/**
 * Coast FIRE — the value that lets growth alone finish the job, how far the
 * portfolio is from it, and when the plan crosses it. Coasting (gap ≤ 0) is
 * celebrated rather than shown as a negative number to decode.
 */

interface Props {
  inputs: RetirementScenarioInputs
  startingAmountUsd: BigNumber
  display: RetirementDisplay
}

export function CoastFireTab({ inputs, startingAmountUsd, display }: Props) {
  const monthsToRetirement = monthsToRetirementOf(inputs)
  const baseRatePct = inputs.primaryExpectedReturn.base

  const targetUsd = useMemo(() => computeRetirementTarget(inputs), [inputs])

  const coastFireNumberUsd = useMemo(
    () =>
      computeCoastFireNumber(targetUsd, baseRatePct, yearsToRetirementOf(inputs)),
    [targetUsd, baseRatePct, inputs],
  )

  const gapUsd = computeCoastFireGap(coastFireNumberUsd, startingAmountUsd)
  const coasting = !gapUsd.isGreaterThan(0)

  const curve = useMemo(
    () => coastFireCurve(targetUsd, baseRatePct, monthsToRetirement),
    [targetUsd, baseRatePct, monthsToRetirement],
  )

  const projections = useMemo<Record<ProjectionBand, Projection>>(() => {
    const forBand = (band: ProjectionBand) =>
      projectScenario(inputs, { band, startingAmountUsd })
    return {
      pessimistic: forBand(PROJECTION_BAND.pessimistic),
      base: forBand(PROJECTION_BAND.base),
      optimistic: forBand(PROJECTION_BAND.optimistic),
    }
  }, [inputs, startingAmountUsd])

  const coastDate = useMemo(
    () => findCoastDate(projections[PROJECTION_BAND.base], curve),
    [projections, curve],
  )

  const monthsToTarget = useMemo(
    () =>
      solveMonthsToTarget(bn(inputs.monthlyContributionUsd), targetUsd, inputs, {
        startingAmountUsd,
      }),
    [inputs, targetUsd, startingAmountUsd],
  )

  const targetGapUsd = targetUsd.minus(startingAmountUsd)

  return (
    <div className="space-y-4">
      {coasting && (
        <Card>
          <CardContent className="flex items-start gap-3">
            <PartyPopper className="size-5 shrink-0 text-emerald-600" />
            <div className="space-y-0.5">
              <p className="font-medium text-emerald-600">You are coasting.</p>
              <p className="text-sm text-muted-foreground">
                Your portfolio is already past its Coast FIRE number by{" "}
                {display.money(gapUsd.abs())} — expected growth alone is
                projected to reach the retirement target by age{" "}
                {inputs.retirementAge}, with no further contributions.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card size="sm">
          <CardContent>
            <StatTile
              label="Coast FIRE number"
              hint={GLOSSARY_HINTS.coastFireNumber}
              value={display.money(coastFireNumberUsd)}
              caption={`Current value ${display.money(startingAmountUsd)}.`}
            />
          </CardContent>
        </Card>

        <Card size="sm">
          <CardContent>
            <StatTile
              label="Coast FIRE gap"
              hint={GLOSSARY_HINTS.coastFireGap}
              value={coasting ? "Coasting" : display.money(gapUsd)}
              valueClassName={gainLossClass(coasting)}
              caption={
                coasting
                  ? `${display.money(gapUsd.abs())} past the Coast FIRE number.`
                  : coastDate
                    ? `Coast date in ${formatMonthsDuration(coastDate.monthsFromNow)}.`
                    : `Coast date: ${NOT_REACHABLE.toLowerCase()}.`
              }
            />
          </CardContent>
        </Card>

        <Card size="sm">
          <CardContent>
            <StatTile
              label="Retirement target"
              hint={GLOSSARY_HINTS.retirementTarget}
              value={display.money(targetUsd, monthsToRetirement)}
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
        <RetirementCoastFireChart
          projections={projections}
          curve={curve}
          coastDate={coastDate}
          currentAge={inputs.currentAge}
          startingAmountUsd={startingAmountUsd}
          display={display}
        />
      </Suspense>

      <p className="text-xs text-muted-foreground">{BASE_CASE_CAPTION}</p>
    </div>
  )
}
