import { describe, it, expect } from "vitest"
import { computePortfolioPnL } from "@/lib/pnl/portfolio"
import type { PortfolioPnL } from "@/lib/pnl/types"
import type { Transaction, PriceCache, ExchangeRate } from "@/types/database"
import type { HoldingWithDetails } from "@/lib/queries/holdings"
import {
  tx,
  buy,
  sell,
  transferIn,
  transferOut,
  taxCash,
  interestCash,
  dividendCash,
  dividendUnits,
  cashCredit,
  cashDebit,
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
    expect(pnl.totalCurrentValueUsd.toNumber()).toBe(120)
    expect(pnl.totalUnrealizedPnlUsd.toNumber()).toBe(20)
    expect(pnl.totalRealizedPnlUsd.toNumber()).toBe(0)
    expect(pnl.totalIncomeUsd.toNumber()).toBe(0)
    expectReconciles(pnl)
  })

  it("C6 — sell (realized)", () => {
    const pnl = run(
      [buy(2, 100), sell(1, 150)],
      [holding({ balance: 1 })],
      prices({ ASSET: 150 }),
    )
    expect(pnl.totalInvestedUsd.toNumber()).toBe(50)
    expect(pnl.totalCurrentValueUsd.toNumber()).toBe(150)
    expect(pnl.totalUnrealizedPnlUsd.toNumber()).toBe(50)
    expect(pnl.totalRealizedPnlUsd.toNumber()).toBe(50)
    expectReconciles(pnl)
  })

  it("C9 — fully sold / house money (negative net invested)", () => {
    const pnl = run([buy(1, 100), sell(1, 130)], [], prices({ ASSET: 130 }))
    expect(pnl.totalInvestedUsd.toNumber()).toBe(-30)
    expect(pnl.totalCurrentValueUsd.toNumber()).toBe(0)
    expect(pnl.totalRealizedPnlUsd.toNumber()).toBe(30)
    expectReconciles(pnl)
  })

  it("withdraw the full principal — P&L $ stays put", () => {
    const pnl = run(
      [buy(1, 100), sell(0.5, 200)],
      [holding({ balance: 0.5 })],
      prices({ ASSET: 200 }),
    )
    expect(pnl.totalInvestedUsd.toNumber()).toBe(0)
    expect(pnl.totalCurrentValueUsd.toNumber()).toBe(100)
    expectReconciles(pnl)
  })

  it("loss then withdrawal — −50%, not −100%", () => {
    const pnl = run([buy(1, 100), sell(1, 50)], [], prices({ ASSET: 50 }))
    expect(pnl.totalRealizedPnlUsd.toNumber()).toBe(-50)
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
    expectReconciles(pnl)
  })

  it("income then withdrawn — still +5%", () => {
    const pnl = run(
      [transferIn(100, 1), interestCash(5), transferOut(5, 1)],
      [holding({ balance: 100, ticker: "USD", isCurrency: true })],
      prices({ USD: 1 }),
    )
    expect(pnl.totalInvestedUsd.toNumber()).toBe(95)
    expect(pnl.totalCurrentValueUsd.toNumber()).toBe(100)
    expect(pnl.totalIncomeUsd.toNumber()).toBe(5)
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
    expect(pnl.totalUnrealizedPnlUsd.toNumber()).toBe(18)
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
    expectReconciles(pnl)
  })
})

describe("P&L cases — taxes", () => {
  it("C23 — tax charged to cash: pure loss, never a flow", () => {
    const pnl = run(
      [
        transferIn(1000, 1, { date: "2026-01-01" }),
        taxCash(50, { date: "2026-01-31" }),
      ],
      [holding({ balance: 950, ticker: "USD", isCurrency: true })],
      prices({ USD: 1 }),
    )
    // Net invested untouched by the tax — the charge is a cost, not a
    // withdrawal — so the 50 lost surfaces entirely as P&L.
    expect(pnl.totalInvestedUsd.toNumber()).toBe(1000)
    expect(pnl.totalCurrentValueUsd.toNumber()).toBe(950)
    expect(pnl.totalUnrealizedPnlUsd.toNumber()).toBe(-50)
    expect(pnl.totalRealizedPnlUsd.toNumber()).toBe(0)
    expect(pnl.totalIncomeUsd.toNumber()).toBe(0)
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
    expectReconciles(pnl)
  })

  // KNOWN-FAILING (it.fails passes while the bug exists, flips to a real
  // failure once fixed — a tripwire). A standalone `fee` tx double-counts:
  // balance.ts drops value by the fee AND performance.ts adds it to net
  // invested, so a $5 fee cuts total P&L by $10 and breaks reconciliation.
  // Zero occurrences today; documented here with the CORRECT expected numbers.
  // See docs/pnl-test-cases.md Case 21.
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

describe("P&L cases — stablecoin-settled trades (USDT at the $1 peg)", () => {
  // Cash legs on a stablecoin holding: the debit consumes FIFO lots with no
  // realized P&L (docs/pnl-test-cases.md Case 24/25); the credit adds a $1 lot.
  const usdtBtc = (extra: Transaction[] = []) => [
    // Buy 1,000 USDT with external cash — $1,000 deployed.
    buy(1000, 1, { asset_id: "usdt", date: "2026-01-01" }),
    // Buy 0.01 BTC for $500, funded from the USDT holding.
    buy(0.01, 50000, { id: "btc-buy", asset_id: "btc", date: "2026-01-02" }),
    cashDebit(500, {
      asset_id: "usdt",
      linked_tx_id: "btc-buy",
      date: "2026-01-02",
    }),
    ...extra,
  ]

  it("C24 — buy funded from USDT: net invested unchanged at trade time", () => {
    const pnl = run(
      usdtBtc(),
      [
        holding({ balance: 500, assetId: "usdt", ticker: "USDT" }),
        holding({ balance: 0.01, assetId: "btc", ticker: "BTC" }),
      ],
      prices({ USDT: 1, BTC: 50000 }),
    )
    // The paired legs cancel: only the original $1,000 counts as deployed.
    expect(pnl.totalInvestedUsd.toNumber()).toBe(1000)
    expect(pnl.totalCurrentValueUsd.toNumber()).toBe(1000)
    expect(pnl.totalUnrealizedPnlUsd.toNumber()).toBe(0)
    // No realized P&L on the USDT spend (peg convention).
    expect(pnl.totalRealizedPnlUsd.toNumber()).toBe(0)
    expectReconciles(pnl)
  })

  it("C25 — round trip: sell BTC into USDT, realized stays on BTC only", () => {
    const pnl = run(
      usdtBtc([
        sell(0.01, 60000, {
          id: "btc-sell",
          asset_id: "btc",
          date: "2026-01-03",
        }),
        cashCredit(600, {
          asset_id: "usdt",
          linked_tx_id: "btc-sell",
          date: "2026-01-03",
        }),
      ]),
      [holding({ balance: 1100, assetId: "usdt", ticker: "USDT" })],
      prices({ USDT: 1, BTC: 60000 }),
    )
    expect(pnl.totalInvestedUsd.toNumber()).toBe(1000)
    expect(pnl.totalCurrentValueUsd.toNumber()).toBe(1100)
    // The $100 gain is realized on BTC; the USDT lots (500 remaining + 600
    // credited, all at $1) match the balance exactly → zero unrealized.
    expect(pnl.totalRealizedPnlUsd.toNumber()).toBe(100)
    expect(pnl.totalUnrealizedPnlUsd.toNumber()).toBe(0)
    expectReconciles(pnl)
  })

  it("C26 — a de-peg surfaces as unrealized P&L on the USDT holding", () => {
    const pnl = run(
      usdtBtc(),
      [
        holding({ balance: 500, assetId: "usdt", ticker: "USDT" }),
        holding({ balance: 0.01, assetId: "btc", ticker: "BTC" }),
      ],
      prices({ USDT: 0.98, BTC: 50000 }),
    )
    // Legs book at the $1 peg, but value follows the live price:
    // 500 × 0.98 = $490 against a $500 basis → −$10 unrealized.
    expect(pnl.totalCurrentValueUsd.toNumber()).toBeCloseTo(990, 6)
    expect(pnl.totalUnrealizedPnlUsd.toNumber()).toBeCloseTo(-10, 6)
    expectReconciles(pnl)
  })
})
