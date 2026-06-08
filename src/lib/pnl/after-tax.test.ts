import { describe, it, expect } from "vitest"
import { computePortfolioPnL } from "@/lib/pnl/portfolio"
import { buy, holding, pricesWithTry, rate, sell } from "@/lib/pnl/test-fixtures"

// PPF: buy 1000 units @ ₺1 (usd_try=25 → $40 cost). NAV doubles to ₺2/unit.
// Native gain = ₺2000 − ₺1000 = ₺1000. At 17.5% → ₺175 tax.
// In USD via the asset's own price pair (price_usd 0.08 / price_try 2):
//   taxAccrualUsd = 175 × 0.08 / 2 = $7.00.
// Gross unrealized is UNCHANGED: value $80 − cost $40 = $40.
const PPF_RATE = 0.175

describe("after-tax overlay for at-source-taxed assets (PPF)", () => {
  const txs = [
    buy(1000, 1, { price_currency: "TRY", date: "2026-01-01" }),
  ]
  const rates = [rate("2026-01-01", { usd_try: 25 })]
  const h = [
    holding({
      balance: 1000,
      ticker: "TI1",
      category: "fund",
      atSourceTaxRate: PPF_RATE,
    }),
  ]
  const prices = pricesWithTry({ TI1: { usd: 0.08, try: 2 } })

  it("accrues 17.5% of the positive native gain, in USD", () => {
    const r = computePortfolioPnL({
      holdings: h,
      prices,
      transactions: txs,
      rates,
      snapshots: [],
    })
    const asset = r.assetPnLs.find((a) => a.ticker === "TI1")!
    expect(asset.unrealizedPnlUsd.toFixed(2)).toBe("40.00") // gross unchanged
    expect(asset.taxAccrualUsd.toFixed(2)).toBe("7.00")
    expect(r.totalTaxAccrualUsd.toFixed(2)).toBe("7.00")
  })

  it("preserves the gross money-weighted invariant (overlay is additive)", () => {
    const r = computePortfolioPnL({
      holdings: h,
      prices,
      transactions: txs,
      rates,
      snapshots: [],
    })
    const moneyWeighted = r.totalCurrentValueUsd.minus(r.totalInvestedUsd)
    const decomposed = r.totalUnrealizedPnlUsd
      .plus(r.totalRealizedPnlUsd)
      .plus(r.totalIncomeUsd)
    expect(moneyWeighted.minus(decomposed).abs().lt(0.01)).toBe(true)
  })

  it("does not tax a loss (negative native gain → 0 accrual)", () => {
    const r = computePortfolioPnL({
      holdings: h,
      prices: pricesWithTry({ TI1: { usd: 0.02, try: 0.5 } }), // NAV fell to ₺0.5
      transactions: txs,
      rates,
      snapshots: [],
    })
    expect(r.totalTaxAccrualUsd.toFixed(2)).toBe("0.00")
  })

  it("no rate set → no accrual (ordinary asset unaffected)", () => {
    const r = computePortfolioPnL({
      holdings: [holding({ balance: 1000, ticker: "TI1", category: "fund" })],
      prices,
      transactions: txs,
      rates,
      snapshots: [],
    })
    expect(r.totalTaxAccrualUsd.toFixed(2)).toBe("0.00")
  })
})

describe("after-tax overlay — realized + held native gain (partial sell)", () => {
  // Buy 1000 @ ₺1 (usd_try 25). Sell 400 @ ₺2 → realized native gain ₺400.
  // Hold 600; NAV ₺2 → unrealized native gain ₺600. Total taxable native ₺1000.
  // Tax ₺1000 × 17.5% = ₺175 → USD via 0.08/2 = $7.00. (Without the realized
  // branch it would be only ₺600 × 17.5% = ₺105 → $4.20, so this case proves
  // the realized path actually fires.)
  it("taxes both held and realized positive native gains", () => {
    const txs = [
      buy(1000, 1, { price_currency: "TRY", date: "2026-01-01" }),
      sell(400, 2, { price_currency: "TRY", date: "2026-02-01" }),
    ]
    const rates = [
      rate("2026-01-01", { usd_try: 25 }),
      rate("2026-02-01", { usd_try: 25 }),
    ]
    const h = [
      holding({
        balance: 600,
        ticker: "TI1",
        category: "fund",
        atSourceTaxRate: 0.175,
      }),
    ]
    const prices = pricesWithTry({ TI1: { usd: 0.08, try: 2 } })
    const r = computePortfolioPnL({
      holdings: h,
      prices,
      transactions: txs,
      rates,
      snapshots: [],
    })
    const asset = r.assetPnLs.find((a) => a.ticker === "TI1")!
    expect(asset.taxAccrualUsd.toFixed(2)).toBe("7.00")
  })
})
