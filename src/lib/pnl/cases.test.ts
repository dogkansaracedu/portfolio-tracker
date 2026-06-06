import { describe, it, expect } from "vitest"
import { computePortfolioPnL } from "@/lib/pnl/portfolio"
import { summarizePnLTotals } from "@/lib/pnl/totals"
import type { PortfolioPnL } from "@/lib/pnl/types"
import type { Transaction, PriceCache, ExchangeRate } from "@/types/database"
import type { HoldingWithDetails } from "@/lib/queries/holdings"
import {
  tx,
  buy,
  sell,
  transferIn,
  transferOut,
  interestCash,
  dividendCash,
  dividendUnits,
  holding,
  prices,
  rate,
} from "./test-fixtures"

/**
 * Case-by-case engine tests — the worked numbers from docs/pnl-test-cases.md,
 * run against the real engine (computePortfolioPnL), not a re-implementation.
 * Every case also checks the reconciliation invariant
 *   value − net invested == unrealized + realized + income   (±$0.01)
 * which the usePnL dev-assert mirrors in the app.
 */

function run(
  transactions: Transaction[],
  holdings: HoldingWithDetails[],
  priceMap: Record<string, PriceCache>,
  rates: ExchangeRate[] = [],
): PortfolioPnL {
  return computePortfolioPnL({
    holdings,
    prices: priceMap,
    transactions,
    rates,
    snapshots: [],
  })
}

/** Total P&L % over peak (what the headline shows). */
function pct(pnl: PortfolioPnL): number | null {
  const { totalPnlPct } = summarizePnLTotals({
    totalCurrentValueUsd: pnl.totalCurrentValueUsd,
    totalInvestedUsd: pnl.totalInvestedUsd,
    peakInvestedUsd: pnl.totalPeakInvestedUsd,
  })
  return totalPnlPct?.toNumber() ?? null
}

/** The reconciliation invariant must hold for every case. */
function expectReconciles(pnl: PortfolioPnL) {
  const moneyWeighted = pnl.totalCurrentValueUsd.minus(pnl.totalInvestedUsd)
  const decomposed = pnl.totalUnrealizedPnlUsd
    .plus(pnl.totalRealizedPnlUsd)
    .plus(pnl.totalIncomeUsd)
  expect(moneyWeighted.minus(decomposed).abs().toNumber()).toBeLessThanOrEqual(
    0.01,
  )
}

describe("P&L cases — unrealized & realized (USD)", () => {
  it("C1 — buy, price rises (pure unrealized)", () => {
    const pnl = run([buy(1, 100)], [holding({ balance: 1 })], prices({ ASSET: 120 }))
    expect(pnl.totalInvestedUsd.toNumber()).toBe(100)
    expect(pnl.totalPeakInvestedUsd.toNumber()).toBe(100)
    expect(pnl.totalCurrentValueUsd.toNumber()).toBe(120)
    expect(pnl.totalUnrealizedPnlUsd.toNumber()).toBe(20)
    expect(pnl.totalRealizedPnlUsd.toNumber()).toBe(0)
    expect(pnl.totalIncomeUsd.toNumber()).toBe(0)
    expect(pct(pnl)).toBe(20)
    expectReconciles(pnl)
  })

  it("C6 — sell (realized); % is over peak, not the shrunken balance", () => {
    const pnl = run(
      [buy(2, 100), sell(1, 150)],
      [holding({ balance: 1 })],
      prices({ ASSET: 150 }),
    )
    expect(pnl.totalInvestedUsd.toNumber()).toBe(50)
    expect(pnl.totalPeakInvestedUsd.toNumber()).toBe(200)
    expect(pnl.totalCurrentValueUsd.toNumber()).toBe(150)
    expect(pnl.totalUnrealizedPnlUsd.toNumber()).toBe(50)
    expect(pnl.totalRealizedPnlUsd.toNumber()).toBe(50)
    expect(pct(pnl)).toBe(50) // was +200% under |current invested|
    expectReconciles(pnl)
  })

  it("C9 — fully sold / house money (negative net invested)", () => {
    const pnl = run([buy(1, 100), sell(1, 130)], [], prices({ ASSET: 130 }))
    expect(pnl.totalInvestedUsd.toNumber()).toBe(-30)
    expect(pnl.totalPeakInvestedUsd.toNumber()).toBe(100)
    expect(pnl.totalCurrentValueUsd.toNumber()).toBe(0)
    expect(pnl.totalRealizedPnlUsd.toNumber()).toBe(30)
    expect(pct(pnl)).toBe(30) // was +100%
    expectReconciles(pnl)
  })

  it("withdraw the full principal — % stays put (peak base)", () => {
    const pnl = run(
      [buy(1, 100), sell(0.5, 200)],
      [holding({ balance: 0.5 })],
      prices({ ASSET: 200 }),
    )
    expect(pnl.totalInvestedUsd.toNumber()).toBe(0)
    expect(pnl.totalPeakInvestedUsd.toNumber()).toBe(100)
    expect(pnl.totalCurrentValueUsd.toNumber()).toBe(100)
    expect(pct(pnl)).toBe(100)
    expectReconciles(pnl)
  })

  it("loss then withdrawal — −50%, not −100%", () => {
    const pnl = run([buy(1, 100), sell(1, 50)], [], prices({ ASSET: 50 }))
    expect(pnl.totalRealizedPnlUsd.toNumber()).toBe(-50)
    expect(pnl.totalPeakInvestedUsd.toNumber()).toBe(100)
    expect(pct(pnl)).toBe(-50)
    expectReconciles(pnl)
  })

  it("FIFO ordering — oldest lot consumed first", () => {
    const pnl = run(
      [buy(1, 100), buy(1, 200), sell(1, 250)],
      [holding({ balance: 1 })],
      prices({ ASSET: 250 }),
    )
    expect(pnl.totalRealizedPnlUsd.toNumber()).toBe(150) // 250 − 100, not − avg(150)
    expect(pnl.totalUnrealizedPnlUsd.toNumber()).toBe(50) // remaining 200 lot
    expect(pnl.totalPeakInvestedUsd.toNumber()).toBe(300)
    expect(pct(pnl)).toBeCloseTo(66.67, 2)
    expectReconciles(pnl)
  })
})

describe("P&L cases — income (dividend / interest)", () => {
  it("C2 — interest as cash on a USD balance", () => {
    const pnl = run(
      [transferIn(100, 1), interestCash(5)],
      [holding({ balance: 105, ticker: "USD", isCurrency: true })],
      prices({ USD: 1 }),
    )
    expect(pnl.totalInvestedUsd.toNumber()).toBe(100) // income neutral
    expect(pnl.totalCurrentValueUsd.toNumber()).toBe(105)
    expect(pnl.totalIncomeUsd.toNumber()).toBe(5)
    expect(pnl.totalUnrealizedPnlUsd.toNumber()).toBe(0)
    expect(pct(pnl)).toBe(5)
    expectReconciles(pnl)
  })

  it("C4 — interest reinvested as units (same answer as cash)", () => {
    const pnl = run(
      [buy(1, 100), dividendUnits(0.05, 100)],
      [holding({ balance: 1.05 })],
      prices({ ASSET: 100 }),
    )
    expect(pnl.totalInvestedUsd.toNumber()).toBe(100)
    expect(pnl.totalCurrentValueUsd.toNumber()).toBe(105)
    expect(pnl.totalUnrealizedPnlUsd.toNumber()).toBe(0)
    expect(pnl.totalIncomeUsd.toNumber()).toBe(5)
    expect(pct(pnl)).toBe(5)
    expectReconciles(pnl)
  })

  it("C5 — dividend reinvested, then price rises (income + unrealized)", () => {
    const pnl = run(
      [buy(1, 100), dividendUnits(0.05, 100)],
      [holding({ balance: 1.05 })],
      prices({ ASSET: 120 }),
    )
    expect(pnl.totalCurrentValueUsd.toNumber()).toBe(126)
    expect(pnl.totalUnrealizedPnlUsd.toNumber()).toBe(21)
    expect(pnl.totalIncomeUsd.toNumber()).toBe(5)
    expect(pct(pnl)).toBe(26)
    expectReconciles(pnl)
  })

  it("income reinvested then fully sold at cost — counted once", () => {
    const pnl = run(
      [buy(1, 100), dividendUnits(0.05, 100), sell(1.05, 100)],
      [],
      prices({ ASSET: 100 }),
    )
    expect(pnl.totalRealizedPnlUsd.toNumber()).toBe(0)
    expect(pnl.totalIncomeUsd.toNumber()).toBe(5)
    expect(pnl.totalPeakInvestedUsd.toNumber()).toBe(100)
    expect(pct(pnl)).toBe(5)
    expectReconciles(pnl)
  })

  it("income then withdrawn — still +5%", () => {
    const pnl = run(
      [transferIn(100, 1), interestCash(5), transferOut(5, 1)],
      [holding({ balance: 100, ticker: "USD", isCurrency: true })],
      prices({ USD: 1 }),
    )
    expect(pnl.totalInvestedUsd.toNumber()).toBe(95)
    expect(pnl.totalPeakInvestedUsd.toNumber()).toBe(100)
    expect(pnl.totalCurrentValueUsd.toNumber()).toBe(100)
    expect(pnl.totalIncomeUsd.toNumber()).toBe(5)
    expect(pct(pnl)).toBe(5)
    expectReconciles(pnl)
  })

  it("income on a losing position — income doesn't hide the loss", () => {
    const pnl = run(
      [buy(1, 100, { asset_id: "stock" }), dividendCash(5, { asset_id: "usd", related_asset_id: "stock" })],
      [
        holding({ balance: 1, ticker: "STOCK", assetId: "stock" }),
        holding({ balance: 5, ticker: "USD", isCurrency: true, assetId: "usd" }),
      ],
      prices({ STOCK: 80, USD: 1 }),
    )
    expect(pnl.totalCurrentValueUsd.toNumber()).toBe(85)
    expect(pnl.totalUnrealizedPnlUsd.toNumber()).toBe(-20)
    expect(pnl.totalIncomeUsd.toNumber()).toBe(5)
    expect(pnl.totalInvestedUsd.toNumber()).toBe(100)
    expect(pct(pnl)).toBe(-15)
    expectReconciles(pnl)
  })
})

describe("P&L cases — fees", () => {
  it("fee on a buy is capitalized into cost basis (still held)", () => {
    const pnl = run(
      [buy(1, 100, { fee: 2, fee_currency: "USD" })],
      [holding({ balance: 1 })],
      prices({ ASSET: 120 }),
    )
    expect(pnl.totalInvestedUsd.toNumber()).toBe(102)
    expect(pnl.totalPeakInvestedUsd.toNumber()).toBe(102)
    expect(pnl.totalUnrealizedPnlUsd.toNumber()).toBe(18)
    expect(pct(pnl)).toBeCloseTo(17.65, 2)
    expectReconciles(pnl)
  })

  it("fee on a sell reduces proceeds → realized", () => {
    const pnl = run(
      [buy(1, 100), sell(1, 150, { fee: 3, fee_currency: "USD" })],
      [],
      prices({ ASSET: 150 }),
    )
    expect(pnl.totalRealizedPnlUsd.toNumber()).toBe(47)
    expect(pnl.totalInvestedUsd.toNumber()).toBe(-47)
    expect(pnl.totalPeakInvestedUsd.toNumber()).toBe(100)
    expect(pct(pnl)).toBe(47)
    expectReconciles(pnl)
  })
})

describe("P&L cases — currency / FX", () => {
  it("C7 — fiat FX is real P&L (EUR appreciating)", () => {
    const pnl = run(
      [transferIn(100, 1, { price_currency: "EUR", date: "2026-01-01" })],
      [holding({ balance: 100, ticker: "EUR", isCurrency: true })],
      prices({ EUR: 1.2 }),
      [rate("2026-01-01", { eur_usd: 1.1 })],
    )
    expect(pnl.totalInvestedUsd.toNumber()).toBeCloseTo(110, 6)
    expect(pnl.totalCurrentValueUsd.toNumber()).toBeCloseTo(120, 6)
    expect(pnl.totalUnrealizedPnlUsd.toNumber()).toBeCloseTo(10, 6)
    expect(pnl.totalIncomeUsd.toNumber()).toBe(0)
    expect(pct(pnl)).toBeCloseTo(9.09, 2)
    expectReconciles(pnl)
  })

  it("C8 — interest on a foreign balance (no double-count)", () => {
    const pnl = run(
      [
        transferIn(100, 1, { price_currency: "EUR", date: "2026-01-01" }),
        interestCash(5, { price_currency: "EUR", date: "2026-01-01" }),
      ],
      [holding({ balance: 105, ticker: "EUR", isCurrency: true })],
      prices({ EUR: 1.2 }),
      [rate("2026-01-01", { eur_usd: 1.1 })],
    )
    expect(pnl.totalInvestedUsd.toNumber()).toBeCloseTo(110, 6) // income neutral
    expect(pnl.totalCurrentValueUsd.toNumber()).toBeCloseTo(126, 6)
    expect(pnl.totalIncomeUsd.toNumber()).toBeCloseTo(5.5, 6)
    expect(pnl.totalUnrealizedPnlUsd.toNumber()).toBeCloseTo(10.5, 6) // FX only, not income
    expect(pnl.totalCurrentValueUsd.minus(pnl.totalInvestedUsd).toNumber()).toBeCloseTo(16, 6)
    expectReconciles(pnl)
  })

  it("asset priced in TRY — native currency + FX together (BIST)", () => {
    const pnl = run(
      [buy(10, 100, { price_currency: "TRY", date: "2026-01-01" })],
      [holding({ balance: 10, ticker: "THYAO" })],
      prices({ THYAO: 5 }), // ₺150 @ USD/TRY 30
      [rate("2026-01-01", { usd_try: 25 })],
    )
    expect(pnl.totalInvestedUsd.toNumber()).toBeCloseTo(40, 6) // ₺1000 / 25
    expect(pnl.totalCurrentValueUsd.toNumber()).toBeCloseTo(50, 6)
    expect(pnl.totalUnrealizedPnlUsd.toNumber()).toBeCloseTo(10, 6)
    expect(pct(pnl)).toBeCloseTo(25, 6)
    expectReconciles(pnl)
  })
})

describe("P&L cases — invariant & known gaps", () => {
  it("C10 — reconciliation holds across a realistic mix", () => {
    // buy 2@100, sell 1@150 (realized), reinvested dividend 0.05u@100 (income),
    // price → 120 (unrealized).
    const pnl = run(
      [buy(2, 100), sell(1, 150), dividendUnits(0.05, 100)],
      [holding({ balance: 1.05 })],
      prices({ ASSET: 120 }),
    )
    expect(pnl.totalUnrealizedPnlUsd.toNumber()).toBe(21)
    expect(pnl.totalRealizedPnlUsd.toNumber()).toBe(50)
    expect(pnl.totalIncomeUsd.toNumber()).toBe(5)
    expect(pnl.totalPeakInvestedUsd.toNumber()).toBe(200)
    expect(pct(pnl)).toBe(38) // 76 / 200
    expectReconciles(pnl)
  })

  // KNOWN-FAILING (it.fails passes while the bug exists, flips to a real
  // failure once fixed — a tripwire). A standalone `fee` tx double-counts:
  // balance.ts drops value by the fee AND performance.ts adds it to net
  // invested, so a $5 fee cuts total P&L by $10 and breaks reconciliation.
  // Zero occurrences today; documented here with the CORRECT expected numbers.
  // See docs/pnl-test-cases.md §5.8 / the 2026-06-06 design spec.
  it.fails("standalone fee should be a single −fee hit and reconcile", () => {
    const pnl = run(
      [transferIn(100, 1), tx({ type: "fee", amount: 5, unit_price: 1 })],
      [holding({ balance: 95, ticker: "USD", isCurrency: true })],
      prices({ USD: 1 }),
    )
    // Correct: a $5 fee is a $5 loss, counted once.
    expect(
      pnl.totalCurrentValueUsd.minus(pnl.totalInvestedUsd).toNumber(),
    ).toBe(-5)
    expectReconciles(pnl)
  })
})
