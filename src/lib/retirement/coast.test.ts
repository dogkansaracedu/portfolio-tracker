import { describe, it, expect } from "vitest"
import { bn } from "@/lib/config"
import {
  coastFireCurve,
  computeCoastFireGap,
  computeCoastFireNumber,
  computeCoastOutlook,
  findCoastDate,
} from "@/lib/retirement/coast"
import { projectScenario } from "@/lib/retirement/projection"
import { computeRetirementTarget } from "@/lib/retirement/target"
import { scenario } from "@/lib/retirement/test-fixtures"

const inputs = scenario()
const target = computeRetirementTarget(inputs)
const BASE_RATE_PCT = inputs.primaryExpectedReturn.base

describe("computeCoastFireNumber", () => {
  it("discounts the target back at the expected return", () => {
    // 1,337,352.66 ÷ 1.07^20.
    expect(
      computeCoastFireNumber(target, BASE_RATE_PCT, 20).toNumber(),
    ).toBeCloseTo(345597.339872, 2)
  })

  it("is the whole target once retirement is reached", () => {
    expect(computeCoastFireNumber(target, BASE_RATE_PCT, 0).toNumber()).toBe(
      target.toNumber(),
    )
  })

  it("rises as retirement approaches", () => {
    const far = computeCoastFireNumber(target, BASE_RATE_PCT, 20)
    const near = computeCoastFireNumber(target, BASE_RATE_PCT, 5)
    expect(near.isGreaterThan(far)).toBe(true)
  })
})

describe("coastFireCurve", () => {
  const curve = coastFireCurve(target, BASE_RATE_PCT, 240)

  it("runs monthly from today to retirement inclusive", () => {
    expect(curve).toHaveLength(241)
    expect(curve[0].monthsFromNow).toBe(0)
    expect(curve[0].coastFireNumberUsd.toNumber()).toBeCloseTo(345597.339872, 2)
  })

  it("ends exactly on the target", () => {
    expect(curve[240].coastFireNumberUsd.toNumber()).toBeCloseTo(
      target.toNumber(),
      6,
    )
  })

  it("is monotonically rising", () => {
    const rising = curve.every(
      (point, i) =>
        i === 0 ||
        point.coastFireNumberUsd.isGreaterThan(curve[i - 1].coastFireNumberUsd),
    )
    expect(rising).toBe(true)
  })
})

describe("computeCoastFireGap", () => {
  it("is positive while short of the Coast FIRE number", () => {
    const coastFireNumber = computeCoastFireNumber(target, BASE_RATE_PCT, 20)
    expect(
      computeCoastFireGap(coastFireNumber, bn(100000)).toNumber(),
    ).toBeCloseTo(245597.339872, 2)
  })

  it("is zero or negative once coasting", () => {
    const coastFireNumber = computeCoastFireNumber(target, BASE_RATE_PCT, 20)
    expect(
      computeCoastFireGap(coastFireNumber, bn(400000)).isLessThan(0),
    ).toBe(true)
  })
})

describe("findCoastDate", () => {
  const curve = coastFireCurve(target, BASE_RATE_PCT, 240)

  it("returns the first month the projection meets the rising coast number", () => {
    // The base plan alone never catches the curve; $200k seeded + $3,000/month
    // does, somewhere before retirement.
    const projection = projectScenario(
      scenario({ startingAmountUsd: 200000, monthlyContributionUsd: 3000 }),
    )
    const coastDate = findCoastDate(projection, curve)
    expect(coastDate).not.toBeNull()
    // The crossing is a real crossing: short the month before, met on the month.
    expect(coastDate!.portfolioValueUsd.isGreaterThanOrEqualTo(
      coastDate!.coastFireNumberUsd,
    )).toBe(true)
    const previous = projection.months[coastDate!.monthIndex - 1]
    expect(
      previous.valueUsd.isLessThan(
        curve[coastDate!.monthsFromNow - 1].coastFireNumberUsd,
      ),
    ).toBe(true)
  })

  it("crosses in the first month when the portfolio is already coasting", () => {
    const projection = projectScenario(inputs, {
      startingAmountUsd: bn(400000),
    })
    expect(findCoastDate(projection, curve)?.monthIndex).toBe(0)
  })

  it("is null when the plan never gets there", () => {
    const projection = projectScenario(
      scenario({ monthlyContributionUsd: 0, startingAmountUsd: 0 }),
    )
    expect(findCoastDate(projection, curve)).toBeNull()
  })
})

describe("computeCoastOutlook", () => {
  it("assembles the same figures the parts produce separately", () => {
    const outlook = computeCoastOutlook(inputs)
    expect(outlook.targetUsd.toNumber()).toBeCloseTo(target.toNumber(), 6)
    expect(outlook.coastFireNumberUsd.toNumber()).toBeCloseTo(345597.339872, 2)
    expect(outlook.curve).toHaveLength(241)
    expect(outlook.coastFireGapUsd.toNumber()).toBeCloseTo(345597.339872, 2)
    expect(outlook.coasting).toBe(false)
  })

  it("reports the coast date as an age, months from now", () => {
    const outlook = computeCoastOutlook(
      scenario({ startingAmountUsd: 200000, monthlyContributionUsd: 3000 }),
    )
    expect(outlook.coastDate).not.toBeNull()
    expect(outlook.coastAge).toBeCloseTo(35 + outlook.coastDate!.monthsFromNow / 12, 10)
    expect(outlook.coastAge!).toBeGreaterThan(35)
    expect(outlook.coastAge!).toBeLessThan(55)
  })

  it("is already coasting when the starting value is past the Coast FIRE number", () => {
    const outlook = computeCoastOutlook(scenario({ startingAmountUsd: 400000 }))
    expect(outlook.coasting).toBe(true)
    expect(outlook.coastFireGapUsd.isNegative()).toBe(true)
  })

  it("has no coast age when the plan never crosses the curve", () => {
    const outlook = computeCoastOutlook(
      scenario({ monthlyContributionUsd: 0, startingAmountUsd: 0 }),
    )
    expect(outlook.coastDate).toBeNull()
    expect(outlook.coastAge).toBeNull()
  })

  it("runs the outlook on an overridden contribution (the suggestion table's use)", () => {
    const base = computeCoastOutlook(
      scenario({ startingAmountUsd: 200000, monthlyContributionUsd: 3000 }),
    )
    const richer = computeCoastOutlook(scenario({ startingAmountUsd: 200000 }), {
      monthlyContributionUsd: bn(6000),
    })
    expect(richer.coastAge!).toBeLessThan(base.coastAge!)
  })
})
