import type BigNumber from "bignumber.js"
import { MONTHS_PER_YEAR } from "@/lib/retirement/constants"
import {
  compoundFactor,
  expectedReturnForBand,
  monthsToRetirement,
  projectScenario,
  resolveStartingAmountUsd,
  yearsToRetirement,
  type ScenarioProjectionOptions,
} from "@/lib/retirement/projection"
import { computeRetirementTarget } from "@/lib/retirement/target"
import type {
  Projection,
  RetirementScenarioInputs,
} from "@/lib/retirement/types"

/**
 * Coast FIRE — the portfolio value that lets expected growth alone, with no
 * further contributions, reach the retirement target by retirement age.
 *
 * See docs/components/GLOSSARY.md#coast-fire-number-formula.
 */

/** `target ÷ (1+r)^years`. At (or past) retirement the whole target is due now. */
export function computeCoastFireNumber(
  target: BigNumber,
  annualRatePct: number,
  yearsToRetirement: number,
): BigNumber {
  if (yearsToRetirement <= 0) return target
  const factor = compoundFactor(annualRatePct, yearsToRetirement)
  // A rate of −100%/yr or worse compounds to nothing; growth can carry no part
  // of the job, so the coast number is the target itself.
  if (!factor.isGreaterThan(0)) return target
  return target.dividedBy(factor)
}

export interface CoastFirePoint {
  /** 0 = today. */
  monthsFromNow: number
  coastFireNumberUsd: BigNumber
}

/**
 * The Coast FIRE number evaluated every month from now to retirement — a curve
 * RISING toward the target as compounding time runs out. Ends exactly on the
 * target at `monthsToRetirement`.
 */
export function coastFireCurve(
  target: BigNumber,
  annualRatePct: number,
  monthsToRetirement: number,
): CoastFirePoint[] {
  const horizon = Math.max(0, Math.floor(monthsToRetirement))
  const points: CoastFirePoint[] = []
  for (let monthsFromNow = 0; monthsFromNow <= horizon; monthsFromNow++) {
    points.push({
      monthsFromNow,
      coastFireNumberUsd: computeCoastFireNumber(
        target,
        annualRatePct,
        (horizon - monthsFromNow) / MONTHS_PER_YEAR,
      ),
    })
  }
  return points
}

/** `Coast FIRE number − current value`. Positive = still short; ≤ 0 = coasting. */
export function computeCoastFireGap(
  coastFireNumber: BigNumber,
  currentValueUsd: BigNumber,
): BigNumber {
  return coastFireNumber.minus(currentValueUsd)
}

export interface CoastDate {
  /** Index into `projection.months`. */
  monthIndex: number
  /** Months from now; a projection month's value is its END-of-month value. */
  monthsFromNow: number
  portfolioValueUsd: BigNumber
  coastFireNumberUsd: BigNumber
}

/**
 * The coast date: the first projected month whose value meets the then-current
 * Coast FIRE number. Returns null when the plan never crosses before retirement
 * — the UI renders that as "not reachable", never a fabricated date.
 */
export function findCoastDate(
  projection: Projection,
  curve: CoastFirePoint[],
): CoastDate | null {
  for (const month of projection.months) {
    const monthsFromNow = month.monthIndex + 1
    const point = curve[monthsFromNow]
    if (!point) break
    if (month.valueUsd.isGreaterThanOrEqualTo(point.coastFireNumberUsd)) {
      return {
        monthIndex: month.monthIndex,
        monthsFromNow,
        portfolioValueUsd: month.valueUsd,
        coastFireNumberUsd: point.coastFireNumberUsd,
      }
    }
  }
  return null
}

/**
 * Everything the "when can I stop contributing?" question needs, in one pass:
 * the retirement target, today's Coast FIRE number and gap, the rising curve,
 * the projection that runs into it, and the coast date it crosses at — as a
 * month AND as the age the UI puts in front of the user.
 *
 * Assembled here rather than in the views so the coast date behind a headline,
 * a chart marker and a suggested-contribution row is always the same solve.
 * Accumulation only: the crossing is a pre-retirement event.
 */
export interface CoastOutlook {
  targetUsd: BigNumber
  coastFireNumberUsd: BigNumber
  /** Coast FIRE number − starting value. Positive = still short. */
  coastFireGapUsd: BigNumber
  /** Gap ≤ 0: growth alone already reaches the target, contributions or not. */
  coasting: boolean
  curve: CoastFirePoint[]
  projection: Projection
  coastDate: CoastDate | null
  /** The coast date as an age; null when the plan never crosses the curve. */
  coastAge: number | null
}

export function computeCoastOutlook(
  inputs: RetirementScenarioInputs,
  options: ScenarioProjectionOptions = {},
): CoastOutlook {
  const startingAmountUsd = resolveStartingAmountUsd(
    inputs,
    options.startingAmountUsd,
  )
  const annualRatePct =
    options.annualRatePct ??
    expectedReturnForBand(inputs.primaryExpectedReturn, options.band)

  const targetUsd = computeRetirementTarget(inputs, { band: options.band })
  const coastFireNumberUsd = computeCoastFireNumber(
    targetUsd,
    annualRatePct,
    yearsToRetirement(inputs),
  )
  const coastFireGapUsd = computeCoastFireGap(coastFireNumberUsd, startingAmountUsd)
  const curve = coastFireCurve(targetUsd, annualRatePct, monthsToRetirement(inputs))
  const projection = projectScenario(inputs, {
    ...options,
    startingAmountUsd,
    includeRetirementDrawdown: false,
  })
  const coastDate = findCoastDate(projection, curve)

  return {
    targetUsd,
    coastFireNumberUsd,
    coastFireGapUsd,
    coasting: !coastFireGapUsd.isGreaterThan(0),
    curve,
    projection,
    coastDate,
    coastAge:
      coastDate === null
        ? null
        : inputs.currentAge + coastDate.monthsFromNow / MONTHS_PER_YEAR,
  }
}
