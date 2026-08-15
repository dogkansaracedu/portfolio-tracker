import { describe, it, expect } from "vitest"
import { bn } from "@/lib/config"
import { runComparison } from "@/lib/retirement/compare"
import { PROJECTION_BAND, RETURN_CURRENCY } from "@/lib/retirement/constants"
import {
  DEFAULT_RETIREMENT_SCENARIO_INPUTS,
  RETIREMENT_OPTION_ID,
  RETIREMENT_OPTION_PRESETS,
} from "@/lib/retirement/presets"
import { monthsToRetirement } from "@/lib/retirement/projection"
import { toReal, usdRateFromTryRate } from "@/lib/retirement/real"
import { scenario } from "@/lib/retirement/test-fixtures"
import { TAX_RULE_ID } from "@/lib/retirement/tax/constants"
import type { ComparisonOption } from "@/lib/retirement/types"

const goldOption: ComparisonOption = {
  id: RETIREMENT_OPTION_ID.gold,
  name: "Gold",
  expectedReturn: { pessimistic: 5, base: 8, optimistic: 10 },
  returnCurrency: RETURN_CURRENCY.usd,
  taxRuleId: TAX_RULE_ID.goldUntaxed,
}

const flatOption: ComparisonOption = {
  id: "custom",
  name: "Custom",
  expectedReturn: { pessimistic: 4, base: 7, optimistic: 10 },
  returnCurrency: RETURN_CURRENCY.usd,
  taxRuleId: TAX_RULE_ID.flatRate,
  flatTaxRatePct: 25,
}

describe("runComparison", () => {
  it("runs every option through all three bands", () => {
    const results = runComparison(scenario({ options: [goldOption, flatOption] }))
    expect(results).toHaveLength(2)
    for (const result of results) {
      expect(Object.keys(result.projections).sort()).toEqual([
        PROJECTION_BAND.base,
        PROJECTION_BAND.optimistic,
        PROJECTION_BAND.pessimistic,
      ])
      const { pessimistic, base, optimistic } = result.results
      expect(pessimistic.grossFinalValueUsd.toNumber()).toBeLessThan(
        base.grossFinalValueUsd.toNumber(),
      )
      expect(base.grossFinalValueUsd.toNumber()).toBeLessThan(
        optimistic.grossFinalValueUsd.toNumber(),
      )
    }
  })

  it("leaves gold's after-tax value equal to its gross value", () => {
    const [gold] = runComparison(scenario({ options: [goldOption] }))
    const { base } = gold.results
    expect(base.taxEstimate.taxUsd.toNumber()).toBe(0)
    expect(base.afterTaxFinalValueUsd.toNumber()).toBe(
      base.grossFinalValueUsd.toNumber(),
    )
  })

  it("takes the flat rate off the gain, not off the balance", () => {
    const inputs = scenario({ options: [flatOption] })
    const [custom] = runComparison(inputs)
    const { base } = custom.results
    const projection = custom.projections.base
    const gainUsd = projection.finalValueUsd.minus(projection.totalContributionsUsd)

    expect(base.taxEstimate.taxUsd.toNumber()).toBeCloseTo(
      gainUsd.times(0.25).toNumber(),
      6,
    )
    expect(base.afterTaxFinalValueUsd.toNumber()).toBeCloseTo(
      base.grossFinalValueUsd.minus(gainUsd.times(0.25)).toNumber(),
      6,
    )
  })

  it("deflates the after-tax value to today's purchasing power at retirement", () => {
    const inputs = scenario({ options: [flatOption] })
    const [custom] = runComparison(inputs)
    const { base } = custom.results
    expect(base.afterTaxRealFinalValueUsd.toNumber()).toBeCloseTo(
      toReal(
        base.afterTaxFinalValueUsd,
        monthsToRetirement(inputs),
        inputs.usdInflationPct,
      ).toNumber(),
      6,
    )
    expect(base.afterTaxRealFinalValueUsd.toNumber()).toBeLessThan(
      base.afterTaxFinalValueUsd.toNumber(),
    )
  })

  it("converts a TRY-quoted return through the depreciation assumption", () => {
    const inputs = scenario({
      options: [RETIREMENT_OPTION_PRESETS[3]], // TRY deposit, TRY-quoted
      tryDepreciationPct: 20,
    })
    const [deposit] = runComparison(inputs)
    const usdOnly = runComparison(
      scenario({
        options: [
          {
            ...RETIREMENT_OPTION_PRESETS[3],
            returnCurrency: RETURN_CURRENCY.usd,
            expectedReturn: {
              pessimistic: usdRateFromTryRate(28, 20),
              base: usdRateFromTryRate(35, 20),
              optimistic: usdRateFromTryRate(42, 20),
            },
            taxRuleId: TAX_RULE_ID.goldUntaxed,
          },
        ],
        tryDepreciationPct: 20,
      }),
    )
    expect(deposit.results.base.grossFinalValueUsd.toNumber()).toBeCloseTo(
      usdOnly[0].results.base.grossFinalValueUsd.toNumber(),
      6,
    )
  })

  it("pays the BES state contribution in, so BES accumulates more than its return alone", () => {
    const besPreset = RETIREMENT_OPTION_PRESETS.find(
      (preset) => preset.id === RETIREMENT_OPTION_ID.bes,
    )!
    const inputs = scenario({ options: [besPreset] })
    const withEnhancer = runComparison(inputs)[0]
    const withoutEnhancer = runComparison(
      scenario({
        options: [{ ...besPreset, taxRuleId: TAX_RULE_ID.goldUntaxed }],
      }),
    )[0]

    expect(
      withEnhancer.projections.base.totalContributionsUsd.toNumber(),
    ).toBeGreaterThan(
      withoutEnhancer.projections.base.totalContributionsUsd.toNumber(),
    )
    expect(withEnhancer.results.base.taxEstimate.note).toContain("irat")
  })

  it("seeds every option from the same starting amount", () => {
    const inputs = scenario({ options: [goldOption, flatOption] })
    const seeded = runComparison(inputs, { startingAmountUsd: bn(100000) })
    const unseeded = runComparison(inputs)
    expect(seeded[0].results.base.grossFinalValueUsd.toNumber()).toBeGreaterThan(
      unseeded[0].results.base.grossFinalValueUsd.toNumber(),
    )
    expect(seeded[0].projections.base.months[0].valueUsd.toNumber()).toBeGreaterThan(
      100000,
    )
  })

  it("runs the shipped presets end to end", () => {
    const results = runComparison(
      DEFAULT_RETIREMENT_SCENARIO_INPUTS,
      { startingAmountUsd: bn(50000) },
    )
    expect(results.map((result) => result.option.id)).toEqual([
      RETIREMENT_OPTION_ID.usEquities,
      RETIREMENT_OPTION_ID.gold,
      RETIREMENT_OPTION_ID.bes,
      RETIREMENT_OPTION_ID.tryDeposit,
    ])
    for (const result of results) {
      const { base } = result.results
      expect(base.grossFinalValueUsd.toNumber()).toBeGreaterThan(0)
      expect(base.taxEstimate.taxUsd.toNumber()).toBeGreaterThanOrEqual(0)
      expect(base.afterTaxFinalValueUsd.toNumber()).toBeLessThanOrEqual(
        base.grossFinalValueUsd.toNumber(),
      )
      expect(base.taxEstimate.note.length).toBeGreaterThan(0)
    }
  })
})
