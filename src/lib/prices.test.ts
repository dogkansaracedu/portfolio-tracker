import { describe, it, expect } from "vitest"
import { priceMapsEqual, ratesEqual } from "@/lib/prices"
import type { PriceCache, ExchangeRate } from "@/types/database"

// These two equality helpers back the price store's no-op-`setState` guard:
// the live poll re-reads the cache every few seconds, and without a value
// comparison every read replaced `prices`/`rates` with fresh object references,
// flickering the portfolio table each tick. They must return `true` only when
// nothing a consumer reads has actually changed.

function price(over: Partial<PriceCache> = {}): PriceCache {
  return {
    ticker: "BTC-USD",
    price_usd: 100,
    price_try: 3000,
    source: "yahoo",
    updated_at: "2026-06-15T10:00:00Z",
    ...over,
  }
}

function rate(over: Partial<ExchangeRate> = {}): ExchangeRate {
  return {
    date: "2026-06-15",
    source: "tcmb",
    usd_try: 32,
    eur_try: 35,
    eur_usd: 1.09,
    gold_gram_try: 2500,
    ...over,
  }
}

describe("priceMapsEqual", () => {
  it("is true for value-identical maps", () => {
    expect(priceMapsEqual({ a: price() }, { a: price() })).toBe(true)
  })

  it("is true for two empty maps", () => {
    expect(priceMapsEqual({}, {})).toBe(true)
  })

  it("ignores non-value fields (ticker/source) per key", () => {
    expect(
      priceMapsEqual(
        { a: price({ source: "yahoo", ticker: "X" }) },
        { a: price({ source: "manual", ticker: "Y" }) },
      ),
    ).toBe(true)
  })

  it("is false when a price moves", () => {
    expect(priceMapsEqual({ a: price() }, { a: price({ price_usd: 101 }) })).toBe(false)
    expect(priceMapsEqual({ a: price() }, { a: price({ price_try: 3001 }) })).toBe(false)
  })

  it("is false when updated_at advances", () => {
    expect(
      priceMapsEqual({ a: price() }, { a: price({ updated_at: "2026-06-15T10:00:30Z" }) }),
    ).toBe(false)
  })

  it("is false when keys differ", () => {
    expect(priceMapsEqual({ a: price() }, { a: price(), b: price() })).toBe(false)
    expect(priceMapsEqual({ a: price() }, { b: price() })).toBe(false)
  })
})

describe("ratesEqual", () => {
  it("is true for two nulls (same reference)", () => {
    expect(ratesEqual(null, null)).toBe(true)
  })

  it("is false when exactly one side is null", () => {
    expect(ratesEqual(null, rate())).toBe(false)
    expect(ratesEqual(rate(), null)).toBe(false)
  })

  it("is true for value-identical rows", () => {
    expect(ratesEqual(rate(), rate())).toBe(true)
  })

  it("is false when any rate field moves", () => {
    expect(ratesEqual(rate(), rate({ usd_try: 33 }))).toBe(false)
    expect(ratesEqual(rate(), rate({ gold_gram_try: 2501 }))).toBe(false)
    expect(ratesEqual(rate(), rate({ date: "2026-06-16" }))).toBe(false)
  })
})
