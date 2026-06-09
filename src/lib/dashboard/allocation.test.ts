import { describe, it, expect } from "vitest"
import { deriveAllocationSlices } from "@/lib/dashboard/allocation"
import type { Asset, SnapshotBreakdown } from "@/types/database"

type ByAsset = SnapshotBreakdown["by_asset"]

/** deriveAllocationSlices only reads category/ticker (via assetNativeCurrency /
 *  isStablecoin) and joins on ticker — a minimal cast is enough. */
function asset(category: string, ticker: string): Asset {
  return { category, ticker, name: ticker } as unknown as Asset
}

/** value_try = value_usd × 30 so we can assert the TRY column rolls up in
 *  parallel; the exact rate is irrelevant to the grouping. */
function entry(ticker: string, valueUsd: number): ByAsset[number] {
  return {
    ticker,
    name: ticker,
    platform: "P",
    amount: 1,
    price_usd: valueUsd,
    value_usd: valueUsd,
    value_try: valueUsd * 30,
  }
}

describe("deriveAllocationSlices", () => {
  const assets = [
    asset("fiat", "TRY"),
    asset("fiat", "USD"),
    asset("fiat", "EUR"),
    asset("fund", "TI1"), // PPF — TRY-native
    asset("crypto", "USDT"), // stablecoin
    asset("crypto", "USDC"), // stablecoin
    asset("crypto", "BTC"), // ordinary crypto
    asset("stock_us", "AAPL"),
  ]

  // Fiat = TRY 20 (10 cash + 10 PPF) + USD 10 + EUR 10 + USDT 5 + USDC 5 = 50
  // Crypto = BTC 4 (stablecoins excluded). US Stocks = AAPL 46. Total = 100.
  const byAsset: ByAsset = [
    entry("TRY", 10),
    entry("TI1", 10),
    entry("USD", 10),
    entry("EUR", 10),
    entry("USDT", 5),
    entry("USDC", 5),
    entry("BTC", 4),
    entry("AAPL", 46),
  ]

  it("rolls cash, PPF funds, and stablecoins into one fiat node, split by currency", () => {
    const slices = deriveAllocationSlices(byAsset, assets, 100)

    // Top level sorted by value: fiat 50 > stock_us 46 > crypto 4.
    expect(slices.map((s) => s.key)).toEqual(["fiat", "stock_us", "crypto"])
    // Funds and stablecoins are NOT standalone top-level slices.
    expect(slices.map((s) => s.key)).not.toContain("fund")
    expect(slices.map((s) => s.key)).not.toContain("USDT")
    expect(slices.map((s) => s.key)).not.toContain("USDC")

    const fiat = slices.find((s) => s.key === "fiat")!
    expect(fiat.valueUsd).toBe(50)
    expect(fiat.percentage).toBeCloseTo(50)

    // Children sorted by value desc; PPF merged into TRY; stablecoins distinct.
    expect(fiat.children!.map((c) => c.key)).toEqual([
      "TRY",
      "USD",
      "EUR",
      "USDT",
      "USDC",
    ])
    const tryChild = fiat.children!.find((c) => c.key === "TRY")!
    expect(tryChild.valueUsd).toBe(20) // 10 cash + 10 PPF
    expect(tryChild.valueTry).toBe(600) // rolls up in TRY too
    expect(tryChild.percentage).toBeCloseTo(20)

    // Children reconcile to the parent — header stays whole.
    const childSum = fiat.children!.reduce((s, c) => s + c.valueUsd, 0)
    expect(childSum).toBe(fiat.valueUsd)
  })

  it("excludes stablecoins from the crypto slice", () => {
    const slices = deriveAllocationSlices(byAsset, assets, 100)
    const crypto = slices.find((s) => s.key === "crypto")!
    expect(crypto.valueUsd).toBe(4) // BTC only — not 14
    expect(crypto.children).toBeUndefined() // only fiat nests
  })

  it("keeps an unknown ticker as its own top-level slice", () => {
    const slices = deriveAllocationSlices(
      [entry("AAPL", 50), entry("MYSTERY", 50)],
      [asset("stock_us", "AAPL")],
      100,
    )
    expect(slices.map((s) => s.key).sort()).toEqual(["MYSTERY", "stock_us"])
  })

  it("emits no fiat node when nothing is cash-equivalent", () => {
    const slices = deriveAllocationSlices(
      [entry("AAPL", 100)],
      [asset("stock_us", "AAPL")],
      100,
    )
    expect(slices).toHaveLength(1)
    expect(slices[0].key).toBe("stock_us")
    expect(slices[0].children).toBeUndefined()
  })
})
