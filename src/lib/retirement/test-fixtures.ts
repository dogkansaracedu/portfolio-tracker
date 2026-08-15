import { WITHDRAWAL_STRATEGY } from "@/lib/retirement/constants"
import {
  normalizeScenarioInputs,
  type StoredRetirementScenarioInputs,
} from "@/lib/retirement/scenario"
import type { RetirementScenarioInputs } from "@/lib/retirement/types"

/**
 * A plain scenario the worked numeric cases build on: 35 → 55 (240 months),
 * $1,000/month flat, 7%/yr base, 2% USD inflation, $3,000/month spending at a
 * 4% SWR. Overrides isolate the one input a case is about.
 *
 * Built through `normalizeScenarioInputs`, so an override of `retirementAge`
 * carries `contributionEndAge` with it unless the case sets one — a case about
 * the coasting window says so explicitly, every other case contributes to
 * retirement.
 */
export function scenario(
  overrides: Partial<StoredRetirementScenarioInputs> = {},
): RetirementScenarioInputs {
  return normalizeScenarioInputs({
    startingAmountUsd: 0,
    monthlyContributionUsd: 1000,
    contributionGrowthPct: 0,
    currentAge: 35,
    retirementAge: 55,
    depletionAge: 80,
    monthlySpendingUsd: 3000,
    safeWithdrawalRatePct: 4,
    withdrawalStrategy: WITHDRAWAL_STRATEGY.preservation,
    primaryExpectedReturn: { pessimistic: 4, base: 7, optimistic: 10 },
    usdInflationPct: 2,
    tryInflationPct: 30,
    tryDepreciationPct: 25,
    options: [],
    ...overrides,
  })
}
