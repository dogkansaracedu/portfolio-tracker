import { describe, it, expect } from "vitest"
import { resolveHeroPctDenom } from "@/lib/dashboard/heroPercent"

/**
 * The Dashboard hero's % denominator. Peak net invested in P&L mode and in the
 * value-mode lifetime fallback (ALL window / ~$0 start), so it shares the same
 * base as the headline Total P&L %. The normal value window divides by the
 * period's starting value. See the 2026-06-06 design spec.
 */
describe("resolveHeroPctDenom", () => {
  it("uses peak invested in P&L mode", () => {
    expect(
      resolveHeroPctDenom({
        viewMode: "pnl",
        timeRange: "1M",
        startUsd: 500,
        peakInvested: 200,
      }),
    ).toBe(200)
  })

  it("uses peak invested for the ALL window (value mode)", () => {
    expect(
      resolveHeroPctDenom({
        viewMode: "value",
        timeRange: "ALL",
        startUsd: 1000,
        peakInvested: 200,
      }),
    ).toBe(200)
  })

  it("uses peak invested when the period start value is ~0", () => {
    expect(
      resolveHeroPctDenom({
        viewMode: "value",
        timeRange: "1M",
        startUsd: 0.5,
        peakInvested: 200,
      }),
    ).toBe(200)
  })

  it("uses the starting value for a normal value window", () => {
    expect(
      resolveHeroPctDenom({
        viewMode: "value",
        timeRange: "1M",
        startUsd: 1000,
        peakInvested: 200,
      }),
    ).toBe(1000)
  })

  it("uses the absolute starting value (negative start)", () => {
    expect(
      resolveHeroPctDenom({
        viewMode: "value",
        timeRange: "1M",
        startUsd: -300,
        peakInvested: 200,
      }),
    ).toBe(300)
  })
})
