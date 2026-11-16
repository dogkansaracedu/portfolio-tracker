import { describe, expect, it } from "vitest"
import {
  displayTicker,
  goldGramMatch,
  isGoldQuery,
  isTefasCode,
  normalizeQuery,
  yahooCandidates,
  yahooCategory,
  yahooMatch,
} from "../../../supabase/functions/_shared/symbol-search.ts"

// Pure half of the watchlist symbol search (`resolve-tickers` with `{ query }`).

describe("normalizeQuery + gold aliases", () => {
  it("upper-cases without the Turkish locale so altın and altin both mean gram gold", () => {
    expect(normalizeQuery("  altın ")).toBe("ALTIN")
    expect(isGoldQuery(normalizeQuery("altın"))).toBe(true)
    expect(isGoldQuery(normalizeQuery("altin"))).toBe(true)
    expect(isGoldQuery(normalizeQuery("gram  altın"))).toBe(true)
    expect(isGoldQuery(normalizeQuery("AAPL"))).toBe(false)
  })

  it("maps gram gold to the FX step's TRY key", () => {
    expect(goldGramMatch(4200)).toMatchObject({
      price_id: "XAU_GRAM",
      price_source: "tcmb",
      category: "gold",
      currency: "TRY",
      price: 4200,
    })
  })
})

describe("yahooCandidates", () => {
  it("tries the US, BIST and crypto listings of a bare symbol", () => {
    expect(yahooCandidates("THYAO")).toEqual(["THYAO", "THYAO.IS", "THYAO-USD"])
  })

  it("adds the FX pair for six letters", () => {
    expect(yahooCandidates("USDTRY")).toEqual(["USDTRY", "USDTRY.IS", "USDTRY-USD", "USDTRY=X"])
  })

  it("takes an explicit Yahoo symbol as-is", () => {
    expect(yahooCandidates("THYAO.IS")).toEqual(["THYAO.IS"])
    expect(yahooCandidates("BTC-USD")).toEqual(["BTC-USD"])
  })

  it("tries nothing for free text", () => {
    expect(yahooCandidates("ALTIN GRAM")).toEqual([])
  })
})

describe("isTefasCode", () => {
  it("accepts three letters/digits only", () => {
    expect(isTefasCode("TP2")).toBe(true)
    expect(isTefasCode("AFT")).toBe(true)
    expect(isTefasCode("AAPL")).toBe(false)
  })
})

describe("yahooMatch", () => {
  const quote = (instrumentType: string, currency: string) => ({
    price: 10,
    currency,
    instrumentType,
    name: "N",
  })

  it("strips the provider suffix for display", () => {
    expect(displayTicker("THYAO.IS")).toBe("THYAO")
    expect(displayTicker("BTC-USD")).toBe("BTC")
    expect(displayTicker("USDTRY=X")).toBe("USDTRY")
    expect(displayTicker("AAPL")).toBe("AAPL")
  })

  it("takes category from the source's instrument type and currency", () => {
    expect(yahooCategory(quote("CRYPTOCURRENCY", "USD"))).toBe("crypto")
    expect(yahooCategory(quote("CURRENCY", "TRY"))).toBe("fiat")
    expect(yahooCategory(quote("EQUITY", "TRY"))).toBe("stock_bist")
    expect(yahooCategory(quote("EQUITY", "USD"))).toBe("stock_us")
  })

  it("shows TRY quotes in TRY and everything else in USD", () => {
    const fx = yahooMatch("USDTRY=X", quote("CURRENCY", "TRY"), { price_usd: 1, price_try: 41 })
    expect(fx).toMatchObject({ ticker: "USDTRY", price_id: "USDTRY=X", currency: "TRY", price: 41 })
    const eur = yahooMatch("ASML.AS", quote("EQUITY", "EUR"), { price_usd: 11, price_try: 450 })
    expect(eur).toMatchObject({ currency: "USD", price: 11 })
  })

  it("drops an unsupported currency", () => {
    expect(yahooMatch("VOD.L", quote("EQUITY", "GBp"), null)).toBeNull()
  })
})
