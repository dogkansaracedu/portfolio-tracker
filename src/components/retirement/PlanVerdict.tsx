import { useMemo, type ReactNode } from "react"
import type BigNumber from "bignumber.js"
import { CircleCheck, PartyPopper, TriangleAlert } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { gainLossClass } from "@/lib/prices"
import { cn } from "@/lib/utils"
import {
  computeRetirementTarget,
  monthsToRetirement as monthsToRetirementOf,
  projectScenario,
  solveEarliestRetirementAge,
  solveRequiredContribution,
  solveSupportedSpending,
  type RetirementScenarioInputs,
} from "@/lib/retirement"
import { NOT_REACHABLE, VERDICT_LABELS } from "./constants"
import { formatAge, type RetirementDisplay } from "./display"

/**
 * Yes or no, in words: does this plan reach the retirement target at the
 * retirement age it was given? Shown by every Plan question whose retirement
 * age is an INPUT — "when can I retire?" answers it instead.
 *
 * A falling-short verdict never stops at the bad news: the three escape routes
 * are the three ways out of the same shortfall — retire later
 * (`solveEarliestRetirementAge`), pay in more (`solveRequiredContribution`), or
 * live on less (`solveSupportedSpending`) — and each one is omitted rather than
 * fabricated when its solve has no answer.
 *
 * The solves live in this component rather than in `PlanTab` for the same
 * reason `SensitivityInsights`' do: behind their own boundary React can commit
 * the headline first and abandon this pass when the next keystroke arrives.
 */

interface Props {
  /** The planner's deferred draft — same object every other Plan figure runs on. */
  inputs: RetirementScenarioInputs
  startingAmountUsd: BigNumber
  display: RetirementDisplay
  /**
   * The Coast FIRE gap when the plan is already coasting (gap ≤ 0), which is a
   * stronger verdict than "it works" and is celebrated as such. Null otherwise.
   */
  coastingByUsd?: BigNumber | null
}

type Verdict =
  | { kind: "coasting"; coastingByUsd: BigNumber }
  | { kind: "works"; surplusUsd: BigNumber; earliestRetirementAge: number | null }
  | {
      kind: "short"
      shortfallUsd: BigNumber
      earliestRetirementAge: number | null
      requiredContributionUsd: BigNumber | null
      supportedSpendingUsd: BigNumber
    }

export function PlanVerdict({
  inputs,
  startingAmountUsd,
  display,
  coastingByUsd = null,
}: Props) {
  const verdict = useMemo<Verdict>(() => {
    if (coastingByUsd !== null) return { kind: "coasting", coastingByUsd }

    const targetUsd = computeRetirementTarget(inputs)
    // Accumulation only: the verdict compares the value AT retirement with the
    // target, exactly as the "what will I have?" headline does.
    const valueUsd = projectScenario(inputs, { startingAmountUsd }).finalValueUsd
    const surplusUsd = valueUsd.minus(targetUsd)
    const earliestRetirementAge = solveEarliestRetirementAge(inputs, {
      startingAmountUsd,
    })

    if (!surplusUsd.isNegative()) {
      return { kind: "works", surplusUsd, earliestRetirementAge }
    }
    return {
      kind: "short",
      shortfallUsd: surplusUsd.negated(),
      earliestRetirementAge,
      requiredContributionUsd: solveRequiredContribution(targetUsd, inputs, {
        startingAmountUsd,
      }),
      supportedSpendingUsd: solveSupportedSpending(inputs, valueUsd),
    }
  }, [inputs, startingAmountUsd, coastingByUsd])

  const monthsToRetirement = monthsToRetirementOf(inputs)
  const positive = verdict.kind !== "short"

  const { icon, headline, detail } = ((): {
    icon: ReactNode
    headline: string
    detail: ReactNode
  } => {
    if (verdict.kind === "coasting") {
      return {
        icon: <PartyPopper className={cn("size-5 shrink-0", gainLossClass(true))} />,
        headline: `${VERDICT_LABELS.alreadyCoasting}.`,
        detail: (
          <>
            Your portfolio is already past its Coast FIRE number by{" "}
            {display.money(verdict.coastingByUsd.abs())} — expected growth alone
            is projected to reach the retirement target by age{" "}
            {formatAge(inputs.retirementAge)}, with no further contributions.
          </>
        ),
      }
    }

    if (verdict.kind === "works") {
      const yearsEarly =
        verdict.earliestRetirementAge === null
          ? 0
          : inputs.retirementAge - verdict.earliestRetirementAge
      return {
        icon: <CircleCheck className={cn("size-5 shrink-0", gainLossClass(true))} />,
        headline: `${VERDICT_LABELS.works}.`,
        detail: (
          <>
            You reach your retirement target at age{" "}
            {formatAge(inputs.retirementAge)} with{" "}
            {display.money(verdict.surplusUsd, monthsToRetirement)} to spare
            {yearsEarly > 0 && (
              <>
                {" "}
                — and on this plan you could have retired {yearsEarly} year
                {yearsEarly === 1 ? "" : "s"} earlier, at age{" "}
                {formatAge(verdict.earliestRetirementAge!)}
              </>
            )}
            .
          </>
        ),
      }
    }

    const routes: ReactNode[] = []
    if (
      verdict.earliestRetirementAge !== null &&
      verdict.earliestRetirementAge > inputs.retirementAge
    ) {
      routes.push(
        <>retire at {formatAge(verdict.earliestRetirementAge)} instead</>,
      )
    }
    if (
      verdict.requiredContributionUsd !== null &&
      verdict.requiredContributionUsd.isGreaterThan(inputs.monthlyContributionUsd)
    ) {
      routes.push(
        <>contribute {display.money(verdict.requiredContributionUsd)} / month</>,
      )
    }
    if (verdict.supportedSpendingUsd.isLessThan(inputs.monthlySpendingUsd)) {
      routes.push(
        <>
          spend {display.money(verdict.supportedSpendingUsd)} / month in today's
          USD
        </>,
      )
    }

    return {
      icon: (
        <TriangleAlert className={cn("size-5 shrink-0", gainLossClass(false))} />
      ),
      headline: `${VERDICT_LABELS.fallsShort} by ${display.money(
        verdict.shortfallUsd,
        monthsToRetirement,
      )}.`,
      detail:
        routes.length === 0 ? (
          <>{NOT_REACHABLE}.</>
        ) : (
          <>
            {VERDICT_LABELS.routes}{" "}
            {routes.map((route, index) => (
              <span key={index}>
                {index > 0 && (index === routes.length - 1 ? ", or " : ", ")}
                {route}
              </span>
            ))}
            .
          </>
        ),
    }
  })()

  return (
    <Card>
      <CardContent className="flex items-start gap-3">
        {icon}
        <div className="space-y-0.5">
          <p className={cn("font-medium", gainLossClass(positive))}>{headline}</p>
          <p className="text-sm text-muted-foreground">{detail}</p>
        </div>
      </CardContent>
    </Card>
  )
}
