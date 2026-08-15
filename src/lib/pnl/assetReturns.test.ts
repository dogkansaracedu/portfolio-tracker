import { describe, it, expect } from "vitest"
import { bn } from "@/lib/config"
import { computeAssetReturnRates } from "./assetReturns"
import type { Transaction, TransactionType } from "@/types/database"

const tx = (
  id: string,
  type: TransactionType,
  date: string,
  totalCost: number,
): Transaction => ({
  id,
  user_id: "u",
  asset_id: "a1",
  platform_id: "p1",
  type,
  date: `${date}T12:00:00Z`,
  amount: 1,
  unit_price: totalCost,
  price_currency: "USD",
  total_cost: totalCost,
  fee: 0,
  fee_currency: null,
  related_asset_id: null,
  linked_tx_id: null,
  notes: null,
  created_at: date,
})

describe("computeAssetReturnRates", () => {
  it("buy-and-hold: MWR cumulative equals the plain total %, annualized past 1y", () => {
    // $1,000 in on 2024-01-01, worth $1,200 two years later.
    const r = computeAssetReturnRates(
      [tx("t1", "buy", "2024-01-01", 1000)],
      [],
      bn(1200),
      "2026-01-01",
    )
    expect(r.totalPnlUsd.toNumber()).toBe(200)
    // Single flow → cumulative MWR equals the plain 20% total.
    expect(r.mwrCumulativePct?.toNumber()).toBeCloseTo(20, 5)
    // (1.2)^(1/2) − 1 ≈ 9.54%/yr, shown because the span exceeds a year.
    expect(r.mwrAnnualizedPct?.toNumber()).toBeCloseTo(9.54, 1)
  })

  it("partial exit: MWR credits dollar-time", () => {
    // In 1,000 (2024) — out 600 (2025) — worth 720 today (2026).
    // Net invested 400 → P&L 320.
    // XIRR: 1000x² − 600x − 720 = 0 → x = 1.2 → 20%/yr, cumulative ≈ +44%.
    const r = computeAssetReturnRates(
      [tx("t1", "buy", "2024-01-01", 1000), tx("t2", "sell", "2025-01-01", 600)],
      [],
      bn(720),
      "2026-01-01",
    )
    expect(r.totalPnlUsd.toNumber()).toBe(320)
    expect(r.mwrAnnualizedPct?.toNumber()).toBeCloseTo(20, 0)
    expect(r.mwrCumulativePct?.toNumber()).toBeCloseTo(44, 0)
  })

  it("young asset: cumulative MWR shown, %/yr gated off under a year", () => {
    const r = computeAssetReturnRates(
      [tx("t1", "buy", "2026-06-01", 1000)],
      [],
      bn(1100),
      "2026-08-15",
    )
    expect(r.mwrCumulativePct?.toNumber()).toBeCloseTo(10, 5)
    expect(r.mwrAnnualizedPct).toBeNull()
  })

  it("sold-out asset: lifetime figures from terminal value 0", () => {
    const r = computeAssetReturnRates(
      [tx("t1", "buy", "2024-01-01", 1000), tx("t2", "sell", "2025-01-01", 1200)],
      [],
      bn(0),
      "2026-01-01",
    )
    // 0 − (1000 − 1200) = +200.
    expect(r.totalPnlUsd.toNumber()).toBe(200)
    expect(r.mwrCumulativePct).not.toBeNull()
  })

  it("dividends are neutral to invested capital (income, not capital)", () => {
    const r = computeAssetReturnRates(
      [tx("t1", "buy", "2024-01-01", 1000), tx("t2", "dividend", "2025-01-01", 50)],
      [],
      bn(1000),
      "2026-01-01",
    )
    expect(r.totalPnlUsd.toNumber()).toBe(0)
  })

  it("nothing ever deployed → null percentages, never fabricated numbers", () => {
    const r = computeAssetReturnRates([], [], bn(0), "2026-01-01")
    expect(r.mwrCumulativePct).toBeNull()
    expect(r.mwrAnnualizedPct).toBeNull()
  })
})
