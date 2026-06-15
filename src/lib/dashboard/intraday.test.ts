import { describe, it, expect } from "vitest"
import { buildIntradaySeries } from "./intraday"
import type { IntradaySnapshot } from "@/types/database"

function snap(captured_at: string, total_usd: number, total_try: number): IntradaySnapshot {
  return { id: captured_at, user_id: "u", captured_at, total_usd, total_try }
}

describe("buildIntradaySeries", () => {
  it("positions points by captured_at epoch ms and appends the live now point", () => {
    const intraday = [
      snap("2026-06-15T07:00:00Z", 1000, 34000),
      snap("2026-06-15T08:00:00Z", 1010, 34340),
    ]
    const nowMs = new Date("2026-06-15T08:30:00Z").getTime()
    const r = buildIntradaySeries({ intraday, nowUsd: 1020, nowTry: 34680, nowMs })

    expect(r.points).toHaveLength(3)
    expect(r.points[0].dateMs).toBe(new Date("2026-06-15T07:00:00Z").getTime())
    expect(r.points[2].dateMs).toBe(nowMs)
    expect(r.points[2].label).toBe("Şimdi")
    expect(r.points[2].valueUsd).toBe(1020)
  })

  it("computes twrPct as cumulative % change from the first point", () => {
    const intraday = [
      snap("2026-06-15T07:00:00Z", 1000, 34000),
      snap("2026-06-15T08:00:00Z", 1100, 37400),
    ]
    const nowMs = new Date("2026-06-15T08:00:00Z").getTime()
    const r = buildIntradaySeries({ intraday, nowUsd: 1100, nowTry: 37400, nowMs })

    expect(r.points[0].twrPct).toBeCloseTo(0, 6)
    // last historical point is +10% from start; now coincides so dedupes
    expect(r.points[r.points.length - 1].twrPct).toBeCloseTo(10, 6)
    expect(r.twrEnd).toBeCloseTo(10, 6)
    expect(r.deltaUsd).toBeCloseTo(100, 6)
    expect(r.deltaPct).toBeCloseTo(10, 6)
  })

  it("dedupes the now point when it coincides with the last captured point", () => {
    const intraday = [snap("2026-06-15T08:00:00Z", 1000, 34000)]
    const nowMs = new Date("2026-06-15T08:00:00Z").getTime()
    const r = buildIntradaySeries({ intraday, nowUsd: 1000, nowTry: 34000, nowMs })
    // one historical + now at same ms → collapse to a single labelled "Şimdi"
    expect(r.points).toHaveLength(1)
    expect(r.points[0].label).toBe("Şimdi")
  })

  it("returns just the now point when there is no intraday history", () => {
    const nowMs = new Date("2026-06-15T08:00:00Z").getTime()
    const r = buildIntradaySeries({ intraday: [], nowUsd: 500, nowTry: 17000, nowMs })
    expect(r.points).toHaveLength(1)
    expect(r.points[0].valueUsd).toBe(500)
    expect(r.twrEnd).toBe(0)
  })
})
