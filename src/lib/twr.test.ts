import { describe, it, expect } from "vitest"
import { computeMonthlyReturns, computeTWRSeries } from "@/lib/performance"
import { snapshot, buy, sell } from "@/lib/pnl/test-fixtures"

describe("computeMonthlyReturns — per-period money-weighted (XIRR) return", () => {
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

  it("solves a mid-period flow as XIRR, not as a Modified-Dietz weight", () => {
    // The consolidation case: one 10-day period, $1,000 opening, a $1,000 buy on
    // day 5, $3,000 at the close. Every earlier case in this file agrees between
    // the two formulas (flow-free, or the gain is exactly 0); this one does not,
    // so it pins the engine that actually ships.
    //
    // RETIRED Modified Dietz — linear time weight on the flow:
    //   w    = (10 − 5) / 10 = 0.5
    //   numer = 3,000 − 1,000 − 1,000            = 1,000
    //   denom = 1,000 + 1,000 × 0.5              = 1,500
    //   R     = 1,000 / 1,500                    = +66.666667%
    //
    // SHIPPED XIRR — the flow is discounted at its real date. With d the daily
    // discount factor (1+r)^(−1/365.25) and z = d^5:
    //   1,000 + 1,000·z − 3,000·z² = 0   ⇒   3z² − z − 1 = 0
    //   z = (1 + √13) / 6                         (the positive root)
    // The period return is the terminal multiple, i.e. z⁻²  − 1:
    //   z⁻² − 1 = 36 / (1 + √13)² − 1 = 36 / (14 + 2√13) − 1 = +69.722436%
    //
    // XIRR reads higher here because Dietz credits the late $1,000 with half the
    // period's exposure, inflating the capital base; discounting it at day 5 of
    // 10 charges it only the growth it actually rode.
    const snaps = [
      snapshot("2026-01-01", [{ ticker: "BTC", value_usd: 1000 }]),
      snapshot("2026-01-11", [{ ticker: "BTC", value_usd: 3000 }]),
    ]
    const txs = [buy(1, 1000, { asset_id: "btc", date: "2026-01-06" })]

    const expectedPct = (36 / (14 + 2 * Math.sqrt(13)) - 1) * 100
    expect(expectedPct).toBeCloseTo(69.722436, 6)

    const twr = computeTWRSeries(snaps, txs, [])
    expect(twr.endPct).toBeCloseTo(expectedPct, 6)
    // Unambiguously not the Dietz answer.
    expect(twr.endPct).not.toBeCloseTo(200 / 3, 2)

    // The same period through the monthly-returns consumer, and returnUsd keeps
    // its unchanged definition: vEnd − vStart − netFlow = 3,000 − 1,000 − 1,000.
    const [monthly] = computeMonthlyReturns(snaps, txs, [])
    expect(monthly.returnPct).toBeCloseTo(expectedPct, 6)
    expect(monthly.returnUsd).toBeCloseTo(1000)
  })

  it("chains a losing day without annualization blowing up the rate", () => {
    // A −10% day annualizes to r = −1 + 1.9e-17, which round-trips through
    // `1 + r` as a total wipeout. The engine de-annualizes in log space, so the
    // period reads exactly −10% and the chain lands on +8%.
    const snaps = [
      snapshot("2026-01-01", [{ ticker: "BTC", value_usd: 100 }]),
      snapshot("2026-01-02", [{ ticker: "BTC", value_usd: 90 }]),
    ]
    expect(computeTWRSeries(snaps, [], []).endPct).toBeCloseTo(-10, 9)
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
