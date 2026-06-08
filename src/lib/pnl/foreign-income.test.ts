import { describe, it, expect } from "vitest"
import {
  foreignDeclarableAssetIds,
  computeForeignIncomeTry,
} from "@/lib/pnl/foreign-income"
import { tx, rate } from "@/lib/pnl/test-fixtures"

const assets = [
  { id: "us", category: "stock_us", ticker: "AAPL", at_source_tax_rate: null },
  { id: "ppf", category: "fund", ticker: "TI1", at_source_tax_rate: 0.175 },
  { id: "bist", category: "stock_bist", ticker: "THYAO.IS", at_source_tax_rate: null },
  { id: "usdcash", category: "fiat", ticker: "USD", at_source_tax_rate: null },
]

describe("foreignDeclarableAssetIds", () => {
  it("includes foreign (non-TRY) assets with no at-source tax; excludes TRY + withheld", () => {
    const ids = foreignDeclarableAssetIds(assets)
    expect(ids.has("us")).toBe(true)
    expect(ids.has("usdcash")).toBe(true)
    expect(ids.has("ppf")).toBe(false) // withheld at source
    expect(ids.has("bist")).toBe(false) // TRY / domestic
  })
})

describe("computeForeignIncomeTry", () => {
  const rates = [rate("2026-03-10", { usd_try: 40 })]
  const declarable = foreignDeclarableAssetIds(assets)

  it("sums dividend + interest of declarable assets in TRY for the year", () => {
    const txs = [
      tx({ type: "dividend", asset_id: "us", total_cost: 100, price_currency: "USD", date: "2026-03-10" }), // $100 → ₺4000
      tx({ type: "interest", asset_id: "usdcash", total_cost: 50, price_currency: "USD", date: "2026-03-10" }), // $50 → ₺2000
      tx({ type: "interest", asset_id: "ppf", total_cost: 999, price_currency: "TRY", date: "2026-03-10" }), // excluded (withheld)
      tx({ type: "buy", asset_id: "us", total_cost: 5000, price_currency: "USD", date: "2026-03-10" }), // not income
    ]
    expect(computeForeignIncomeTry(txs, rates, 2026, declarable).toFixed(2)).toBe("6000.00")
  })

  it("excludes income from other calendar years", () => {
    const txs = [
      tx({ type: "dividend", asset_id: "us", total_cost: 100, price_currency: "USD", date: "2025-12-31" }),
    ]
    expect(computeForeignIncomeTry(txs, rates, 2026, declarable).toFixed(2)).toBe("0.00")
  })
})
