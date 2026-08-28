import { describe, it, expect } from "vitest"
import { summarizePnLTotals } from "@/lib/pnl/totals"
import { bn } from "@/lib/config"

/**
 * Total P&L $ is value − current net invested. Dollars only — the % companion
 * everywhere is the lifetime cumulative MWR (`lib/mwr.ts`); the peak-invested
 * % was removed 2026-08-28. See docs/pnl-test-cases.md.
 */
describe("summarizePnLTotals — canonical money-weighted dollars", () => {
  it("is value − net invested (C6)", () => {
    const { totalPnlUsd } = summarizePnLTotals({
      totalCurrentValueUsd: bn(150),
      totalInvestedUsd: bn(50),
    })
    expect(totalPnlUsd.toNumber()).toBe(100)
  })

  it("handles house money / negative current invested (C9)", () => {
    const { totalPnlUsd } = summarizePnLTotals({
      totalCurrentValueUsd: bn(0),
      totalInvestedUsd: bn(-30),
    })
    expect(totalPnlUsd.toNumber()).toBe(30)
  })
})
