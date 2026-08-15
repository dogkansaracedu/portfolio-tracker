import { describe, it, expect } from "vitest"
import type BigNumber from "bignumber.js"
import { bn } from "@/lib/config"
import { WITHDRAWAL_STRATEGY } from "@/lib/retirement/constants"
import { projectScenario } from "@/lib/retirement/projection"
import {
  computeRetirementTarget,
  solveSupportedSpending,
} from "@/lib/retirement/target"
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

/**
 * The same formulas read backwards: "this portfolio supports how much
 * spending?". Every case round-trips through `computeRetirementTarget` — the
 * pair may not drift.
 */
describe("solveSupportedSpending", () => {
  const roundTrip = (inputs: ReturnType<typeof scenario>, valueUsd: BigNumber) => {
    const spendingUsd = solveSupportedSpending(inputs, valueUsd)
    const target = computeRetirementTarget({
      ...inputs,
      monthlySpendingUsd: spendingUsd.toNumber(),
    })
    return { spendingUsd, target }
  }

  it("round-trips under capital preservation", () => {
    const inputs = scenario()
    const valueUsd = bn(1_000_000)
    const { spendingUsd, target } = roundTrip(inputs, valueUsd)
    expect(target.toNumber()).toBeCloseTo(valueUsd.toNumber(), 6)
    // $1M × 4% ÷ 12 = $3,333.33/month at retirement, ÷ 1.02^20 in today's USD.
    expect(spendingUsd.toNumber()).toBeCloseTo(2243.24, 2)
  })

  it("round-trips under capital depletion", () => {
    const inputs = scenario({
      withdrawalStrategy: WITHDRAWAL_STRATEGY.depletion,
      primaryExpectedReturn: { pessimistic: 3, base: 5, optimistic: 7 },
    })
    const valueUsd = bn(948_642.549638)
    const { spendingUsd, target } = roundTrip(inputs, valueUsd)
    expect(target.toNumber()).toBeCloseTo(valueUsd.toNumber(), 4)
    // The target case's own scenario, inverted: $3,000/month of today's USD.
    expect(spendingUsd.toNumber()).toBeCloseTo(3000, 6)
  })

  it("round-trips in the degenerate r_m = g_m case", () => {
    const inputs = scenario({
      withdrawalStrategy: WITHDRAWAL_STRATEGY.depletion,
      depletionAge: 75,
      primaryExpectedReturn: { pessimistic: 2, base: 2, optimistic: 2 },
      usdInflationPct: 2,
    })
    const { spendingUsd, target } = roundTrip(inputs, bn(1_069_882.125))
    expect(target.toNumber()).toBeCloseTo(1_069_882.125, 4)
    expect(spendingUsd.toNumber()).toBeCloseTo(3000, 6)
  })

  it("supports more spending the bigger the portfolio, linearly", () => {
    const inputs = scenario()
    const single = solveSupportedSpending(inputs, bn(1_000_000))
    const double = solveSupportedSpending(inputs, bn(2_000_000))
    expect(double.toNumber()).toBeCloseTo(single.times(2).toNumber(), 8)
  })

  it("is zero wherever the target formula is zero, and for an empty portfolio", () => {
    expect(
      solveSupportedSpending(
        scenario({ safeWithdrawalRatePct: 0 }),
        bn(1_000_000),
      ).toNumber(),
    ).toBe(0)
    expect(
      solveSupportedSpending(
        scenario({
          withdrawalStrategy: WITHDRAWAL_STRATEGY.depletion,
          depletionAge: 55,
        }),
        bn(1_000_000),
      ).toNumber(),
    ).toBe(0)
    expect(solveSupportedSpending(scenario(), bn(0)).toNumber()).toBe(0)
    expect(solveSupportedSpending(scenario(), bn(-5000)).toNumber()).toBe(0)
  })
})
