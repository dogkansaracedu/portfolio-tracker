import { describe, it, expect } from "vitest"
import { computeOpportunityCost, computeOwnershipCost } from "@/lib/vehicle"
import {
  MAINTENANCE_GROUPS,
  VEHICLE_CATEGORY_CLOSES,
  VEHICLE_COST_CATEGORIES,
  VEHICLE_COST_GROUPS,
  VEHICLE_VARIABLE_CATEGORIES,
} from "@/lib/constants/vehicle"
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
    // Only the one real amount lands in the total; the null row adds nothing.
    expect(cost.cashUsd).toBeCloseTo(4400 / 44.0, 4)
    expect(cost.variableUsd).toBeCloseTo(4400 / 44.0, 4)
  })
})

describe("the two denominators", () => {
  const entries = [
    // Variable: scales with distance.
    entry({ date: "2026-01-01", amount: 44000, category: "fuel" }),
    entry({ date: "2026-01-01", amount: 8800, category: "maintenance" }),
    // Tyres used to be its own category; it is maintenance now, and both were
    // always variable, so the split is unchanged by the fold.
    entry({ date: "2026-01-01", amount: 4400, category: "maintenance" }),
    // Fixed: accrues with time.
    entry({ date: "2026-01-01", amount: 22000, category: "insurance" }),
    entry({ date: "2026-01-01", amount: 8800, category: "tax" }),
    // Neither: a tow happens once and is not a monthly obligation.
    entry({ date: "2026-01-01", amount: 4400, category: "other" }),
  ]

  it("splits fixed from variable, with depreciation on the fixed side", () => {
    const cost = computeOwnershipCost(brief, entries, RATES, 66000, TODAY)
    // Variable = (44000 + 8800 + 4400) / 44 = $1,300
    expect(cost.variableUsd).toBeCloseTo(1300, 4)
    // Fixed cash = (22000 + 8800) / 44 = $700, plus $6,787.68 depreciation.
    expect(cost.fixedUsd).toBeCloseTo(700 + 6787.68, 1)
  })

  it("keeps one-off costs out of BOTH rates", () => {
    const cost = computeOwnershipCost(brief, entries, RATES, 66000, TODAY)
    // 4400 / 44 = $100, in neither the fixed nor the variable arm.
    expect(cost.incidentalUsd).toBeCloseTo(100, 4)
    expect(cost.variableUsd).toBeCloseTo(1300, 4)
    expect(cost.fixedUsd).toBeCloseTo(700 + 6787.68, 1)
    // …but real money all the same: it is in the cash figure and the total.
    expect(cost.cashUsd).toBeCloseTo(1300 + 700 + 100, 4)
    expect(cost.totalUsd).toBeCloseTo(2100 + 6787.68, 1)
  })

  it("still lets the three arms account for every outlay", () => {
    // The guard that the old `else` silently satisfied: nothing may fall out
    // of the classification, so the arms must sum back to the cash figure.
    const cost = computeOwnershipCost(brief, entries, RATES, 66000, TODAY)
    expect(cost.variableUsd + (cost.fixedUsd! - 6787.68) + cost.incidentalUsd)
      .toBeCloseTo(cost.cashUsd, 1)
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
    // Cash is $2,100 now — the $100 tow included, since the blended figure is
    // everything over the distance and the tow was really paid.
    expect(cost.totalUsd).toBeCloseTo(2100 + 6787.68, 1)
    expect(cost.blendedPerKmUsd).toBeCloseTo(cost.totalUsd! / 26000, 6)
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

describe("what an outlay can close", () => {
  // A tax payment cannot renew a drive belt. The reset list was offering every
  // item in the plan against every category, so it could.
  it("lets a maintenance cost close maintenance, and nothing else", () => {
    expect(VEHICLE_CATEGORY_CLOSES.maintenance).toEqual(["routine", "long_life"])
    expect(VEHICLE_CATEGORY_CLOSES.maintenance).not.toContain("obligations")
  })

  it("confines tax, insurance and inspection to the obligations", () => {
    for (const c of ["tax", "insurance", "inspection"] as const) {
      expect(VEHICLE_CATEGORY_CLOSES[c]).toEqual(["obligations"])
    }
  })

  it("lets a fill, a fine and a parking fee close nothing at all", () => {
    for (const c of ["fuel", "fine", "parking"] as const) {
      expect(VEHICLE_CATEGORY_CLOSES[c]).toEqual([])
    }
  })

  it("covers every category, with only real group names", () => {
    const groups = new Set<string>(MAINTENANCE_GROUPS.map((g) => g.value))
    for (const { value } of VEHICLE_COST_CATEGORIES) {
      const allowed = VEHICLE_CATEGORY_CLOSES[value]
      expect(allowed).toBeDefined()
      for (const g of allowed) expect(groups.has(g)).toBe(true)
    }
  })
})

describe("which items an outlay offers", () => {
  // Mirrors the form's own filter. Pinned here because getting it wrong makes
  // an item either unreachable or silently reset.
  type Item = { id: string; item_group: string; cost_category: string | null }
  const plan: Item[] = [
    { id: "oil", item_group: "routine", cost_category: null },
    { id: "belt", item_group: "long_life", cost_category: null },
    { id: "mtv", item_group: "obligations", cost_category: "tax" },
    { id: "trafik", item_group: "obligations", cost_category: "insurance" },
    { id: "muayene", item_group: "obligations", cost_category: "inspection" },
    // Claims nothing — the "Kasko renamed to IMM" case.
    { id: "imm", item_group: "obligations", cost_category: null },
  ]

  function offer(category: keyof typeof VEHICLE_CATEGORY_CLOSES) {
    const groups = VEHICLE_CATEGORY_CLOSES[category]
    const closable = plan.filter((i) => groups.includes(i.item_group as never))
    const claimants = closable.filter((i) => i.cost_category === category)
    const auto = claimants.length === 1 ? claimants : []
    const autoIds = new Set(auto.map((i) => i.id))
    const selectable = closable.filter(
      (i) =>
        !autoIds.has(i.id) &&
        (i.cost_category === null || i.cost_category === category),
    )
    return { auto: auto.map((i) => i.id), select: selectable.map((i) => i.id) }
  }

  it("closes an obligation without asking, when only one can be meant", () => {
    expect(offer("tax").auto).toEqual(["mtv"])
    expect(offer("insurance").auto).toEqual(["trafik"])
    expect(offer("inspection").auto).toEqual(["muayene"])
  })

  it("never offers an item that belongs to a different kind of outlay", () => {
    // Paying road tax must not offer to renew the insurance.
    expect(offer("tax").select).not.toContain("trafik")
    expect(offer("insurance").select).not.toContain("mtv")
  })

  it("keeps an unclaimed obligation reachable", () => {
    // The bug this exists to prevent: an item claiming nothing was filtered
    // out of every category at once and became impossible to close.
    for (const c of ["tax", "insurance", "inspection"] as const) {
      expect(offer(c).select).toContain("imm")
    }
  })

  it("asks, and only asks, for a service visit", () => {
    const m = offer("maintenance")
    expect(m.auto).toEqual([])
    expect(m.select).toEqual(["oil", "belt"])
  })

  it("offers nothing at all for a fill", () => {
    expect(offer("fuel")).toEqual({ auto: [], select: [] })
  })
})

describe("cash in four buckets", () => {
  const priced = [
    entry({ date: "2026-01-01", amount: 44000, category: "fuel" }),
    entry({ date: "2026-01-01", amount: 8800, category: "maintenance" }),
    entry({ date: "2026-01-01", amount: 22000, category: "insurance" }),
    entry({ date: "2026-01-01", amount: 8800, category: "tax" }),
    entry({ date: "2026-01-01", amount: 4400, category: "inspection" }),
    entry({ date: "2026-01-01", amount: 2200, category: "fine" }),
    entry({ date: "2026-01-01", amount: 1100, category: "parking" }),
  ]

  it("folds nine categories into four, largest first", () => {
    const { byGroup } = computeOwnershipCost(brief, priced, RATES, 66000, TODAY)
    // All at the 2026-01-01 rate of 44.0, so the lira figures rank directly:
    // fuel ₺44,000 · obligations ₺22,000 + ₺8,800 + ₺4,400 = ₺35,200 ·
    // maintenance ₺8,800 · other ₺2,200 + ₺1,100 = ₺3,300.
    expect(byGroup.map((g) => g.group)).toEqual([
      "fuel",
      "obligations",
      "maintenance",
      "other",
    ])
    expect(byGroup[0].usd).toBeCloseTo(44000 / 44, 6)
    expect(byGroup[1].usd).toBeCloseTo(35200 / 44, 6)
  })

  it("totals to the cash figure — a breakdown that does not is a lie", () => {
    const cost = computeOwnershipCost(brief, priced, RATES, 66000, TODAY)
    const summed = cost.byGroup.reduce((a, g) => a + g.usd, 0)
    expect(summed).toBeCloseTo(cost.cashUsd, 6)
    expect(cost.byGroup.reduce((a, g) => a + g.pct, 0)).toBeCloseTo(100, 6)
  })

  it("drops empty buckets rather than printing zeroes", () => {
    const { byGroup } = computeOwnershipCost(
      brief,
      [entry({ date: "2026-01-01", amount: 4400, category: "fuel" })],
      RATES,
      66000,
      TODAY,
    )
    expect(byGroup).toHaveLength(1)
    expect(byGroup[0].group).toBe("fuel")
  })

  it("counts an unknown category into other rather than losing it", () => {
    // The buckets must total to cash even if a category arrives that no
    // bucket claims — silently dropping spend is the one thing a breakdown
    // must never do.
    const odd = [entry({ date: "2026-01-01", amount: 4400, category: "tyres" })]
    const cost = computeOwnershipCost(brief, odd, RATES, 66000, TODAY)
    expect(cost.byGroup.map((g) => g.group)).toEqual(["other"])
    expect(cost.byGroup[0].usd).toBeCloseTo(cost.cashUsd, 6)
  })

  it("excludes unpriced entries and says how many", () => {
    const mixed = [
      entry({ date: "2026-01-01", amount: 4400, category: "fuel" }),
      entry({ date: "2026-01-01", amount: null, category: "maintenance" }),
      entry({ date: "2026-01-01", amount: null, category: "maintenance" }),
    ]
    const cost = computeOwnershipCost(brief, mixed, RATES, 66000, TODAY)
    expect(cost.unpricedEntries).toBe(2)
    // The two unpriced rows contribute nothing, so maintenance has no bucket.
    expect(cost.byGroup.map((g) => g.group)).toEqual(["fuel"])
  })

  it("keeps each bucket on one side of the fixed/variable split", () => {
    // The two cuts answer different questions and must never contradict:
    // fuel and maintenance are variable, obligations and other are fixed.
    for (const g of VEHICLE_COST_GROUPS) {
      const variable = g.categories.map((c) =>
        VEHICLE_VARIABLE_CATEGORIES.includes(c),
      )
      expect(new Set(variable).size).toBe(1)
    }
  })
})
