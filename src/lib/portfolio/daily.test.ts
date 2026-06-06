import { describe, it, expect } from "vitest"
import { buildDailyReturnLookups } from "@/lib/portfolio/grouping"
import { snapshot, buy } from "@/lib/pnl/test-fixtures"

/**
 * Daily-return baseline = the most recent snapshot dated BEFORE today (in the
 * home timezone), not `snapshots[length-2]`. Period transactions are bucketed
 * by their home-local calendar day so the boundary matches the snapshot's local
 * date. See the 2026-06-06 design spec §4.
 */
describe("buildDailyReturnLookups — baseline by date", () => {
  it("picks the most recent snapshot before today, even if today's isn't written yet", () => {
    const snaps = [
      snapshot("2026-06-04", [{ ticker: "BTC", value_usd: 90 }]),
      snapshot("2026-06-05", [{ ticker: "BTC", value_usd: 100 }]),
    ]
    const lk = buildDailyReturnLookups(snaps, [], [], "2026-06-06")
    expect(lk.available).toBe(true)
    expect(lk.prevValueByTicker.get("BTC")).toBe(100) // D-1, not D-2 (90)
  })

  it("uses yesterday when today's snapshot already exists", () => {
    const snaps = [
      snapshot("2026-06-05", [{ ticker: "BTC", value_usd: 100 }]),
      snapshot("2026-06-06", [{ ticker: "BTC", value_usd: 130 }]),
    ]
    const lk = buildDailyReturnLookups(snaps, [], [], "2026-06-06")
    expect(lk.prevValueByTicker.get("BTC")).toBe(100)
  })

  it("shows across a gap — most recent before today even if >1 day old", () => {
    const snaps = [snapshot("2026-06-03", [{ ticker: "BTC", value_usd: 100 }])]
    const lk = buildDailyReturnLookups(snaps, [], [], "2026-06-06")
    expect(lk.available).toBe(true)
    expect(lk.prevValueByTicker.get("BTC")).toBe(100)
  })

  it("is unavailable when no snapshot predates today", () => {
    const snaps = [snapshot("2026-06-06", [{ ticker: "BTC", value_usd: 100 }])]
    const lk = buildDailyReturnLookups(snaps, [], [], "2026-06-06")
    expect(lk.available).toBe(false)
  })
})

describe("buildDailyReturnLookups — home-local period bucketing", () => {
  // baseline = 2026-06-05 (most recent before today 2026-06-06)
  const snaps = [
    snapshot("2026-06-04", [{ ticker: "BTC", value_usd: 100 }]),
    snapshot("2026-06-05", [{ ticker: "BTC", value_usd: 100 }]),
  ]

  it("includes a late-evening UTC tx that is next-day in Istanbul", () => {
    // 21:00 UTC on 06-05 = 00:00 Istanbul 06-06 → after the baseline day.
    const tx = buy(1, 50, { asset_id: "btc", date: "2026-06-05 21:00:00+00" })
    const lk = buildDailyReturnLookups(snaps, [tx], [], "2026-06-06")
    expect(lk.investedByAsset.get("btc")).toBe(50)
  })

  it("excludes a tx that is the baseline day in Istanbul", () => {
    // 10:00 UTC on 06-05 = 13:00 Istanbul 06-05 → part of the baseline day.
    const tx = buy(1, 50, { asset_id: "btc", date: "2026-06-05 10:00:00+00" })
    const lk = buildDailyReturnLookups(snaps, [tx], [], "2026-06-06")
    expect(lk.investedByAsset.get("btc")).toBeUndefined()
  })
})
