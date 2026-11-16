import { describe, expect, it } from "vitest"
import {
  baselinePrices,
  buildWidgetAssets,
  computeTodayChange,
  newestHeldUpdateMs,
  pickLatestTotal,
  quoteCurrency,
} from "../../../supabase/functions/_shared/widget.ts"

// Pure helpers behind the `widget-data` edge function. Lives in `src/` because
// Vitest only includes `src/**/*.test.ts` (same pattern as yahoo.test.ts).

const NOW = Date.parse("2026-11-16T11:32:00Z")
const minsAgo = (m: number) => new Date(NOW - m * 60_000).toISOString()

describe("computeTodayChange", () => {
  it("sums quantity × price move and divides by yesterday's value of the same holdings", () => {
    const r = computeTodayChange([
      { quantity: 2, nowTry: 110, prevTry: 100 }, // +20 on 200
      { quantity: 10, nowTry: 45, prevTry: 50 }, // −50 on 500
    ])
    expect(r.changeTry).toBeCloseTo(-30)
    expect(r.changePct).toBeCloseTo((-30 / 700) * 100)
  })

  it("leaves positions without a baseline out of both sums", () => {
    const r = computeTodayChange([
      { quantity: 1, nowTry: 120, prevTry: 100 },
      { quantity: 5, nowTry: 999, prevTry: null }, // bought today, no baseline
    ])
    expect(r.changeTry).toBeCloseTo(20)
    expect(r.changePct).toBeCloseTo(20)
  })

  it("is null when nothing has a baseline", () => {
    expect(computeTodayChange([{ quantity: 1, nowTry: 5, prevTry: null }])).toEqual({
      changeTry: null,
      changePct: null,
    })
    expect(computeTodayChange([])).toEqual({ changeTry: null, changePct: null })
  })
})

describe("baselinePrices", () => {
  it("takes TRY from value_try ÷ amount and USD from price_usd, first entry per ticker", () => {
    const m = baselinePrices({
      rates: { usd_try: 40 },
      by_asset: [
        { ticker: "THYAO", amount: 10, price_usd: 7.5, value_try: 3010 },
        { ticker: "THYAO", amount: 1, price_usd: 9, value_try: 999 }, // second platform
        { ticker: "BTC", amount: 0.5, price_usd: 90000, value_try: null },
        { ticker: "DEAD", amount: 1, price_usd: 0, value_try: 0 },
      ],
    })
    expect(m.get("THYAO")).toEqual({ usd: 7.5, try: 301 })
    expect(m.get("BTC")).toEqual({ usd: 90000, try: 3_600_000 })
    expect(m.has("DEAD")).toBe(false)
  })

  it("returns an empty map without a snapshot", () => {
    expect(baselinePrices(null).size).toBe(0)
  })
})

describe("quoteCurrency", () => {
  it("shows TRY natives in TRY and everything else in USD", () => {
    expect(quoteCurrency({ category: "stock_bist", ticker: "THYAO" })).toBe("TRY")
    expect(quoteCurrency({ category: "fund", ticker: "TP2" })).toBe("TRY")
    expect(quoteCurrency({ category: "gold", ticker: "XAU_GRAM" })).toBe("TRY")
    expect(quoteCurrency({ category: "gold", ticker: "PAXG" })).toBe("USD")
    expect(quoteCurrency({ category: "fiat", ticker: "TRY" })).toBe("TRY")
    expect(quoteCurrency({ category: "fiat", ticker: "EUR" })).toBe("USD")
    expect(quoteCurrency({ category: "crypto", ticker: "BTC" })).toBe("USD")
  })
})

describe("buildWidgetAssets", () => {
  const holdings = [
    { balance: 0.5, asset: { ticker: "BTC", price_id: "BTC-USD", name: "Bitcoin", category: "crypto" } },
    { balance: 0.25, asset: { ticker: "BTC", price_id: "BTC-USD", name: "Bitcoin", category: "crypto" } },
    { balance: 100, asset: { ticker: "THYAO", price_id: "THYAO.IS", name: "THY", category: "stock_bist" } },
    { balance: 3, asset: { ticker: "NEW", price_id: null, name: "No price", category: "stock_us" } },
  ]
  const prices = {
    "BTC-USD": { price_usd: 100_000, price_try: 4_000_000, updated_at: minsAgo(5) },
    "THYAO.IS": { price_usd: 7.5, price_try: 300, updated_at: minsAgo(45) },
  }
  const baseline = new Map([
    ["BTC", { usd: 95_000, try: 3_800_000 }],
    ["THYAO", { usd: 7.4, try: 310 }],
  ])

  it("merges platforms, prices in the shown currency, sorts by TRY value", () => {
    const { assets, positions } = buildWidgetAssets(holdings, prices, baseline, 40, NOW)
    expect(assets.map((a) => a.ticker)).toEqual(["BTC", "THYAO", "NEW"])

    const [btc, thyao, unpriced] = assets
    expect(btc.price).toBe(100_000)
    expect(btc.priceCurrency).toBe("USD")
    expect(btc.valueTry).toBeCloseTo(3_000_000)
    expect(btc.changePct).toBeCloseTo((5000 / 95_000) * 100)
    expect(btc.stale).toBe(false)

    expect(thyao.price).toBe(300)
    expect(thyao.priceCurrency).toBe("TRY")
    expect(thyao.changePct).toBeCloseTo((-10 / 310) * 100)
    expect(thyao.stale).toBe(true) // 45 min > 30 min

    expect(unpriced).toMatchObject({ price: null, changePct: null, valueTry: 0, stale: true })

    expect(computeTodayChange(positions).changeTry).toBeCloseTo(0.75 * 200_000 + 100 * -10)
  })
})

describe("newestHeldUpdateMs", () => {
  it("looks only at the prices of held assets", () => {
    const held = [{ balance: 1, asset: { ticker: "BTC", price_id: "BTC-USD", name: "B", category: "crypto" } }]
    const prices = {
      "BTC-USD": { price_usd: 1, price_try: 1, updated_at: minsAgo(40) },
      "ETH-USD": { price_usd: 1, price_try: 1, updated_at: minsAgo(1) }, // not held
    }
    expect(newestHeldUpdateMs(held, prices)).toBe(NOW - 40 * 60_000)
    expect(newestHeldUpdateMs([], prices)).toBe(0)
  })
})

describe("pickLatestTotal", () => {
  const intraday = { at: "2026-11-16T11:00:00Z", totalUsd: 1, totalTry: 40 }
  const daily = { at: "2026-11-16T07:10:00Z", totalUsd: 2, totalTry: 80 }
  it("prefers the newer snapshot and falls back to whichever exists", () => {
    expect(pickLatestTotal(intraday, daily)).toBe(intraday)
    expect(pickLatestTotal({ ...intraday, at: "2026-11-15T20:00:00Z" }, daily)).toBe(daily)
    expect(pickLatestTotal(null, daily)).toBe(daily)
    expect(pickLatestTotal(intraday, null)).toBe(intraday)
    expect(pickLatestTotal(null, null)).toBeNull()
  })
})
