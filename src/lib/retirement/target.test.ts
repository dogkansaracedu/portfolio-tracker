import { describe, it, expect } from "vitest"
import { WITHDRAWAL_STRATEGY } from "@/lib/retirement/constants"
import { projectScenario } from "@/lib/retirement/projection"
import { computeRetirementTarget } from "@/lib/retirement/target"
import { scenario } from "@/lib/retirement/test-fixtures"

/**
 * Worked cases for the retirement target formula. Spending is $3,000/month of
 * today's money; 20 years of 2% inflation make the first retirement month
 * $4,457.84 (P), so the retirement-date annual spend is $53,494.11.
 */
describe("computeRetirementTarget", () => {
  it("capital preservation = inflated annual spending ÷ SWR", () => {
    const target = computeRetirementTarget(scenario())
    expect(target.toNumber()).toBeCloseTo(1337352.656381, 2)
  })

  it("capital depletion prices the growing annuity to the depletion age", () => {
    // 5%/yr against 2% inflation over 300 months.
    const target = computeRetirementTarget(
      scenario({
        withdrawalStrategy: WITHDRAWAL_STRATEGY.depletion,
        primaryExpectedReturn: { pessimistic: 3, base: 5, optimistic: 7 },
      }),
    )
    expect(target.toNumber()).toBeCloseTo(948642.549638, 2)
  })

  it("collapses to P × m when the return exactly matches inflation (r_m = g_m)", () => {
    // 2% growth vs 2% inflation, 55 → 75 = 240 months: 4457.842188 × 240.
    const target = computeRetirementTarget(
      scenario({
        withdrawalStrategy: WITHDRAWAL_STRATEGY.depletion,
        depletionAge: 75,
        primaryExpectedReturn: { pessimistic: 2, base: 2, optimistic: 2 },
        usdInflationPct: 2,
      }),
    )
    expect(target.toNumber()).toBeCloseTo(1069882.125, 2)
  })

  it("depletion needs less than preservation for the same spending", () => {
    const preservation = computeRetirementTarget(scenario())
    const depletion = computeRetirementTarget(
      scenario({ withdrawalStrategy: WITHDRAWAL_STRATEGY.depletion }),
    )
    expect(depletion.isLessThan(preservation)).toBe(true)
  })

  it("funds the whole drawdown, with a small surplus at the depletion age", () => {
    // Retire today, so the target is spent month by month with no accumulation
    // in between. It runs the drawdown down to a SURPLUS, never a shortfall:
    // the annuity prices spending as if it grew every month, while the
    // recurrence steps it once a year (GLOSSARY projection formula), so the
    // plan spends slightly less than it was funded for — ~5% of the target
    // over a 25-year drawdown.
    const inputs = scenario({
      currentAge: 55,
      withdrawalStrategy: WITHDRAWAL_STRATEGY.depletion,
    })
    const target = computeRetirementTarget(inputs)
    const projection = projectScenario(inputs, {
      startingAmountUsd: target,
      includeRetirementDrawdown: true,
    })
    expect(target.toNumber()).toBeCloseTo(522954.5461, 2)
    expect(projection.finalValueUsd.isGreaterThanOrEqualTo(0)).toBe(true)
    expect(
      projection.finalValueUsd.dividedBy(target).toNumber(),
    ).toBeLessThan(0.06)
  })

  it("is zero rather than infinite at a non-positive SWR", () => {
    expect(
      computeRetirementTarget(scenario({ safeWithdrawalRatePct: 0 })).toNumber(),
    ).toBe(0)
  })

  it("is zero when the depletion age is not after the retirement age", () => {
    const target = computeRetirementTarget(
      scenario({
        withdrawalStrategy: WITHDRAWAL_STRATEGY.depletion,
        depletionAge: 55,
      }),
    )
    expect(target.toNumber()).toBe(0)
  })
})
