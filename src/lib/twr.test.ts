import { describe, it, expect } from "vitest"
import { computeMonthlyReturns, computeTWRSeries } from "@/lib/performance"
import { snapshot, buy, sell } from "@/lib/pnl/test-fixtures"

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

describe("computeTWRSeries — geometric linking", () => {
  it("chains flow-free periods: +20% then −10% = +8%", () => {
    const snaps = [
      snapshot("2026-01-01", [{ ticker: "BTC", value_usd: 100 }]),
      snapshot("2026-01-02", [{ ticker: "BTC", value_usd: 120 }]),
      snapshot("2026-01-03", [{ ticker: "BTC", value_usd: 108 }]),
    ]
    const twr = computeTWRSeries(snaps, [], [])
    expect(twr.endPct).toBeCloseTo(8)
    expect(twr.points[0].cumulativePct).toBeCloseTo(0)
  })

  it("removes a mid-window deposit: flat prices → ~0%", () => {
    const snaps = [
      snapshot("2026-01-01", [{ ticker: "BTC", value_usd: 100 }]),
      snapshot("2026-01-08", [{ ticker: "BTC", value_usd: 150 }]),
    ]
    const txs = [buy(1, 50, { asset_id: "btc", date: "2026-01-05" })]
    const twr = computeTWRSeries(snaps, txs, [])
    expect(twr.endPct).toBeCloseTo(0)
  })

  it("value-weights within a period via the snapshot total: +18%", () => {
    const snaps = [
      snapshot("2026-01-01", [
        { ticker: "GOLD", value_usd: 5000 },
        { ticker: "STOCK", value_usd: 20000 },
      ]),
      snapshot("2026-01-02", [
        { ticker: "GOLD", value_usd: 7500 },
        { ticker: "STOCK", value_usd: 22000 },
      ]),
    ]
    const twr = computeTWRSeries(snaps, [], [])
    expect(twr.endPct).toBeCloseTo(18)
  })

  it("a withdrawal contributes no gain/loss; weights reset after it", () => {
    const snaps = [
      snapshot("2026-01-01", [
        { ticker: "GOLD", value_usd: 5000 },
        { ticker: "STOCK", value_usd: 20000 },
      ]),
      snapshot("2026-01-02", [
        { ticker: "GOLD", value_usd: 7500 },
        { ticker: "STOCK", value_usd: 22000 },
      ]),
      snapshot("2026-01-03", [
        { ticker: "GOLD", value_usd: 5000 },
        { ticker: "STOCK", value_usd: 5000 },
      ]),
      snapshot("2026-01-04", [
        { ticker: "GOLD", value_usd: 6000 },
        { ticker: "STOCK", value_usd: 5500 },
      ]),
    ]
    const txs = [sell(1, 19500, { date: "2026-01-03" })]
    const twr = computeTWRSeries(snaps, txs, [])
    expect(twr.endPct).toBeCloseTo(35.7, 1)
  })

  it("flags a window as approximate when a >1-day period contains a flow", () => {
    const weekly = [
      snapshot("2026-01-01", [{ ticker: "BTC", value_usd: 100 }]),
      snapshot("2026-01-08", [{ ticker: "BTC", value_usd: 160 }]),
    ]
    expect(
      computeTWRSeries(weekly, [buy(1, 50, { asset_id: "btc", date: "2026-01-05" })], [])
        .approximate,
    ).toBe(true)

    const daily = [
      snapshot("2026-01-01", [{ ticker: "BTC", value_usd: 100 }]),
      snapshot("2026-01-02", [{ ticker: "BTC", value_usd: 160 }]),
    ]
    expect(
      computeTWRSeries(daily, [buy(1, 50, { asset_id: "btc", date: "2026-01-02" })], [])
        .approximate,
    ).toBe(false)
  })
})
