import { describe, it, expect } from "vitest"
import { computePortfolioPnL } from "@/lib/pnl/portfolio"
import { summarizePnLTotals } from "@/lib/pnl/totals"
import type { PortfolioPnL } from "@/lib/pnl/types"
import {
  buy,
  transferIn,
  interestCash,
  dividendCash,
  dividendUnits,
  holding,
  prices,
} from "./test-fixtures"

const pct = (p: PortfolioPnL) =>
  summarizePnLTotals({
    totalCurrentValueUsd: p.totalCurrentValueUsd,
    totalInvestedUsd: p.totalInvestedUsd,
    peakInvestedUsd: p.totalPeakInvestedUsd,
  }).totalPnlPct?.toNumber() ?? null

/** unrealized % of a single asset lot = its own-transaction return. */
const assetPct = (p: PortfolioPnL, assetId: string) =>
  p.assetPnLs.find((a) => a.assetId === assetId)?.unrealizedPnlPct.toNumber()

describe("dividend / interest is counted as P&L — confirming the model", () => {
  it("$5 cash interest on $100 held cash → +5%", () => {
    const p = computePortfolioPnL({
      holdings: [holding({ balance: 105, ticker: "USD", isCurrency: true })],
      prices: prices({ USD: 1 }),
      transactions: [transferIn(100, 1), interestCash(5)],
      rates: [],
      snapshots: [],
    })
    expect(p.totalIncomeUsd.toNumber()).toBe(5)
    expect(pct(p)).toBe(5)
  })

  it("$5 stock dividend (cash) on $100 of stock → +5%", () => {
    const p = computePortfolioPnL({
      holdings: [
        holding({ balance: 1, ticker: "AAA", assetId: "aaa" }),
        holding({ balance: 5, ticker: "USD", isCurrency: true, assetId: "usd" }),
      ],
      prices: prices({ AAA: 100, USD: 1 }), // stock flat at $100
      transactions: [
        buy(1, 100, { asset_id: "aaa" }),
        dividendCash(5, { asset_id: "usd", related_asset_id: "aaa" }),
      ],
      rates: [],
      snapshots: [],
    })
    expect(p.totalIncomeUsd.toNumber()).toBe(5)
    expect(pct(p)).toBe(5)
  })

  it("reinvested dividend, that lot $5→$6 = +20% on its own transaction; overall 5%→6%", () => {
    // $100 base (flat) + a $5 dividend reinvested as 1 unit @ $5, which rises to $6.
    const p = computePortfolioPnL({
      holdings: [
        holding({ balance: 1, ticker: "AAA", assetId: "aaa" }), // principal, flat
        holding({ balance: 1, ticker: "DIV", assetId: "div" }), // reinvested $5
      ],
      prices: prices({ AAA: 100, DIV: 6 }),
      transactions: [
        buy(1, 100, { asset_id: "aaa" }),
        dividendUnits(1, 5, { asset_id: "div" }), // income $5, lot cost $5
      ],
      rates: [],
      snapshots: [],
    })
    expect(p.totalIncomeUsd.toNumber()).toBe(5) // income locked in
    expect(assetPct(p, "div")).toBe(20) // +20% on the reinvested $5
    expect(p.totalUnrealizedPnlUsd.toNumber()).toBe(1) // the $1 it gained
    expect(pct(p)).toBe(6) // overall 5% → 6%  (>5%)
  })

  it("reinvested dividend, that lot $5→$4 = −20% (not −25%); overall 5%→4%", () => {
    const p = computePortfolioPnL({
      holdings: [
        holding({ balance: 1, ticker: "AAA", assetId: "aaa" }),
        holding({ balance: 1, ticker: "DIV", assetId: "div" }),
      ],
      prices: prices({ AAA: 100, DIV: 4 }),
      transactions: [
        buy(1, 100, { asset_id: "aaa" }),
        dividendUnits(1, 5, { asset_id: "div" }),
      ],
      rates: [],
      snapshots: [],
    })
    expect(p.totalIncomeUsd.toNumber()).toBe(5)
    expect(assetPct(p, "div")).toBe(-20) // −20%, since (4−5)/5
    expect(pct(p)).toBe(4) // overall 5% → 4%  (<5%)
  })

  it("DRIP into the SAME stock, whole position +20% → overall +26% (principal moves too)", () => {
    // buy 1@100, reinvest $5 as 0.05u@100, then the whole stock → $120.
    const p = computePortfolioPnL({
      holdings: [holding({ balance: 1.05, ticker: "AAA", assetId: "aaa" })],
      prices: prices({ AAA: 120 }),
      transactions: [
        buy(1, 100, { asset_id: "aaa" }),
        dividendUnits(0.05, 100, { asset_id: "aaa" }),
      ],
      rates: [],
      snapshots: [],
    })
    expect(p.totalIncomeUsd.toNumber()).toBe(5)
    expect(pct(p)).toBe(26) // income 5 + 20% on the whole $105-ish position
  })
})
