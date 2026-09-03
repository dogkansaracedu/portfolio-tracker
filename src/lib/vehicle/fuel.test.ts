import { describe, it, expect } from "vitest"
import { computeFuelEconomy } from "@/lib/vehicle"
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
  })
})
