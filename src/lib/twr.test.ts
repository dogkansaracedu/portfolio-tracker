import { describe, it, expect } from "vitest"
import { computeMonthlyReturns } from "@/lib/performance"
import { snapshot } from "@/lib/pnl/test-fixtures"

describe("computeMonthlyReturns — unchanged after subPeriodReturn extraction", () => {
  it("returns +10% / +$100 for a flow-free 1000→1100 period", () => {
    const snaps = [
      snapshot("2026-01-01", [{ ticker: "BTC", value_usd: 1000 }]),
      snapshot("2026-02-01", [{ ticker: "BTC", value_usd: 1100 }]),
    ]
    const returns = computeMonthlyReturns(snaps, [], [])
    expect(returns).toHaveLength(1)
    expect(returns[0].returnPct).toBeCloseTo(10)
    expect(returns[0].returnUsd).toBeCloseTo(100)
    expect(returns[0].month).toBe("2026-02")
  })
})
