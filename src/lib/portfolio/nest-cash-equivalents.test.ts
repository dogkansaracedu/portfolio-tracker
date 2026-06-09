import { describe, it, expect } from "vitest"
import { nestCashEquivalentsUnderFiat } from "@/lib/portfolio/grouping"
import type { EnrichedAsset } from "@/hooks/usePortfolio"

/** Minimal fixture — nestCashEquivalentsUnderFiat only reads id/category/ticker
 *  (and assetNativeCurrency reads category/ticker), plus `children` on output. */
function asset(id: string, category: string, ticker: string): EnrichedAsset {
  return { id, category, ticker } as unknown as EnrichedAsset
}

describe("nestCashEquivalentsUnderFiat", () => {
  it("nests USDT/USDC under the USD fiat row; leaves other crypto top-level", () => {
    const usd = asset("usd", "fiat", "USD")
    const usdt = asset("usdt", "crypto", "USDT")
    const usdc = asset("usdc", "crypto", "USDC")
    const btc = asset("btc", "crypto", "BTC")

    const out = nestCashEquivalentsUnderFiat([usd, usdt, usdc, btc])

    const ids = out.map((a) => a.id)
    expect(ids).toContain("usd")
    expect(ids).toContain("btc") // ordinary crypto stays a top-level row
    expect(ids).not.toContain("usdt") // nested under USD, not top-level
    expect(ids).not.toContain("usdc")

    const usdRow = out.find((a) => a.id === "usd")!
    expect(usdRow.children?.map((c) => c.id)).toEqual(["usdt", "usdc"])
  })

  it("still nests funds under their fiat (regression)", () => {
    const tryRow = asset("try", "fiat", "TRY")
    const tp2 = asset("tp2", "fund", "TP2")

    const out = nestCashEquivalentsUnderFiat([tryRow, tp2])

    expect(out.map((a) => a.id)).toEqual(["try"])
    expect(out[0].children?.map((c) => c.id)).toEqual(["tp2"])
  })

  it("keeps a stablecoin top-level when there is no USD fiat row (orphan)", () => {
    const usdt = asset("usdt", "crypto", "USDT")
    const btc = asset("btc", "crypto", "BTC")

    const out = nestCashEquivalentsUnderFiat([usdt, btc])

    expect(out.map((a) => a.id).sort()).toEqual(["btc", "usdt"])
    expect(out.every((a) => !a.children)).toBe(true)
  })
})
