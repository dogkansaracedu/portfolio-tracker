import { describe, it, expect } from "vitest"
import { computeFuelEconomy, estimateMonthlyFuel } from "@/lib/vehicle"
import type { ExchangeRate, VehicleCostEntry } from "@/types/database"

// Consumption is only measurable between two full tanks. These cases pin that
// rule and its consequences — the first full tank is a baseline, the last one
// has not been burned yet, and a partial fill contributes litres without
// producing a reading of its own.

const RATES: ExchangeRate[] = [
  {
    date: "2026-01-01",
    source: "test",
    usd_try: 44.0,
    eur_try: null,
    eur_usd: null,
    gold_gram_try: null,
  },
]

let seq = 0

function fill(over: Partial<VehicleCostEntry> = {}): VehicleCostEntry {
  seq += 1
  return {
    id: `f${seq}`,
    user_id: "u1",
    vehicle_id: "v1",
    date: "2026-01-01",
    category: "fuel",
    amount: 3300,
    currency: "TRY",
    odometer: null,
    litres: 44,
    is_full_tank: true,
    note: null,
    created_at: "2026-01-01T00:00:00Z",
    item_ids: [],
    ...over,
  }
}

describe("computeFuelEconomy", () => {
  it("needs two full tanks before it will say anything", () => {
    const one = computeFuelEconomy(
      [fill({ date: "2026-01-01", odometer: 50000 })],
      RATES,
    )
    expect(one.average).toBeNull()
    expect(one.segments).toEqual([])
    // The litres are still counted — only the consumption reading is withheld.
    expect(one.totalLitres).toBe(44)
  })

  it("measures the segment between two full tanks", () => {
    const fills = [
      fill({ date: "2026-01-01", odometer: 50000, litres: 40 }),
      fill({ date: "2026-01-15", odometer: 50500, litres: 35 }),
    ]
    const economy = computeFuelEconomy(fills, RATES)
    expect(economy.segments).toHaveLength(1)
    // 35 L over 500 km = 7.0 L/100km. The OPENING fill's 40 L belong to the
    // previous segment and must not be counted here.
    expect(economy.segments[0].km).toBe(500)
    expect(economy.segments[0].litres).toBe(35)
    expect(economy.average).toBeCloseTo(7, 6)
  })

  it("folds a partial fill into the segment without ending it", () => {
    const fills = [
      fill({ date: "2026-01-01", odometer: 50000, litres: 40 }),
      fill({
        date: "2026-01-10",
        odometer: 50300,
        litres: 20,
        is_full_tank: false,
      }),
      fill({ date: "2026-01-20", odometer: 50800, litres: 36 }),
    ]
    const economy = computeFuelEconomy(fills, RATES)
    // One segment, 50,000 → 50,800, carrying the 20 L partial plus the 36 L
    // that closed the tank = 56 L over 800 km = 7.0 L/100km.
    expect(economy.segments).toHaveLength(1)
    expect(economy.segments[0].km).toBe(800)
    expect(economy.segments[0].litres).toBe(56)
    expect(economy.average).toBeCloseTo(7, 6)
  })

  it("weights the average by distance, not by segment", () => {
    const fills = [
      fill({ date: "2026-01-01", odometer: 50000, litres: 40 }),
      // 60 L / 1000 km = 6.0
      fill({ date: "2026-01-10", odometer: 51000, litres: 60 }),
      // 10 L / 100 km = 10.0
      fill({ date: "2026-01-20", odometer: 51100, litres: 10 }),
    ]
    const economy = computeFuelEconomy(fills, RATES)
    expect(economy.segments).toHaveLength(2)
    // Distance-weighted: 70 L over 1100 km = 6.36, NOT the (6+10)/2 = 8 a mean
    // of the segment figures would give.
    expect(economy.average).toBeCloseTo((70 / 1100) * 100, 6)
    expect(economy.best?.consumption).toBeCloseTo(6, 6)
    expect(economy.worst?.consumption).toBeCloseTo(10, 6)
  })

  it("withholds a reading when a fill inside the segment has no litres", () => {
    const fills = [
      fill({ date: "2026-01-01", odometer: 50000, litres: 40 }),
      fill({
        date: "2026-01-10",
        odometer: 50300,
        litres: null,
        is_full_tank: false,
      }),
      fill({ date: "2026-01-20", odometer: 50800, litres: 36 }),
    ]
    const economy = computeFuelEconomy(fills, RATES)
    // The segment's fuel total is unknowable, so it is skipped rather than
    // under-reported — 36 L over 800 km would claim an impossible 4.5 L/100km.
    expect(economy.segments).toEqual([])
    expect(economy.average).toBeNull()
  })

  it("breaks the chain on a full tank with no odometer reading", () => {
    const fills = [
      fill({ date: "2026-01-01", odometer: 50000, litres: 40 }),
      fill({ date: "2026-01-10", odometer: null, litres: 30 }),
      fill({ date: "2026-01-20", odometer: 50900, litres: 36 }),
    ]
    const economy = computeFuelEconomy(fills, RATES)
    // Neither the 50,000 nor the 50,900 fill can pair with an unknown point.
    expect(economy.segments).toEqual([])
  })

  it("does not report a best and worst when only one segment exists", () => {
    const fills = [
      fill({ date: "2026-01-01", odometer: 50000, litres: 40 }),
      fill({ date: "2026-01-15", odometer: 50500, litres: 35 }),
    ]
    const economy = computeFuelEconomy(fills, RATES)
    expect(economy.best).not.toBeNull()
    // One segment is the average; calling it "worst" as well says nothing.
    expect(economy.worst).toBeNull()
  })

  it("orders two fills on the same day by odometer", () => {
    const fills = [
      fill({ date: "2026-01-01", odometer: 50500, litres: 35 }),
      fill({ date: "2026-01-01", odometer: 50000, litres: 40 }),
    ]
    const economy = computeFuelEconomy(fills, RATES)
    expect(economy.segments).toHaveLength(1)
    expect(economy.segments[0].fromKm).toBe(50000)
    expect(economy.segments[0].litres).toBe(35)
  })

  it("prices the fuel at each fill's own date", () => {
    const fills = [
      fill({ date: "2026-01-01", odometer: 50000, litres: 40, amount: 2974 }),
      fill({ date: "2026-01-15", odometer: 50500, litres: 35, amount: 2602 }),
    ]
    const economy = computeFuelEconomy(fills, RATES)
    expect(economy.totalLitres).toBe(75)
    // (2974 + 2602) / 44 = $126.73 over 75 L.
    expect(economy.totalFuelUsd).toBeCloseTo(5576 / 44, 4)
    expect(economy.avgPricePerLitreUsd).toBeCloseTo(5576 / 44 / 75, 6)
  })

  it("ignores non-fuel rows entirely", () => {
    const rows = [
      fill({ date: "2026-01-01", odometer: 50000, litres: 40 }),
      fill({
        date: "2026-01-10",
        category: "maintenance",
        litres: null,
        is_full_tank: false,
        amount: 8800,
      }),
      fill({ date: "2026-01-15", odometer: 50500, litres: 35 }),
    ]
    const economy = computeFuelEconomy(rows, RATES)
    expect(economy.average).toBeCloseTo(7, 6)
    expect(economy.totalFuelUsd).toBeCloseTo((3300 + 3300) / 44, 4)
  })

  it("has no price per litre with no litres logged", () => {
    const economy = computeFuelEconomy(
      [fill({ litres: null, odometer: 50000 })],
      RATES,
    )
    expect(economy.avgPricePerLitreUsd).toBeNull()
    expect(economy.latestPricePerLitreUsd).toBeNull()
  })

  // Straight off the back-filled book: a run of monthly rows whose price
  // climbs the whole way. The lifetime average is a fact about the history and
  // the last fill is a fact about now, and in lira those are far enough apart
  // that using one for the other is a real error, not a rounding one.
  it("separates the lifetime average from the latest fill's price", () => {
    const economy = computeFuelEconomy(
      [
        fill({ date: "2026-01-01", litres: 100, amount: 4400, odometer: null }),
        fill({ date: "2026-01-01", litres: 100, amount: 8800, odometer: null }),
      ],
      RATES,
    )
    // 13,200 TRY over 200 L at 44/USD → $1.50/L across the history…
    expect(economy.avgPricePerLitreUsd).toBeCloseTo(13200 / 44 / 200, 6)
    // …but the pump last charged $2.00/L, which is what a month will cost.
    expect(economy.latestPricePerLitreUsd).toBeCloseTo(8800 / 44 / 100, 6)
  })

  it("takes the latest price from one fill, never across two", () => {
    // The newest row priced nothing, so the newest PRICE is the older row's.
    // Dividing the new row's absent amount by its litres would read as free
    // fuel; pairing it with the previous row's amount would invent a price.
    const economy = computeFuelEconomy(
      [
        fill({ date: "2026-01-01", litres: 50, amount: 4400, odometer: null }),
        fill({ date: "2026-01-15", litres: 50, amount: null, odometer: null }),
      ],
      RATES,
    )
    expect(economy.latestPricePerLitreUsd).toBeCloseTo(4400 / 44 / 50, 6)
  })
})

// The monthly estimate multiplies three figures, two of which may be a
// measurement or a fallback. What matters is which one it reached for and
// whether it says so — so these cases pin the precedence and the flags, and
// the arithmetic once, by hand.
//
// The figures are literals rather than the real ASSUMED_CONSUMPTION and
// DEFAULT_FUEL_PRICE: the pump price constant is expected to be edited as it
// goes stale, and a hand-checked expectation must not move with it.

/** The owner's own observed pace, the case the card actually shows. */
const KM_PER_DAY = 47.6
/** ~81 TRY/L at ~48 TRY/USD — the shape of the real default, pinned here. */
const PRICE_USD = 1.69

function estimateArgs(
  over: Partial<Parameters<typeof estimateMonthlyFuel>[0]> = {},
): Parameters<typeof estimateMonthlyFuel>[0] {
  return {
    kmPerDay: KM_PER_DAY,
    measuredConsumption: null,
    assumedConsumption: 6.0,
    measuredPricePerLitreUsd: null,
    defaultPricePerLitreUsd: PRICE_USD,
    ...over,
  }
}

describe("estimateMonthlyFuel", () => {
  it("will not invent a distance it has never observed", () => {
    // One odometer reading gives no pace, and a "typical" mileage would be a
    // figure about somebody else's car. Nothing to price, so nothing shown.
    expect(estimateMonthlyFuel(estimateArgs({ kmPerDay: null }))).toBeNull()
  })

  it("costs the month by hand at the owner's own pace", () => {
    const estimate = estimateMonthlyFuel(estimateArgs())
    // 47.6 km/day × 30.4375 days = 1448.825 km; at 6.0 L/100km that is
    // 86.9295 L; at $1.69/L that is $146.910855.
    expect(estimate?.km).toBeCloseTo(1448.825, 6)
    expect(estimate?.litres).toBeCloseTo(86.9295, 6)
    expect(estimate?.costUsd).toBeCloseTo(146.910855, 6)
  })

  it("counts a month as 365.25/12 days, not 30", () => {
    const estimate = estimateMonthlyFuel(estimateArgs({ kmPerDay: 1 }))
    // The same basis the fixed-cost-per-month figure uses; a flat 30 would
    // make the two numbers on one card disagree about what a month is.
    expect(estimate?.km).toBeCloseTo(365.25 / 12, 10)
    expect(estimate?.km).not.toBeCloseTo(30, 3)
  })

  it("prefers a measured consumption over the assumed one", () => {
    const estimate = estimateMonthlyFuel(
      estimateArgs({ measuredConsumption: 7.5, assumedConsumption: 6.0 }),
    )
    expect(estimate?.consumption).toBe(7.5)
    expect(estimate?.consumptionMeasured).toBe(true)
    // And the litres follow the figure used, not the fallback: 1448.825 km at
    // 7.5 L/100km = 108.661875 L.
    expect(estimate?.litres).toBeCloseTo(108.661875, 6)
  })

  it("prefers the owner's own price over the default", () => {
    const estimate = estimateMonthlyFuel(
      estimateArgs({
        measuredPricePerLitreUsd: 1.5,
        defaultPricePerLitreUsd: PRICE_USD,
      }),
    )
    expect(estimate?.pricePerLitreUsd).toBe(1.5)
    expect(estimate?.priceMeasured).toBe(true)
    // 86.9295 L × $1.50 = $130.39425.
    expect(estimate?.costUsd).toBeCloseTo(130.39425, 6)
  })

  it("takes a measured price with an assumed consumption", () => {
    // The normal state of the data, not an edge: a fill that recorded litres
    // and an amount gives a real price straight away, while consumption waits
    // for two fills to close a full tank. The two resolve independently, so
    // one flag is true while the other is false.
    const estimate = estimateMonthlyFuel(
      estimateArgs({
        measuredConsumption: null,
        measuredPricePerLitreUsd: 1.8,
      }),
    )
    expect(estimate?.consumption).toBe(6.0)
    expect(estimate?.consumptionMeasured).toBe(false)
    expect(estimate?.pricePerLitreUsd).toBe(1.8)
    expect(estimate?.priceMeasured).toBe(true)
  })

  it("says nothing rather than report free motoring", () => {
    // A zero L/100km would price a month of driving at nothing, and a
    // negative one is not a consumption figure at all.
    expect(
      estimateMonthlyFuel(estimateArgs({ measuredConsumption: 0 })),
    ).toBeNull()
    expect(
      estimateMonthlyFuel(estimateArgs({ assumedConsumption: 0 })),
    ).toBeNull()
    expect(
      estimateMonthlyFuel(estimateArgs({ measuredConsumption: -6 })),
    ).toBeNull()
  })

  it("says nothing rather than price litres at zero or below", () => {
    expect(
      estimateMonthlyFuel(estimateArgs({ measuredPricePerLitreUsd: 0 })),
    ).toBeNull()
    expect(
      estimateMonthlyFuel(estimateArgs({ defaultPricePerLitreUsd: -1.69 })),
    ).toBeNull()
  })

  it("refuses a figure that is not a number", () => {
    // A NaN would otherwise become a zero on the way into BigNumber and read
    // as a real, cheap month; an Infinity would print an infinite cost.
    expect(
      estimateMonthlyFuel(estimateArgs({ measuredConsumption: Number.NaN })),
    ).toBeNull()
    expect(
      estimateMonthlyFuel(
        estimateArgs({ measuredPricePerLitreUsd: Number.POSITIVE_INFINITY }),
      ),
    ).toBeNull()
    expect(
      estimateMonthlyFuel(estimateArgs({ kmPerDay: Number.NaN })),
    ).toBeNull()
  })
})

describe("a measured price of zero is not a measurement", () => {
  it("reports no price per litre when litres were logged without amounts", () => {
    // Reachable from a real book: `computeFuelEconomy` divides spend by litres,
    // so fills recording litres but no cost used to yield 0 — and a zero then
    // made the measurement WORSE than none, because the monthly estimate
    // refused to run rather than falling back to its default.
    const economy = computeFuelEconomy(
      [
        fill({ date: "2026-01-01", odometer: 50000, litres: 40, amount: null }),
        fill({ date: "2026-01-15", odometer: 50500, litres: 35, amount: null }),
      ],
      RATES,
    )
    expect(economy.totalLitres).toBe(75)
    expect(economy.totalFuelUsd).toBe(0)
    expect(economy.avgPricePerLitreUsd).toBeNull()
    // The consumption reading is unaffected — it needs litres, not amounts.
    expect(economy.average).toBeCloseTo(7, 6)
  })

  it("still estimates a month, on the default price, and says so", () => {
    const economy = computeFuelEconomy(
      [
        fill({ date: "2026-01-01", odometer: 50000, litres: 40, amount: null }),
        fill({ date: "2026-01-15", odometer: 50500, litres: 35, amount: null }),
      ],
      RATES,
    )
    const estimate = estimateMonthlyFuel({
      kmPerDay: KM_PER_DAY,
      measuredConsumption: economy.average,
      assumedConsumption: 6.0,
      measuredPricePerLitreUsd: economy.latestPricePerLitreUsd,
      defaultPricePerLitreUsd: PRICE_USD,
    })
    expect(estimate).not.toBeNull()
    // Consumption came from his own tanks; the price did not.
    expect(estimate!.consumptionMeasured).toBe(true)
    expect(estimate!.consumption).toBeCloseTo(7, 6)
    expect(estimate!.priceMeasured).toBe(false)
    expect(estimate!.pricePerLitreUsd).toBe(PRICE_USD)
  })
})
