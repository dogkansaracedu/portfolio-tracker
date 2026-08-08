import { describe, it, expect } from "vitest"
import { bn } from "@/lib/config"
import { computeTWRSeries } from "@/lib/performance"
import {
  computeLifetimeXirrPct,
  computeMWRSeries,
  computeWhatIfIndexMWRSeries,
  solveXirr,
} from "@/lib/mwr"
import { snapshot, buy, sell, cashCredit } from "@/lib/pnl/test-fixtures"
import type { BenchmarkPrice } from "@/types/database"

/** Benchmark close row (only date + close_usd are read). */
const close = (date: string, close_usd: number): BenchmarkPrice => ({
  ticker: "SPY",
  date,
  close_usd,
  updated_at: `${date}T00:00:00Z`,
})

describe("solveXirr — bracketed solver", () => {
  it("matches a spreadsheet XIRR: 10k + 5k in, 18k out a year later", () => {
    // Excel: XIRR({-10000,-5000,18000}, {2020-01-01,2020-07-01,2021-01-01})
    // = 0.2416264 on Excel's ACT/365. This engine uses ACT/365.25 (the app-wide
    // convention, see computeCAGR), which puts the same case at 0.2418104.
    const rate = solveXirr(
      [
        { date: "2020-01-01", amountUsd: bn(10000) },
        { date: "2020-07-01", amountUsd: bn(5000) },
      ],
      bn(18000),
      "2021-01-01",
    )
    expect(rate).not.toBeNull()
    expect(rate!.toNumber()).toBeCloseTo(0.24181045, 6)
  })

  it("resolves a short window whose rate annualizes past any linear bracket", () => {
    // +50% in one day ⇒ r ≈ 2e64/yr. The log-space bracket still finds it, and
    // the round trip back over the window is exactly +50%.
    const rate = solveXirr(
      [{ date: "2026-01-01", amountUsd: bn(1000) }],
      bn(1500),
      "2026-01-02",
    )
    expect(rate).not.toBeNull()
    const years = 1 / 365.25
    expect((Math.pow(1 + rate!.toNumber(), years) - 1) * 100).toBeCloseTo(50, 6)
  })

  it("returns null on degenerate inputs instead of a fabricated rate", () => {
    // No flows at all.
    expect(solveXirr([], bn(100), "2026-01-01")).toBeNull()
    // Zero-amount flows only.
    expect(
      solveXirr([{ date: "2026-01-01", amountUsd: bn(0) }], bn(0), "2026-06-01"),
    ).toBeNull()
    // Non-positive span.
    expect(
      solveXirr(
        [{ date: "2026-01-01", amountUsd: bn(1000) }],
        bn(1500),
        "2026-01-01",
      ),
    ).toBeNull()
    // No sign change in the bracket: money in, nothing left (total loss).
    expect(
      solveXirr(
        [{ date: "2026-01-01", amountUsd: bn(1000) }],
        bn(0),
        "2026-06-01",
      ),
    ).toBeNull()
  })
})

describe("computeMWRSeries — money-weighted vs time-weighted", () => {
  // The worked divergence case: $5,000 rides a +50% period, then $45,000 lands
  // and only catches the following +7%.
  const divergenceSnaps = [
    snapshot("2026-01-01", [{ ticker: "BTC", value_usd: 5000 }]),
    // 5,000 × 1.5 = 7,500, plus the 45,000 deposited that day.
    snapshot("2026-02-01", [{ ticker: "BTC", value_usd: 52500 }]),
    snapshot("2026-03-01", [{ ticker: "BTC", value_usd: 56175 }]), // +7%
  ]
  const divergenceTxs = [
    buy(1, 45000, { asset_id: "btc", date: "2026-02-01" }),
  ]

  it("diverges from TWR exactly as documented: +24.6% MWR vs +60.5% TWR", () => {
    const mwr = computeMWRSeries(divergenceSnaps, divergenceTxs, [])
    const twr = computeTWRSeries(divergenceSnaps, divergenceTxs, [])

    // TWR: 1.50 × 1.07 − 1 — the strategy's return, blind to the deposit.
    expect(twr.endPct).toBeCloseTo(60.5, 6)
    // MWR: the big money missed the +50%, so the investor's dollars earned far
    // less than the strategy did.
    expect(mwr.endPct).toBeCloseTo(24.5755, 3)
    expect(mwr.points.map((p) => p.date)).toEqual([
      "2026-01-01",
      "2026-02-01",
      "2026-03-01",
    ])
    expect(mwr.points[0].cumulativePct).toBe(0)
    // Mid-window the deposit lands on the point itself (no time at work yet),
    // so both measures agree at +50%.
    expect(mwr.points[1].cumulativePct).toBeCloseTo(50, 6)
    expect(twr.points[1].cumulativePct).toBeCloseTo(50, 6)
  })

  it("annualizes only once the window spans a year", () => {
    expect(
      computeMWRSeries(divergenceSnaps, divergenceTxs, []).annualizedEndPct,
    ).toBeNull()

    const longWindow = [
      snapshot("2025-01-01", [{ ticker: "BTC", value_usd: 10000 }]),
      snapshot("2026-02-01", [{ ticker: "BTC", value_usd: 13000 }]),
    ]
    const series = computeMWRSeries(longWindow, [], [])
    expect(series.endPct).toBeCloseTo(30, 6)
    expect(series.annualizedEndPct).not.toBeNull()
    expect(series.annualizedEndPct!).toBeCloseTo(27.3783, 3)
  })

  it("treats a flow dated on the window-start date as part of the opening value", () => {
    // The start snapshot already contains that day's $5,000 deposit; counting
    // it again as a window flow would halve the return.
    const snaps = [
      snapshot("2026-01-01", [{ ticker: "BTC", value_usd: 5000 }]),
      snapshot("2026-02-01", [{ ticker: "BTC", value_usd: 6000 }]),
    ]
    const txs = [buy(1, 5000, { asset_id: "btc", date: "2026-01-01" })]
    expect(computeMWRSeries(snaps, txs, []).endPct).toBeCloseTo(20, 6)
  })
})

describe("computeMWRSeries — deposit timing", () => {
  // Same $45,000, same two periods (one flat, one +50%), only the order of the
  // deposit and the good period changes.
  const beforeSnaps = [
    snapshot("2026-01-01", [{ ticker: "BTC", value_usd: 5000 }]),
    snapshot("2026-02-01", [{ ticker: "BTC", value_usd: 50000 }]), // deposit, flat
    snapshot("2026-03-01", [{ ticker: "BTC", value_usd: 75000 }]), // +50%
  ]
  const beforeTxs = [buy(1, 45000, { asset_id: "btc", date: "2026-02-01" })]

  const afterSnaps = [
    snapshot("2026-01-01", [{ ticker: "BTC", value_usd: 5000 }]),
    snapshot("2026-02-01", [{ ticker: "BTC", value_usd: 7500 }]), // +50%
    snapshot("2026-03-01", [{ ticker: "BTC", value_usd: 52500 }]), // deposit, flat
  ]
  const afterTxs = [buy(1, 45000, { asset_id: "btc", date: "2026-03-01" })]

  it("moves MWR while TWR stays put", () => {
    const twrBefore = computeTWRSeries(beforeSnaps, beforeTxs, []).endPct
    const twrAfter = computeTWRSeries(afterSnaps, afterTxs, []).endPct
    expect(twrBefore).toBeCloseTo(50, 6)
    expect(twrAfter).toBeCloseTo(50, 6)
    expect(twrBefore).toBeCloseTo(twrAfter, 10)

    const mwrBefore = computeMWRSeries(beforeSnaps, beforeTxs, []).endPct
    const mwrAfter = computeMWRSeries(afterSnaps, afterTxs, []).endPct
    // Deposit before the run: nearly all the capital caught the +50%.
    expect(mwrBefore).toBeCloseTo(112.6132, 3)
    // Deposit after it: the late money earned nothing.
    expect(mwrAfter).toBeCloseTo(50, 6)
    expect(mwrBefore).toBeGreaterThan(mwrAfter + 60)
  })
})

describe("computeMWRSeries — external vs internal flows", () => {
  const snaps = [
    snapshot("2026-01-01", [{ ticker: "BTC", value_usd: 1000 }]),
    snapshot("2026-01-02", [{ ticker: "BTC", value_usd: 1000 }]),
  ]

  it("counts a paired asset↔cash swap as zero flow (value never left)", () => {
    const txs = [
      sell(1, 500, { id: "sell-1", date: "2026-01-02" }),
      cashCredit(500, { linked_tx_id: "sell-1", date: "2026-01-02" }),
    ]
    expect(computeMWRSeries(snaps, txs, []).endPct).toBeCloseTo(0, 6)
  })

  it("but counts a lone sell (no cash leg) as capital leaving", () => {
    const txs = [sell(1, 500, { id: "sell-1", date: "2026-01-02" })]
    // 1,000 in, 500 taken out, 1,000 still on the table ⇒ +50%.
    expect(computeMWRSeries(snaps, txs, []).endPct).toBeCloseTo(50, 6)
  })
})

describe("computeMWRSeries — degenerate inputs", () => {
  it("returns an empty series for no snapshots", () => {
    expect(computeMWRSeries([], [], [])).toEqual({
      points: [],
      endPct: 0,
      annualizedEndPct: null,
    })
  })

  it("returns a single 0% point for one snapshot", () => {
    const series = computeMWRSeries(
      [snapshot("2026-01-01", [{ ticker: "BTC", value_usd: 1000 }])],
      [],
      [],
    )
    expect(series.points).toEqual([{ date: "2026-01-01", cumulativePct: 0 }])
    expect(series.endPct).toBe(0)
    expect(series.annualizedEndPct).toBeNull()
  })

  it("stays at 0% (never NaN) when every value is zero", () => {
    const series = computeMWRSeries(
      [
        snapshot("2026-01-01", [{ ticker: "BTC", value_usd: 0 }]),
        snapshot("2026-02-01", [{ ticker: "BTC", value_usd: 0 }]),
      ],
      [],
      [],
    )
    expect(series.points.every((p) => p.cumulativePct === 0)).toBe(true)
    expect(Number.isNaN(series.endPct)).toBe(false)
    expect(series.endPct).toBe(0)
  })

  it("carries the previous point forward when a point has no solution", () => {
    // Wiped out on the last point (terminal 0 ⇒ no sign change) — the series
    // holds the last solvable value rather than printing a fabricated 0.
    const series = computeMWRSeries(
      [
        snapshot("2026-01-01", [{ ticker: "BTC", value_usd: 1000 }]),
        snapshot("2026-02-01", [{ ticker: "BTC", value_usd: 1200 }]),
        snapshot("2026-03-01", [{ ticker: "BTC", value_usd: 0 }]),
      ],
      [],
      [],
    )
    expect(series.points[1].cumulativePct).toBeCloseTo(20, 6)
    expect(series.points[2].cumulativePct).toBeCloseTo(20, 6)
    expect(series.annualizedEndPct).toBeNull()
  })
})

describe("computeLifetimeXirrPct", () => {
  const txs = [
    buy(1, 10000, { asset_id: "btc", date: "2025-01-01" }),
    buy(1, 5000, { asset_id: "btc", date: "2025-07-01" }),
  ]

  it("annualizes the whole book from a zero opening value", () => {
    expect(computeLifetimeXirrPct(txs, [], 18000, "2026-01-15")).toBeCloseTo(
      23.0771,
      3,
    )
  })

  it("is null before the history spans a year", () => {
    expect(computeLifetimeXirrPct(txs, [], 18000, "2025-12-01")).toBeNull()
  })

  it("is null with no external flows, and when the solver finds nothing", () => {
    expect(computeLifetimeXirrPct([], [], 18000, "2026-01-15")).toBeNull()
    expect(computeLifetimeXirrPct(txs, [], 0, "2026-01-15")).toBeNull()
  })
})

describe("computeWhatIfIndexMWRSeries — same flows into the index", () => {
  // Index doubles-ish: 100 → 125 → 150.
  const benchmark = [
    close("2026-01-01", 100),
    close("2026-02-01", 125),
    close("2026-03-01", 150),
  ]
  const snaps = [
    snapshot("2026-01-01", [{ ticker: "BTC", value_usd: 5000 }]),
    snapshot("2026-02-01", [{ ticker: "BTC", value_usd: 52500 }]),
    snapshot("2026-03-01", [{ ticker: "BTC", value_usd: 56175 }]),
  ]

  it("buys units at each flow's close — hand-computable end value", () => {
    // $5,000 before the index has any close → first close 100 → 50 units.
    // $45,000 at the 2026-02-01 close of 125 → 360 units.
    // Synthetic values: 5,000 → 410×125 = 51,250 → 410×150 = 61,500.
    const txs = [
      buy(1, 5000, { asset_id: "btc", date: "2025-12-15" }),
      buy(1, 45000, { asset_id: "btc", date: "2026-02-01" }),
    ]
    const whatIf = computeWhatIfIndexMWRSeries(snaps, txs, [], benchmark)
    expect(whatIf.points.map((p) => p.date)).toEqual([
      "2026-01-01",
      "2026-02-01",
      "2026-03-01",
    ])
    expect(whatIf.points[0].cumulativePct).toBe(0)
    // XIRR of (5,000 opening, +45,000 on 02-01, 61,500 terminal on 03-01).
    expect(whatIf.endPct).toBeCloseTo(47.5449, 3)

    // Same flows, same dates: the index was the better home for this money.
    expect(whatIf.endPct).toBeGreaterThan(
      computeMWRSeries(snaps, txs, []).endPct,
    )
  })

  it("treats a flow before the first close as bought at the first close", () => {
    const early = [
      buy(1, 5000, { asset_id: "btc", date: "2025-12-15" }),
      buy(1, 45000, { asset_id: "btc", date: "2026-02-01" }),
    ]
    // Dated on the first close instead — same price, so an identical series.
    const onFirstClose = [
      buy(1, 5000, { asset_id: "btc", date: "2026-01-01" }),
      buy(1, 45000, { asset_id: "btc", date: "2026-02-01" }),
    ]
    expect(computeWhatIfIndexMWRSeries(snaps, early, [], benchmark)).toEqual(
      computeWhatIfIndexMWRSeries(snaps, onFirstClose, [], benchmark),
    )
  })

  it("ignores internal asset↔cash swaps, like the portfolio side does", () => {
    const txs = [
      buy(1, 5000, { asset_id: "btc", date: "2026-01-01" }),
      sell(1, 500, { id: "sell-1", date: "2026-02-01" }),
      cashCredit(500, { linked_tx_id: "sell-1", date: "2026-02-01" }),
    ]
    const swapped = computeWhatIfIndexMWRSeries(snaps, txs, [], benchmark)
    const flowsOnly = computeWhatIfIndexMWRSeries(
      snaps,
      [buy(1, 5000, { asset_id: "btc", date: "2026-01-01" })],
      [],
      benchmark,
    )
    expect(swapped.endPct).toBeCloseTo(flowsOnly.endPct, 10)
    // 50 units riding 100 → 150.
    expect(swapped.endPct).toBeCloseTo(50, 6)
  })

  it("degrades to a flat zero series with no benchmark data", () => {
    const whatIf = computeWhatIfIndexMWRSeries(
      snaps,
      [buy(1, 5000, { asset_id: "btc", date: "2026-01-01" })],
      [],
      [],
    )
    expect(whatIf.points).toEqual([
      { date: "2026-01-01", cumulativePct: 0 },
      { date: "2026-02-01", cumulativePct: 0 },
      { date: "2026-03-01", cumulativePct: 0 },
    ])
    expect(whatIf.endPct).toBe(0)
    expect(whatIf.annualizedEndPct).toBeNull()
  })

  it("returns an empty series for no snapshots", () => {
    expect(computeWhatIfIndexMWRSeries([], [], [], benchmark)).toEqual({
      points: [],
      endPct: 0,
      annualizedEndPct: null,
    })
  })
})
