import { describe, expect, it } from "vitest"
import { filterCatalog, foldSearchText, watchItemFromAsset } from "@/lib/watchlist"

const asset = (
  id: string,
  ticker: string,
  name: string,
  is_active = true,
  is_currency = false,
) => ({ id, ticker, name, is_active, is_currency })

const catalog = [
  asset("1", "AAPL", "Apple Inc."),
  asset("2", "XAU_GRAM", "Gram Altın"),
  asset("3", "BTC", "Bitcoin"),
  asset("4", "THYAO", "Türk Hava Yolları"),
  asset("5", "OLD", "Retired", false),
  asset("6", "BTCUSDT", "Bitcoin pair"),
  asset("7", "TRY", "Turkish lira", true, true),
]

describe("foldSearchText", () => {
  it("folds case and Turkish letters", () => {
    expect(foldSearchText("Gram ALTIN")).toBe("gram altin")
    expect(foldSearchText("Türk Hava Yolları")).toBe("turk hava yollari")
    expect(foldSearchText("İŞÇĞÖ")).toBe("iscgo")
  })
})

describe("filterCatalog", () => {
  it("lists every active, unwatched asset for an empty query", () => {
    expect(filterCatalog(catalog, "  ", new Set(["1"])).map((a) => a.id)).toEqual([
      "2", "3", "4", "6",
    ])
  })
  it("matches ticker or name, ignoring case and Turkish letters", () => {
    expect(filterCatalog(catalog, "altin", new Set()).map((a) => a.id)).toEqual(["2"])
    expect(filterCatalog(catalog, "turk", new Set()).map((a) => a.id)).toEqual(["4"])
    expect(filterCatalog(catalog, "aapl", new Set()).map((a) => a.id)).toEqual(["1"])
  })
  it("ranks exact ticker, then prefix, then other matches", () => {
    expect(filterCatalog(catalog, "btc", new Set()).map((a) => a.id)).toEqual(["3", "6"])
    expect(filterCatalog(catalog, "bitcoin", new Set()).map((a) => a.id)).toEqual(["3", "6"])
  })
  it("never offers inactive, currency or already watched assets", () => {
    expect(filterCatalog(catalog, "old", new Set())).toEqual([])
    expect(filterCatalog(catalog, "try", new Set())).toEqual([])
    expect(filterCatalog(catalog, "btc", new Set(["3"])).map((a) => a.id)).toEqual(["6"])
  })
})

describe("watchItemFromAsset", () => {
  it("keys on price_id, falling back to ticker", () => {
    const base = { id: "x", name: "N", icon_url: null }
    expect(
      watchItemFromAsset({ ...base, ticker: "BTC", category: "crypto", price_id: "BTC-USD" }),
    ).toEqual({ ticker: "BTC", name: "N", price_id: "BTC-USD", currency: "USD" })
    expect(
      watchItemFromAsset({ ...base, ticker: "TP2", category: "fund", price_id: null }),
    ).toEqual({ ticker: "TP2", name: "N", price_id: "TP2", currency: "TRY" })
    expect(
      watchItemFromAsset({ ...base, ticker: "THYAO", category: "stock_bist", price_id: "THYAO.IS" })
        .currency,
    ).toBe("TRY")
  })
})
