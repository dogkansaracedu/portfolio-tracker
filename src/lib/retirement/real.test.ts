import { describe, it, expect } from "vitest"
import { bn } from "@/lib/config"
import { toReal, usdRateFromTryRate } from "@/lib/retirement/real"

describe("toReal", () => {
  it("deflates a nominal amount to today's purchasing power", () => {
    // 100,000 ÷ 1.02^10.
    expect(toReal(bn(100000), 120, 2).toNumber()).toBeCloseTo(82034.829988, 4)
  })

  it("leaves today's money alone", () => {
    expect(toReal(bn(100000), 0, 2).toNumber()).toBe(100000)
  })

  it("is a no-op at zero inflation", () => {
    expect(toReal(bn(100000), 240, 0).toNumber()).toBe(100000)
  })
})

describe("usdRateFromTryRate", () => {
  it("converts a TRY return through the depreciation assumption", () => {
    // (1 + 0.40) ÷ (1 + 0.30) − 1 = 7.6923%.
    expect(usdRateFromTryRate(40, 30)).toBeCloseTo(7.6923076923, 8)
  })

  it("passes the rate through when the lira is assumed stable", () => {
    expect(usdRateFromTryRate(40, 0)).toBeCloseTo(40, 10)
  })

  it("goes negative when depreciation outruns the TRY return", () => {
    expect(usdRateFromTryRate(30, 40)).toBeCloseTo(-7.1428571429, 8)
  })

  it("passes the TRY rate through on a degenerate depreciation", () => {
    expect(usdRateFromTryRate(40, -100)).toBe(40)
  })
})
