import { describe, it, expect } from "vitest"
import { summarizePnLTotals } from "@/lib/pnl/totals"
import { bn } from "@/lib/config"

/**
 * Total P&L $ is value − current net invested (unchanged). The % is taken over
 * PEAK net invested, so withdrawals don't distort it. Renders "—" (null) only
 * when nothing was ever deployed. See the 2026-06-06 design spec.
 */
describe("summarizePnLTotals — % over peak invested", () => {
  it("takes the % over peak, not the shrunken current balance (C6)", () => {
    const { totalPnlUsd, totalPnlPct } = summarizePnLTotals({
      totalCurrentValueUsd: bn(150),
      totalInvestedUsd: bn(50),
      peakInvestedUsd: bn(200),
    })
    expect(totalPnlUsd.toNumber()).toBe(100)
    expect(totalPnlPct?.toNumber()).toBe(50)
  })

  it("uses peak for house money / negative current invested (C9)", () => {
    const { totalPnlUsd, totalPnlPct } = summarizePnLTotals({
      totalCurrentValueUsd: bn(0),
      totalInvestedUsd: bn(-30),
      peakInvestedUsd: bn(100),
    })
    expect(totalPnlUsd.toNumber()).toBe(30)
    expect(totalPnlPct?.toNumber()).toBe(30)
  })

  it("keeps the % when the full principal is withdrawn (current invested = 0)", () => {
    const { totalPnlPct } = summarizePnLTotals({
      totalCurrentValueUsd: bn(100),
      totalInvestedUsd: bn(0),
      peakInvestedUsd: bn(100),
    })
    expect(totalPnlPct?.toNumber()).toBe(100)
  })

  it("returns null % when nothing was ever deployed (peak = 0)", () => {
    const { totalPnlPct } = summarizePnLTotals({
      totalCurrentValueUsd: bn(0),
      totalInvestedUsd: bn(0),
      peakInvestedUsd: bn(0),
    })
    expect(totalPnlPct).toBeNull()
  })
})
