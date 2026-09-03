import { describe, it, expect } from "vitest"
import { computeOpportunityCost, computeOwnershipCost } from "@/lib/vehicle"
import type {
  ExchangeRate,
  Vehicle,
  VehicleCostEntry,
} from "@/types/database"

// Cost of ownership is the figure none of the comparators computes, so these
// cases pin what makes it honest: every amount converted at ITS OWN date's
// rate, depreciation counted even though it is not cash, two denominators
// rather than one, and a missing current value producing null rather than a
// flattering zero.

const TODAY = "2026-09-04"

function rate(date: string, usdTry: number): ExchangeRate {
  return {
    date,
    source: "test",
    usd_try: usdTry,
    eur_try: null,
    eur_usd: null,
    gold_gram_try: null,
  }
}

// Ascending, as the lookup expects. The lira roughly halved against the dollar
// across this span, which is the whole reason per-date conversion matters.
const RATES: ExchangeRate[] = [
  rate("2024-12-01", 35.3),
  rate("2025-06-01", 40.0),
  rate("2026-01-01", 44.0),
  rate("2026-09-01", 48.3),
]

let seq = 0

function vehicle(over: Partial<Vehicle> = {}): Vehicle {
  return {
    id: "v1",
    user_id: "u1",
    name: "Egea",
    plate: null,
    make: null,
    model: null,
    model_year: null,
    purchased_on: "2024-12-01",
    purchase_price: 900000,
    purchase_currency: "TRY",
    purchase_odometer: 40000,
    current_value: null,
    current_value_currency: null,
    current_value_at: null,
    odometer: null,
    odometer_at: null,
    note: null,
    is_active: true,
    created_at: "2024-12-01T00:00:00Z",
    ...over,
  }
}

function entry(over: Partial<VehicleCostEntry> = {}): VehicleCostEntry {
  seq += 1
  return {
    id: `e${seq}`,
    user_id: "u1",
    vehicle_id: "v1",
    date: "2026-01-01",
    category: "fuel",
    amount: 1000,
    currency: "TRY",
    odometer: null,
    litres: null,
    is_full_tank: false,
    note: null,
    created_at: "2026-01-01T00:00:00Z",
    item_ids: [],
    ...over,
  }
}

/** The car from the brief: bought at ₺900,000 when the rate was 35.3, now
 *  worth ₺903,600 (+0.4% nominal, Cardata's real index) at 48.3. */
const brief = vehicle({
  current_value: 903600,
  current_value_currency: "TRY",
  current_value_at: "2026-09-01",
})

describe("depreciation across a moving currency", () => {
  it("reads as a gain in lira and a loss in dollars", () => {
    const cost = computeOwnershipCost(brief, [], RATES, 66000, TODAY)

    // ₺900,000 / 35.3 = $25,496 then; ₺903,600 / 48.3 = $18,708 now.
    expect(cost.purchaseUsd).toBeCloseTo(25495.75, 1)
    expect(cost.currentValueUsd).toBeCloseTo(18708.07, 1)

    // In lira the car is nominally UP ₺3,600. In the anchor it lost $6,788 —
    // the mirage this component exists to correct.
    expect(brief.current_value! - Number(brief.purchase_price)).toBe(3600)
    expect(cost.depreciationUsd).toBeCloseTo(6787.68, 1)
    expect(cost.depreciationUsd!).toBeGreaterThan(0)
  })

  it("converts each amount at its own date, never at today's rate", () => {
    // Two identical ₺44,000 outlays, eighteen months apart. At their own dates
    // they are worth very different amounts of anchor money; at one shared
    // rate they would be identical.
    const entries = [
      entry({ date: "2024-12-01", amount: 44000, category: "insurance" }),
      entry({ date: "2026-09-01", amount: 44000, category: "insurance" }),
    ]
    const cost = computeOwnershipCost(brief, entries, RATES, 66000, TODAY)
    // 44000/35.3 = 1246.46 and 44000/48.3 = 910.97
    expect(cost.cashUsd).toBeCloseTo(1246.46 + 910.97, 1)
    expect(cost.cashUsd).not.toBeCloseTo((44000 / 48.3) * 2, 1)
  })
})

describe("a missing current value", () => {
  const noValue = vehicle()

  it("yields null depreciation and total, never zero", () => {
    const cost = computeOwnershipCost(noValue, [entry()], RATES, 66000, TODAY)
    expect(cost.depreciationUsd).toBeNull()
    expect(cost.totalUsd).toBeNull()
    // Depreciation is a fixed cost, so per-month goes with it.
    expect(cost.fixedUsd).toBeNull()
    expect(cost.fixedPerMonthUsd).toBeNull()
    expect(cost.blendedPerKmUsd).toBeNull()
  })

  it("still reports cash spend and the variable per-km figure", () => {
    // What is knowable stays knowable — only the capital half goes dark.
    const cost = computeOwnershipCost(noValue, [entry()], RATES, 66000, TODAY)
    expect(cost.cashUsd).toBeGreaterThan(0)
    expect(cost.variablePerKmUsd).not.toBeNull()
  })
})

describe("null amounts", () => {
  it("contribute nothing, and are not zero spend", () => {
    // "Belt done at 130,000 km, price forgotten."
    const entries = [
      entry({ amount: null, category: "maintenance" }),
      entry({ amount: 4400, category: "maintenance", date: "2026-01-01" }),
    ]
    const cost = computeOwnershipCost(brief, entries, RATES, 66000, TODAY)
    expect(cost.cashUsd).toBeCloseTo(4400 / 44.0, 4)
    // The category shows one row, at the one real amount.
    expect(cost.byCategory).toHaveLength(1)
    expect(cost.byCategory[0].category).toBe("maintenance")
  })
})

describe("the two denominators", () => {
  const entries = [
    // Variable: scales with distance.
    entry({ date: "2026-01-01", amount: 44000, category: "fuel" }),
    entry({ date: "2026-01-01", amount: 8800, category: "maintenance" }),
    entry({ date: "2026-01-01", amount: 4400, category: "tyres" }),
    // Fixed: accrues with time.
    entry({ date: "2026-01-01", amount: 22000, category: "insurance" }),
    entry({ date: "2026-01-01", amount: 8800, category: "tax" }),
  ]

  it("splits fixed from variable, with depreciation on the fixed side", () => {
    const cost = computeOwnershipCost(brief, entries, RATES, 66000, TODAY)
    // Variable = (44000 + 8800 + 4400) / 44 = $1,300
    expect(cost.variableUsd).toBeCloseTo(1300, 4)
    // Fixed cash = (22000 + 8800) / 44 = $700, plus $6,787.68 depreciation.
    expect(cost.fixedUsd).toBeCloseTo(700 + 6787.68, 1)
  })

  it("quotes variable per km and fixed per month", () => {
    const cost = computeOwnershipCost(brief, entries, RATES, 66000, TODAY)
    // 66,000 − 40,000 purchase baseline = 26,000 km driven.
    expect(cost.kmDriven).toBe(26000)
    expect(cost.variablePerKmUsd).toBeCloseTo(1300 / 26000, 6)
    // 2024-12-01 → 2026-09-04 is ~21.1 months.
    expect(cost.monthsOwned).toBeCloseTo(21.1, 1)
    expect(cost.fixedPerMonthUsd).toBeCloseTo(
      (700 + 6787.68) / cost.monthsOwned,
      1,
    )
  })

  it("offers the blended per-km figure too", () => {
    const cost = computeOwnershipCost(brief, entries, RATES, 66000, TODAY)
    expect(cost.totalUsd).toBeCloseTo(2000 + 6787.68, 1)
    expect(cost.blendedPerKmUsd).toBeCloseTo(cost.totalUsd! / 26000, 6)
  })

  it("ranks the category breakdown by spend and drops empty categories", () => {
    const cost = computeOwnershipCost(brief, entries, RATES, 66000, TODAY)
    expect(cost.byCategory.map((c) => c.category)).toEqual([
      "fuel",
      "insurance",
      "maintenance",
      "tax",
      "tyres",
    ])
    // Shares are of cash spend and sum to 100.
    const sum = cost.byCategory.reduce((a, c) => a + c.pct, 0)
    expect(sum).toBeCloseTo(100, 6)
  })
})

describe("distance edge cases", () => {
  it("has no per-km figure when the car has not moved since purchase", () => {
    // A per-km number divided by zero distance is not a large number, it is
    // no number.
    const cost = computeOwnershipCost(brief, [entry()], RATES, 40000, TODAY)
    expect(cost.kmDriven).toBeNull()
    expect(cost.variablePerKmUsd).toBeNull()
    expect(cost.blendedPerKmUsd).toBeNull()
  })

  it("ignores an odometer below the purchase baseline", () => {
    const cost = computeOwnershipCost(brief, [], RATES, 100, TODAY)
    expect(cost.kmDriven).toBeNull()
  })
})

describe("computeOpportunityCost", () => {
  const cost = computeOwnershipCost(brief, [], RATES, 66000, TODAY)

  it("compounds the purchase capital at the portfolio's own rate", () => {
    const opp = computeOpportunityCost(cost, brief, 20, TODAY)!
    // ~1.76 years at 20%/yr on $25,495.75.
    expect(opp.years).toBeCloseTo(1.76, 1)
    expect(opp.capitalUsd).toBeCloseTo(25495.75, 1)
    const expected = 25495.75 * (Math.pow(1.2, opp.years) - 1)
    expect(opp.foregoneUsd).toBeCloseTo(expected, 1)
  })

  it("adds the foregone return on top of the cost of ownership", () => {
    const opp = computeOpportunityCost(cost, brief, 20, TODAY)!
    expect(opp.trueCostUsd).toBeCloseTo(cost.totalUsd! + opp.foregoneUsd, 4)
  })

  it("is null when the portfolio has no annualizable rate", () => {
    // computeLifetimeXirrPct returns null under a year of history; a zero
    // here would claim the capital would have earned nothing.
    expect(computeOpportunityCost(cost, brief, null, TODAY)).toBeNull()
  })

  it("is null on the day of purchase", () => {
    expect(computeOpportunityCost(cost, brief, 20, "2024-12-01")).toBeNull()
  })

  it("carries a negative foregone figure when the portfolio lost money", () => {
    // An honest result: had the money stayed invested it would have shrunk,
    // so the car cost less than its receipts suggest.
    const opp = computeOpportunityCost(cost, brief, -10, TODAY)!
    expect(opp.foregoneUsd).toBeLessThan(0)
  })
})
