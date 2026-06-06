import { describe, it, expect } from "vitest"
import { computePeakInvestedUsd } from "@/lib/performance"
import { buy, sell, cashCredit } from "./test-fixtures"

/**
 * Peak net invested = running max of the (pairing-aware) net-invested ledger.
 * It is the denominator for the all-time Total P&L %, so withdrawing your own
 * money never changes the % (see docs/pnl-test-cases.md and the design spec
 * 2026-06-06-pnl-behaviour-corrections).
 */
describe("computePeakInvestedUsd", () => {
  it("equals the deployed amount for a pure hold", () => {
    const peak = computePeakInvestedUsd([buy(1, 100)], [])
    expect(peak.toNumber()).toBe(100)
  })

  it("is the high-water mark, not the shrunken balance after an unpaired sell (C6)", () => {
    // Buy 2 @ $100 (invested 200), sell 1 @ $150 with proceeds withdrawn → 50.
    const peak = computePeakInvestedUsd([buy(2, 100), sell(1, 150)], [])
    expect(peak.toNumber()).toBe(200)
  })

  it("ignores house-money negative balance after a full exit (C9)", () => {
    // Buy 1 @ $100, sell 1 @ $130 → ledger 100 → -30; peak stays 100.
    const peak = computePeakInvestedUsd([buy(1, 100), sell(1, 130)], [])
    expect(peak.toNumber()).toBe(100)
  })

  it("survives withdrawing the full principal", () => {
    // Buy 1 @ $100, later sell 0.5 @ $200 ($100 out) → ledger 100 → 0; peak 100.
    const peak = computePeakInvestedUsd([buy(1, 100), sell(0.5, 200)], [])
    expect(peak.toNumber()).toBe(100)
  })

  it("is identical whether sell proceeds are withdrawn or kept as cash (invariance)", () => {
    const unpaired = computePeakInvestedUsd([buy(2, 100), sell(1, 150)], [])
    // Paired: the sell is offset by a cash_credit so net invested never drops.
    const paired = computePeakInvestedUsd(
      [buy(2, 100), sell(1, 150), cashCredit(150)],
      [],
    )
    expect(unpaired.toNumber()).toBe(200)
    expect(paired.toNumber()).toBe(200)
  })

  it("is 0 when nothing was ever deployed", () => {
    expect(computePeakInvestedUsd([], []).toNumber()).toBe(0)
  })
})
