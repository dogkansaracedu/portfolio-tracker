import { describe, it, expect } from "vitest"
import { bn } from "@/lib/config"
import { scenario } from "@/lib/retirement/test-fixtures"
import {
  besContributionEnhancer,
  besHasRetirementRight,
  besPrincipalSplitUsd,
  besStateContributionCapTry,
  besVestedPct,
} from "@/lib/retirement/tax/bes"
import {
  ASSUMED_USD_TRY_SPOT_RATE,
  BES_STATE_CONTRIBUTION_CAP_BASIS_TRY,
  BES_STATE_CONTRIBUTION_RATE_PCT,
} from "@/lib/retirement/tax/constants"

const MAX_STATE_CONTRIBUTION_TRY_YEAR_ONE =
  (BES_STATE_CONTRIBUTION_CAP_BASIS_TRY * BES_STATE_CONTRIBUTION_RATE_PCT) / 100

describe("besStateContributionCapTry", () => {
  it("is 20% of the minimum-wage basis in the first projection year", () => {
    const inputs = scenario({ tryInflationPct: 25 })
    expect(besStateContributionCapTry(inputs, 0).toNumber()).toBeCloseTo(
      MAX_STATE_CONTRIBUTION_TRY_YEAR_ONE,
      6,
    )
  })

  it("grows the nominal TL cap by the TRY-inflation assumption", () => {
    const inputs = scenario({ tryInflationPct: 25 })
    expect(besStateContributionCapTry(inputs, 2).toNumber()).toBeCloseTo(
      MAX_STATE_CONTRIBUTION_TRY_YEAR_ONE * 1.25 * 1.25,
      6,
    )
  })
})

describe("besContributionEnhancer", () => {
  it("matches 20% of a contribution well below the cap", () => {
    const inputs = scenario({ tryDepreciationPct: 0 })
    const enhancer = besContributionEnhancer(inputs)
    expect(enhancer(0, bn(1000)).toNumber()).toBeCloseTo(200, 6)
  })

  it("stops paying once the annual cap is used up, and resumes in January", () => {
    // At a flat 48 TL/USD the 79,272 TL cap is $1,651.50 of match, so a
    // $2,000/mo plan (a $400 match) exhausts it part-way through month 5.
    const inputs = scenario({
      monthlyContributionUsd: 2000,
      tryDepreciationPct: 0,
      tryInflationPct: 0,
    })
    const enhancer = besContributionEnhancer(inputs)
    const capUsd = MAX_STATE_CONTRIBUTION_TRY_YEAR_ONE / ASSUMED_USD_TRY_SPOT_RATE

    const firstYear = Array.from({ length: 12 }, (_, month) =>
      enhancer(month, bn(2000)).toNumber(),
    )
    expect(firstYear[3]).toBeCloseTo(400, 6)
    expect(firstYear[4]).toBeCloseTo(capUsd - 4 * 400, 6)
    expect(firstYear[5]).toBe(0)
    expect(firstYear.reduce((sum, value) => sum + value, 0)).toBeCloseTo(capUsd, 6)

    // Month 12 opens a new calendar year, so the match starts again.
    expect(enhancer(12, bn(2000)).toNumber()).toBeCloseTo(400, 6)
  })

  it("does not bind for a contribution the cap comfortably covers", () => {
    const inputs = scenario({
      monthlyContributionUsd: 500,
      tryDepreciationPct: 0,
      tryInflationPct: 0,
    })
    const enhancer = besContributionEnhancer(inputs)
    let firstYearUsd = 0
    for (let month = 0; month < 12; month++) {
      firstYearUsd += enhancer(month, bn(500)).toNumber()
    }
    expect(firstYearUsd).toBeCloseTo(12 * 500 * 0.2, 6)
    expect(firstYearUsd).toBeLessThan(
      MAX_STATE_CONTRIBUTION_TRY_YEAR_ONE / ASSUMED_USD_TRY_SPOT_RATE,
    )
  })

  it("restarts its meter when the month index does not advance", () => {
    const inputs = scenario({ tryDepreciationPct: 0, tryInflationPct: 0 })
    const enhancer = besContributionEnhancer(inputs)
    for (let month = 0; month < 12; month++) enhancer(month, bn(3000))
    // A second projection run starts at month 0 again with a fresh cap.
    expect(enhancer(0, bn(3000)).toNumber()).toBeCloseTo(600, 6)
  })
})

describe("besPrincipalSplitUsd", () => {
  it("splits the money paid in between the participant and the state", () => {
    const inputs = scenario({
      monthlyContributionUsd: 500,
      tryDepreciationPct: 0,
      tryInflationPct: 0,
    })
    const split = besPrincipalSplitUsd(inputs, 24)
    expect(split.participantUsd.toNumber()).toBeCloseTo(12000, 6)
    expect(split.stateUsd.toNumber()).toBeCloseTo(2400, 6)
  })
})

describe("besVestedPct", () => {
  it("vests nothing before three years", () => {
    expect(besVestedPct(38, 2)).toBe(0)
  })

  it("walks the years-in-system tiers", () => {
    expect(besVestedPct(38, 3)).toBe(15)
    expect(besVestedPct(41, 5)).toBe(15)
    expect(besVestedPct(42, 6)).toBe(35)
    expect(besVestedPct(44, 9)).toBe(35)
  })

  it("vests 60% at ten years without a retirement right", () => {
    expect(besHasRetirementRight(45, 10)).toBe(false)
    expect(besVestedPct(45, 10)).toBe(60)
  })

  it("vests in full on the retirement right (age 56 + 10 years)", () => {
    expect(besHasRetirementRight(56, 10)).toBe(true)
    expect(besVestedPct(60, 25)).toBe(100)
  })

  it("needs both conditions — age alone is not a retirement right", () => {
    expect(besHasRetirementRight(60, 8)).toBe(false)
    expect(besVestedPct(60, 8)).toBe(35)
  })
})
