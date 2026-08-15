import { useMemo } from "react"
import type BigNumber from "bignumber.js"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  computeSensitivityInsights,
  SENSITIVITY_METRIC,
  type RetirementScenarioInputs,
  type SensitivityInsight,
} from "@/lib/retirement"
import { GLOSSARY_HINTS, NOT_REACHABLE } from "./constants"
import { formatMonthsDuration, type RetirementDisplay } from "./display"
import { Hint } from "./RetirementControls"

/**
 * Sensitivity insights, phrased. The engine hands over structured effects only
 * (changed input, moved output); the sentence — and the "—"/not-reachable
 * convention for a solve with no answer — is written here.
 *
 * The solves run in THIS component rather than in `PlanTab`, because they are
 * the page's heaviest work by a wide margin (each insight is a solver run over
 * the projection core). Behind their own component boundary React can render
 * and commit the headline, chart and milestones first, and abandon the insight
 * pass entirely when the next keystroke arrives mid-flight.
 */

function phrase(insight: SensitivityInsight, display: RetirementDisplay): string {
  const { effect } = insight

  if (effect.metric === SENSITIVITY_METRIC.monthsToTarget) {
    const from = display.money(insight.baseValue)
    const to = display.money(insight.changedValue)
    if (effect.changedMonths === null) {
      return `Contributing ${to}/month instead of ${from} still does not reach the retirement target — ${NOT_REACHABLE.toLowerCase()}.`
    }
    const changedDuration = formatMonthsDuration(effect.changedMonths)
    if (effect.baseMonths === null) {
      return `Contributing ${to}/month instead of ${from} reaches the retirement target in ${changedDuration}; at ${from}/month it is ${NOT_REACHABLE.toLowerCase()}.`
    }
    const baseDuration = formatMonthsDuration(effect.baseMonths)
    const saved = effect.monthsSaved ?? 0
    if (saved === 0) {
      return `Contributing ${to}/month instead of ${from} reaches the retirement target at the same time — ${baseDuration} from now.`
    }
    const direction = saved > 0 ? "sooner" : "later"
    return `Contributing ${to}/month instead of ${from} reaches the retirement target ${formatMonthsDuration(Math.abs(saved))} ${direction} — ${changedDuration} from now instead of ${baseDuration}.`
  }

  const fromAge = insight.baseValue.toNumber()
  const toAge = insight.changedValue.toNumber()
  if (effect.changedUsd === null) {
    return `Retiring at ${toAge} instead of ${fromAge} puts the retirement target out of reach — ${NOT_REACHABLE.toLowerCase()}.`
  }
  const changedContribution = display.money(effect.changedUsd)
  if (effect.baseUsd === null) {
    return `Retiring at ${toAge} instead of ${fromAge} needs ${changedContribution}/month; at ${fromAge} the retirement target is ${NOT_REACHABLE.toLowerCase()}.`
  }
  const baseContribution = display.money(effect.baseUsd)
  const delta = effect.deltaUsd
  if (delta === null || delta.isZero()) {
    return `Retiring at ${toAge} instead of ${fromAge} leaves the required monthly contribution at ${baseContribution}.`
  }
  const direction = delta.isPositive() ? "raises" : "lowers"
  const magnitude = display.money(delta.abs())
  return `Retiring at ${toAge} instead of ${fromAge} ${direction} the required monthly contribution to ${changedContribution} — ${magnitude}/month ${delta.isPositive() ? "more" : "less"} than ${baseContribution}.`
}

interface Props {
  /** The planner's deferred draft — same object every other Plan figure runs on. */
  inputs: RetirementScenarioInputs
  startingAmountUsd: BigNumber
  display: RetirementDisplay
}

export function SensitivityInsights({
  inputs,
  startingAmountUsd,
  display,
}: Props) {
  const insights = useMemo(
    () => computeSensitivityInsights(inputs, { startingAmountUsd }),
    [inputs, startingAmountUsd],
  )

  if (insights.length === 0) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="inline-flex items-center gap-1.5 text-sm font-medium">
          Sensitivity insights
          <Hint text={GLOSSARY_HINTS.sensitivityInsight} label="a sensitivity insight" />
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2 text-sm">
          {insights.map((insight, index) => (
            <li
              key={`${insight.kind}-${insight.changedValue.toString()}-${index}`}
              className="flex gap-2 text-muted-foreground"
            >
              <span aria-hidden className="text-foreground/40">
                •
              </span>
              <span>{phrase(insight, display)}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
