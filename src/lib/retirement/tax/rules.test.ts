import { describe, it, expect } from "vitest"
import { bn } from "@/lib/config"
import { RETURN_CURRENCY } from "@/lib/retirement/constants"
import { projectScenario } from "@/lib/retirement/projection"
import { scenario } from "@/lib/retirement/test-fixtures"
import type {
  ComparisonOption,
  Projection,
  RetirementScenarioInputs,
} from "@/lib/retirement/types"
import { besContributionEnhancer } from "@/lib/retirement/tax/bes"
import {
  BES_EXIT_WITHHOLDING_PCT,
  TAX_RULE_ID,
  TRY_DEPOSIT_ASSUMED_WITHHOLDING_PCT,
  YI_UFE_INDEXATION_MIN_INCREASE_PCT,
} from "@/lib/retirement/tax/constants"
import { buildExitPosition } from "@/lib/retirement/tax/lots"
import { estimateRetirementTax, taxRuleFor } from "@/lib/retirement/tax/rules"

function option(overrides: Partial<ComparisonOption> = {}): ComparisonOption {
  return {
    id: "test",
    name: "Test",
    expectedReturn: { pessimistic: 4, base: 7, optimistic: 10 },
    returnCurrency: RETURN_CURRENCY.usd,
    taxRuleId: TAX_RULE_ID.flatRate,
    ...overrides,
  }
}

function project(
  inputs: RetirementScenarioInputs,
  startingAmountUsd = bn(0),
): Projection {
  return projectScenario(inputs, { startingAmountUsd })
}

describe("buildExitPosition", () => {
  it("recovers the starting amount and every contribution as lots", () => {
    const inputs = scenario({ retirementAge: 36 }) // 12 accumulation months
    const position = buildExitPosition(project(inputs, bn(50000)))
    expect(position.exitMonths).toBe(12)
    expect(position.startingAmountUsd.toNumber()).toBeCloseTo(50000, 6)
    expect(position.lots).toHaveLength(13) // the seed plus 12 contributions
    expect(position.costUsd.toNumber()).toBeCloseTo(62000, 6)
  })

  it("splits the exit value across the lots without losing a cent", () => {
    const inputs = scenario({ retirementAge: 40 })
    const projection = project(inputs, bn(10000))
    const position = buildExitPosition(projection)
    const allocated = position.lots.reduce(
      (sum, lot) => sum.plus(lot.exitValueUsd),
      bn(0),
    )
    expect(allocated.toNumber()).toBeCloseTo(projection.finalValueUsd.toNumber(), 6)
  })
})

describe("foreign_equity_capital_gains", () => {
  const rule = taxRuleFor(TAX_RULE_ID.foreignEquityCapitalGains)

  it("taxes the same USD gain differently at a different TRY depreciation", () => {
    // The spec's acceptance case: same plan, same USD outcome, only the lira
    // path differs. A lira held stable against a 25%-inflating price index puts
    // the indexed cost above the sale value and there is nothing to tax; a lira
    // falling in step with inflation leaves the real gain exposed.
    const stableLira = scenario({ tryInflationPct: 25, tryDepreciationPct: 5 })
    const weakLira = scenario({ tryInflationPct: 25, tryDepreciationPct: 25 })
    const projection = project(stableLira)

    const stableTax = rule({ projection, inputs: stableLira, option: option() })
    const weakTax = rule({ projection, inputs: weakLira, option: option() })

    expect(projection.finalValueUsd.toNumber()).toBeGreaterThan(0)
    expect(stableTax.taxUsd.toNumber()).toBe(0)
    expect(weakTax.taxUsd.toNumber()).toBeGreaterThan(0)
  })

  it("applies the indexation uplift only above the ≥10% gate", () => {
    expect(YI_UFE_INDEXATION_MIN_INCREASE_PCT).toBe(10)
    const oneYear = { currentAge: 35, retirementAge: 36, tryDepreciationPct: 0 }
    const projection = project(scenario(oneYear))
    const lotCount = buildExitPosition(projection).lots.length

    // Over a one-year horizon no lot accumulates a 10% index increase at 9%/yr.
    const belowGate = scenario({ ...oneYear, tryInflationPct: 9 })
    const belowResult = rule({ projection, inputs: belowGate, option: option() })
    expect(belowResult.note).toContain(`0/${lotCount} lots cleared`)

    // At 30%/yr the older lots clear the gate and index their cost up; the ones
    // bought near the exit still do not.
    const overGate = scenario({ ...oneYear, tryInflationPct: 30 })
    const overResult = rule({ projection, inputs: overGate, option: option() })
    expect(overResult.note).toMatch(
      new RegExp(`(?!0/)\\d+/${lotCount} lots cleared`),
    )
    expect(overResult.taxUsd.toNumber()).toBeLessThan(belowResult.taxUsd.toNumber())
  })

  it("charges nothing when indexation wipes the TRY gain out", () => {
    const inputs = scenario({ tryInflationPct: 60, tryDepreciationPct: 0 })
    const result = rule({ projection: project(inputs), inputs, option: option() })
    expect(result.taxUsd.toNumber()).toBe(0)
    expect(result.note).toContain("No taxable TRY gain")
  })

  it("never returns a negative tax on a losing plan", () => {
    const inputs = scenario({
      primaryExpectedReturn: { pessimistic: -20, base: -20, optimistic: -20 },
    })
    const result = rule({ projection: project(inputs), inputs, option: option() })
    expect(result.taxUsd.toNumber()).toBe(0)
  })
})

describe("gold_untaxed", () => {
  it("charges nothing and says why", () => {
    const inputs = scenario()
    const result = taxRuleFor(TAX_RULE_ID.goldUntaxed)({
      projection: project(inputs),
      inputs,
      option: option({ taxRuleId: TAX_RULE_ID.goldUntaxed }),
    })
    expect(result.taxUsd.toNumber()).toBe(0)
    expect(result.note).toContain("no holding-period condition")
  })
})

describe("bes_exit_withholding", () => {
  const besOption = option({
    taxRuleId: TAX_RULE_ID.besExitWithholding,
    returnCurrency: RETURN_CURRENCY.try,
  })

  function besProjection(inputs: RetirementScenarioInputs): Projection {
    return projectScenario(inputs, {
      startingAmountUsd: bn(0),
      contributionEnhancer: besContributionEnhancer(inputs),
    })
  }

  function estimateFor(inputs: RetirementScenarioInputs) {
    return estimateRetirementTax({
      projection: besProjection(inputs),
      inputs,
      option: besOption,
    })
  }

  it("withholds 15% below ten years of contributions", () => {
    const result = estimateFor(scenario({ currentAge: 40, retirementAge: 48 }))
    expect(result.note).toContain(`${BES_EXIT_WITHHOLDING_PCT.belowTenYears}%`)
    expect(result.note).toContain("no retirement right")
  })

  it("withholds 10% at ten years without a retirement right", () => {
    const result = estimateFor(scenario({ currentAge: 30, retirementAge: 45 }))
    expect(result.note).toContain(
      `${BES_EXIT_WITHHOLDING_PCT.tenYearsNoRetirementRight}%`,
    )
    expect(result.note).toContain("60% of the state contribution vested")
  })

  it("withholds 5% on the retirement right and vests the state contribution in full", () => {
    const result = estimateFor(scenario({ currentAge: 35, retirementAge: 60 }))
    expect(result.note).toContain(`${BES_EXIT_WITHHOLDING_PCT.retirementRight}%`)
    expect(result.note).toContain("retirement right (age 56 + 10 years)")
    expect(result.note).toContain("100% of the state contribution vested")
  })

  it("vests below 100% at a short horizon", () => {
    const result = estimateFor(scenario({ currentAge: 50, retirementAge: 54 }))
    expect(result.note).toContain("15% of the state contribution vested")
  })

  it("charges the tier on the irat only, never on principal", () => {
    const inputs = scenario({ currentAge: 35, retirementAge: 60 })
    const projection = besProjection(inputs)
    const result = estimateRetirementTax({ projection, inputs, option: besOption })

    const principalUsd = projection.totalContributionsUsd
    const iratUsd = projection.finalValueUsd.minus(principalUsd)
    // Retirement vests the state contribution in full, so principal = everything
    // paid in, participant and state alike.
    expect(result.taxUsd.toNumber()).toBeCloseTo(
      iratUsd.times(BES_EXIT_WITHHOLDING_PCT.retirementRight).dividedBy(100).toNumber(),
      6,
    )
    expect(result.taxUsd.toNumber()).toBeLessThan(
      projection.finalValueUsd
        .times(BES_EXIT_WITHHOLDING_PCT.retirementRight)
        .dividedBy(100)
        .toNumber(),
    )
  })

  it("charges nothing when the balance never exceeds principal", () => {
    const inputs = scenario({
      currentAge: 35,
      retirementAge: 60,
      primaryExpectedReturn: { pessimistic: -10, base: -10, optimistic: -10 },
    })
    const result = estimateFor(inputs)
    expect(result.taxUsd.toNumber()).toBe(0)
    expect(result.note).toContain("No irat above principal")
  })
})

describe("try_deposit_withholding", () => {
  const rule = taxRuleFor(TAX_RULE_ID.tryDepositWithholding)

  it("withholds the over-one-year tier on the nominal TRY interest", () => {
    const inputs = scenario({ tryDepreciationPct: 20 })
    const projection = project(inputs)
    const result = rule({
      projection,
      inputs,
      option: option({
        taxRuleId: TAX_RULE_ID.tryDepositWithholding,
        returnCurrency: RETURN_CURRENCY.try,
      }),
    })
    expect(result.note).toContain(`${TRY_DEPOSIT_ASSUMED_WITHHOLDING_PCT}%`)
    expect(result.taxUsd.toNumber()).toBeGreaterThan(0)
  })

  it("taxes more when the lira falls faster, because the TRY interest is larger", () => {
    const projection = project(scenario())
    const slow = rule({
      projection,
      inputs: scenario({ tryDepreciationPct: 5 }),
      option: option({ taxRuleId: TAX_RULE_ID.tryDepositWithholding }),
    })
    const fast = rule({
      projection,
      inputs: scenario({ tryDepreciationPct: 30 }),
      option: option({ taxRuleId: TAX_RULE_ID.tryDepositWithholding }),
    })
    expect(fast.taxUsd.toNumber()).toBeGreaterThan(slow.taxUsd.toNumber())
  })
})

describe("flat_rate", () => {
  const rule = taxRuleFor(TAX_RULE_ID.flatRate)

  it("takes the stated percentage of the USD gain", () => {
    const inputs = scenario()
    const projection = project(inputs)
    const result = rule({
      projection,
      inputs,
      option: option({ flatTaxRatePct: 20 }),
    })
    const gainUsd = projection.finalValueUsd.minus(projection.totalContributionsUsd)
    expect(result.taxUsd.toNumber()).toBeCloseTo(gainUsd.times(0.2).toNumber(), 6)
  })

  it("charges nothing without a rate", () => {
    const inputs = scenario()
    const result = rule({ projection: project(inputs), inputs, option: option() })
    expect(result.taxUsd.toNumber()).toBe(0)
  })
})
