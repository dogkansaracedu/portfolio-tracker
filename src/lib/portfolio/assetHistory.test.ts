import { describe, it, expect } from "vitest"
import {
  attachCostBasis,
  buildAssetHistory,
  filterHistoryByRange,
} from "./assetHistory"
import type { Snapshot, Transaction, TransactionType } from "@/types/database"

function snap(
  date: string,
  byAsset: Array<{
    ticker: string
    platform: string
    amount: number
    price_usd: number
    value_usd: number
    value_try: number
  }>,
): Snapshot {
  return {
    id: date,
    user_id: "u",
    snapshot_date: date,
    total_usd: 0,
    total_try: 0,
    created_at: date,
    breakdown: {
      rates: { usd_try: 40, eur_try: 43, gold_gram_try: 4000 },
      by_category: {},
      by_platform: {},
      by_tag: {},
      by_asset: byAsset.map((e) => ({ ...e, name: e.ticker })),
    },
  }
}

describe("buildAssetHistory", () => {
  it("sums a ticker's platform slices per date and keeps per-unit price", () => {
    const snapshots = [
      snap("2026-08-01", [
        { ticker: "THYAO", platform: "Midas", amount: 10, price_usd: 8, value_usd: 80, value_try: 3200 },
        { ticker: "THYAO", platform: "Ziraat", amount: 5, price_usd: 8, value_usd: 40, value_try: 1600 },
        { ticker: "BTC", platform: "Binance", amount: 1, price_usd: 100000, value_usd: 100000, value_try: 4000000 },
      ]),
    ]
    const points = buildAssetHistory(snapshots, "THYAO")
    expect(points).toHaveLength(1)
    expect(points[0]).toEqual({
      date: "2026-08-01",
      valueUsd: 120,
      valueTry: 4800,
      priceUsd: 8,
      amount: 15,
      usdTry: 40,
    })
  })

  it("skips snapshots that lack the ticker (no fabricated points) and sorts ascending", () => {
    const snapshots = [
      snap("2026-08-03", [
        { ticker: "THYAO", platform: "Midas", amount: 10, price_usd: 9, value_usd: 90, value_try: 3600 },
      ]),
      snap("2026-08-02", []),
      snap("2026-08-01", [
        { ticker: "THYAO", platform: "Midas", amount: 10, price_usd: 8, value_usd: 80, value_try: 3200 },
      ]),
    ]
    const points = buildAssetHistory(snapshots, "THYAO")
    expect(points.map((p) => p.date)).toEqual(["2026-08-01", "2026-08-03"])
  })
})

describe("filterHistoryByRange", () => {
  const day = (offset: number) => {
    const d = new Date()
    d.setDate(d.getDate() - offset)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate(),
    ).padStart(2, "0")}`
  }
  const point = (date: string) => ({
    date,
    valueUsd: 1,
    valueTry: 40,
    priceUsd: 1,
    amount: 1,
    usdTry: 40,
  })

  it("returns everything for ALL", () => {
    const points = [point(day(400)), point(day(0))]
    expect(filterHistoryByRange(points, "ALL")).toHaveLength(2)
  })

  it("keeps the latest pre-cutoff point as the start anchor for ≥1M ranges", () => {
    const points = [point(day(90)), point(day(45)), point(day(10)), point(day(0))]
    const filtered = filterHistoryByRange(points, "1M")
    // day(45) is the anchor just before the ~30-day cutoff; day(90) is dropped.
    expect(filtered.map((p) => p.date)).toEqual([
      day(45),
      day(10),
      day(0),
    ])
  })

  it("does not extend sub-week ranges back past the cutoff", () => {
    const points = [point(day(30)), point(day(0))]
    const filtered = filterHistoryByRange(points, "1W")
    expect(filtered.map((p) => p.date)).toEqual([day(0)])
  })
})

describe("attachCostBasis", () => {
  const tx = (
    id: string,
    type: TransactionType,
    date: string,
    amount: number,
    unitPrice: number,
    platformId = "p1",
  ): Transaction => ({
    id,
    user_id: "u",
    asset_id: "a1",
    platform_id: platformId,
    type,
    date: `${date}T12:00:00Z`,
    amount,
    unit_price: unitPrice,
    price_currency: "USD",
    total_cost: amount * unitPrice,
    fee: 0,
    fee_currency: null,
    related_asset_id: null,
    linked_tx_id: null,
    notes: null,
    created_at: date,
  })
  const point = (date: string) => ({
    date,
    valueUsd: 0,
    valueTry: 0,
    priceUsd: 0,
    amount: 0,
    usdTry: 40,
  })

  it("replays FIFO up to each point's date", () => {
    const txs = [
      tx("t1", "buy", "2026-08-01", 10, 10),
      tx("t2", "sell", "2026-08-03", 5, 20),
    ]
    const points = attachCostBasis(
      [point("2026-08-01"), point("2026-08-02"), point("2026-08-04")],
      txs,
      [],
    )
    // Buy 10 @ $10 → basis 100; the sell consumes 5 FIFO units → basis 50.
    expect(points.map((p) => p.costBasisUsd)).toEqual([100, 100, 50])
  })

  it("runs FIFO per platform, matching the engine's composite key", () => {
    const txs = [
      tx("t1", "buy", "2026-08-01", 10, 10, "p1"),
      tx("t2", "buy", "2026-08-01", 10, 30, "p2"),
      // Sells p2's own (expensive) lot — asset-level FIFO would wrongly
      // consume p1's cheaper lot first.
      tx("t3", "sell", "2026-08-02", 10, 30, "p2"),
    ]
    const points = attachCostBasis([point("2026-08-02")], txs, [])
    expect(points[0].costBasisUsd).toEqual(100)
  })
})
