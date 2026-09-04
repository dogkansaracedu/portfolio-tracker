/**
 * Fuel economy (Component 17) — pure, and deliberately conservative about
 * what it will claim.
 *
 * Consumption is only measurable **between two full tanks**: you know how far
 * the car went, and you know the litres it took to put the tank back where it
 * started. A partial fill cannot close a tank, so it contributes its litres to
 * the segment it falls inside but yields no reading of its own. Drivvo learned
 * this the hard way and encodes the same rules — the first full tank is a
 * baseline only, and the most recent one shows no figure because that fuel has
 * not been burned yet.
 *
 * Where this departs from Drivvo is in *saying so*. Its honest blanks read as
 * a bug to users ("Bought this to track expenses and mpg. I get a zero for
 * mpg. What's up with that?"), because the app suppresses the number without
 * explaining it. Every null here has copy attached at the display edge.
 */

import { bn, BN_ZERO } from "@/lib/config"
import { normalizeToUsd } from "@/lib/pnl/currency"
// One definition of a month, shared with `computeOwnershipCost` so "per
// month" means the same thing wherever this component prints it.
import { DAYS_PER_MONTH } from "@/lib/xirr"
import {
  FUEL_CATEGORY,
  FUEL_ECONOMY_DISTANCE,
} from "@/lib/constants/vehicle"
import type { ExchangeRate, VehicleCostEntry } from "@/types/database"

export interface FuelSegment {
  /** The full-tank fill that opened the segment. */
  fromKm: number
  /** The full-tank fill that closed it. */
  toKm: number
  km: number
  litres: number
  /** Litres per 100 km over the segment. */
  consumption: number
  /** The closing fill's date — what the segment is labelled by. */
  date: string
}

export interface FuelEconomy {
  /** Litres per 100 km across every complete segment, weighted by distance
   *  (total litres ÷ total distance), not a mean of the segment figures. */
  average: number | null
  /** The most and least efficient complete segments. */
  best: FuelSegment | null
  worst: FuelSegment | null
  segments: FuelSegment[]
  /** Every litre ever logged, complete segment or not. */
  totalLitres: number
  /** Total fuel spend ÷ total litres, in USD at each fill's own date. */
  avgPricePerLitreUsd: number | null
  /**
   * Price per litre from the **most recent** fill that priced its litres, USD.
   *
   * Separate from the lifetime average because the two answer different
   * questions, and in a currency that loses a third of its value in a year the
   * gap between them is not a rounding difference. A lifetime average over
   * seventeen months of Turkish diesel sits a quarter below what the pump
   * charges today, so using it to project next month's cost understates it by
   * that much. The average still belongs on the card as a history figure — it
   * just cannot forecast.
   *
   * A quarter, not the third the raw lira prices suggest: every fill is
   * normalized at its OWN date's rate, and the lira fell over the same span
   * the price rose, so converting first absorbs part of the gap.
   */
  latestPricePerLitreUsd: number | null
  /** Total fuel spend, USD at each fill's own date. */
  totalFuelUsd: number
}

/**
 * Fuel rows in the order they happened: date ascending, and within one date
 * by odometer, so two fills on the same day still segment correctly.
 */
function fuelEntries(entries: VehicleCostEntry[]): VehicleCostEntry[] {
  return entries
    .filter((e) => e.category === FUEL_CATEGORY)
    .sort((a, b) =>
      a.date === b.date
        ? Number(a.odometer ?? 0) - Number(b.odometer ?? 0)
        : a.date < b.date
          ? -1
          : 1,
    )
}

export function computeFuelEconomy(
  entries: VehicleCostEntry[],
  rates: ExchangeRate[],
): FuelEconomy {
  const fills = fuelEntries(entries)

  let totalLitres = BN_ZERO
  let totalSpend = BN_ZERO
  // `fills` is date-ascending, so the last fill to price its own litres wins.
  let latestPricePerLitreUsd: number | null = null
  for (const fill of fills) {
    if (fill.litres !== null && fill.litres !== undefined) {
      totalLitres = totalLitres.plus(bn(Number(fill.litres)))
    }
    if (fill.amount !== null && fill.amount !== undefined) {
      totalSpend = totalSpend.plus(
        normalizeToUsd(Number(fill.amount), fill.currency, fill.date, rates),
      )
    }
    // Both halves have to come from the SAME fill: one row's litres over
    // another row's amount is not a price anybody paid.
    if (
      fill.litres !== null &&
      fill.litres !== undefined &&
      fill.amount !== null &&
      fill.amount !== undefined &&
      Number(fill.litres) > 0
    ) {
      latestPricePerLitreUsd = normalizeToUsd(
        Number(fill.amount),
        fill.currency,
        fill.date,
        rates,
      )
        .div(bn(Number(fill.litres)))
        .toNumber()
    }
  }

  // ── Segment between consecutive full tanks.
  const segments: FuelSegment[] = []
  let openKm: number | null = null
  // Litres put in since the segment opened, i.e. the fuel that carried the car
  // over this distance. The opening fill's own litres belong to the PREVIOUS
  // segment, so they are never counted here.
  let litresSinceOpen = BN_ZERO
  let incompleteSinceOpen = false

  for (const fill of fills) {
    const hasOdometer = fill.odometer !== null && fill.odometer !== undefined
    const litres =
      fill.litres === null || fill.litres === undefined
        ? null
        : bn(Number(fill.litres))

    if (openKm !== null) {
      // A fill with no litres logged means the segment's fuel total is
      // unknowable — mark it rather than under-reporting consumption.
      if (litres === null) incompleteSinceOpen = true
      else litresSinceOpen = litresSinceOpen.plus(litres)
    }

    if (!fill.is_full_tank) continue
    if (!hasOdometer) {
      // A full tank with no reading cannot open or close a segment; it breaks
      // the chain, so the next segment starts fresh.
      openKm = null
      litresSinceOpen = BN_ZERO
      incompleteSinceOpen = false
      continue
    }

    const km = Number(fill.odometer)

    if (openKm !== null && !incompleteSinceOpen) {
      const distance = bn(km).minus(bn(openKm))
      if (distance.gt(BN_ZERO) && litresSinceOpen.gt(BN_ZERO)) {
        segments.push({
          fromKm: openKm,
          toKm: km,
          km: distance.toNumber(),
          litres: litresSinceOpen.toNumber(),
          consumption: litresSinceOpen
            .div(distance)
            .times(bn(FUEL_ECONOMY_DISTANCE))
            .toNumber(),
          date: fill.date,
        })
      }
    }

    // This full tank opens the next segment.
    openKm = km
    litresSinceOpen = BN_ZERO
    incompleteSinceOpen = false
  }

  let average: number | null = null
  if (segments.length > 0) {
    let km = BN_ZERO
    let litres = BN_ZERO
    for (const s of segments) {
      km = km.plus(bn(s.km))
      litres = litres.plus(bn(s.litres))
    }
    average = km.gt(BN_ZERO)
      ? litres.div(km).times(bn(FUEL_ECONOMY_DISTANCE)).toNumber()
      : null
  }

  const sorted = [...segments].sort((a, b) => a.consumption - b.consumption)

  return {
    average,
    best: sorted[0] ?? null,
    worst: sorted.length > 1 ? sorted[sorted.length - 1] : null,
    segments,
    totalLitres: totalLitres.toNumber(),
    // Null, not zero, when litres were logged without amounts: spend of zero
    // over real litres is an absent price, not a free one. Returning the zero
    // made a measurement WORSE than no measurement — the caller would refuse
    // to estimate at all rather than fall back to its default.
    avgPricePerLitreUsd: totalLitres.gt(BN_ZERO) && totalSpend.gt(BN_ZERO)
      ? totalSpend.div(totalLitres).toNumber()
      : null,
    latestPricePerLitreUsd,
    totalFuelUsd: totalSpend.toNumber(),
  }
}

// ─── Monthly estimate ───────────────────────────────────────────────

export interface MonthlyFuelEstimate {
  /** Distance assumed per month, from the car's own observed pace. */
  km: number
  /** Litres that distance implies at the consumption figure used. */
  litres: number
  /** Cost of those litres, USD (the app's anchor). */
  costUsd: number
  /** Litres per 100 km actually used in the sum. */
  consumption: number
  /** Whether `consumption` was MEASURED from full-tank data or ASSUMED. */
  consumptionMeasured: boolean
  /** Price per litre used, USD. */
  pricePerLitreUsd: number
  /** Whether `pricePerLitreUsd` came from the owner's own fills or a
   *  default. */
  priceMeasured: boolean
}

/** Whether a figure can carry the sum: present, finite and above zero.
 *  Checked on the raw input, because `bn` turns a NaN into a zero and a zero
 *  passes a BigNumber comparison as a plausible-looking nothing. */
function usable(value: number | null): boolean {
  return value !== null && Number.isFinite(value) && value > 0
}

/**
 * Roughly what fuel costs per month at the pace the odometer says the car is
 * actually being driven.
 *
 * Consumption and price resolve **independently**, because they are measured
 * by different things: any single fill that recorded both its litres and its
 * amount gives a real price per litre, while consumption needs two fills to
 * close a full tank. Having the one without the other is the normal case, not
 * an edge, so each figure carries its own flag — an assumed 6.0 L/100km and a
 * measured 6.0 are the same number making very different claims, and only the
 * flag tells them apart.
 *
 * Null when the pace is unknown: with no observed distance there is nothing to
 * price, and a "typical" mileage would be a figure about somebody else's car —
 * the one thing this component refuses to do anywhere. Null too when the
 * consumption or price left to work with is not a positive, finite number,
 * since a zero consumption would report free motoring and a negative price is
 * not a price.
 */
/**
 * Why a null is safe to describe as "no pace yet" at the display edge.
 *
 * After resolution, consumption is either a measured segment average (positive
 * by construction — it is litres over distance, both positive) or the caller's
 * assumed figure, a positive constant. Price is either a measured average
 * (now null rather than zero when spend is absent) or the caller's default.
 * So the only input that can genuinely be missing is the pace, and the card's
 * single explanation is accurate.
 *
 * The guards on the other two stay anyway: they are cheap, and a future caller
 * passing a junk fallback should get nothing rather than an absurd figure.
 * They are unreachable, not unnecessary.
 */
export function estimateMonthlyFuel(args: {
  /** From `OdometerView.kmPerDay`; null when the car's pace is unknown. */
  kmPerDay: number | null
  /** The measured average from `computeFuelEconomy`, or null. */
  measuredConsumption: number | null
  /** Fallback L/100km when nothing is measured. */
  assumedConsumption: number
  /** The owner's own measured price per litre in USD, or null. */
  measuredPricePerLitreUsd: number | null
  /** Fallback price per litre in USD. */
  defaultPricePerLitreUsd: number
}): MonthlyFuelEstimate | null {
  const { kmPerDay, measuredConsumption, measuredPricePerLitreUsd } = args

  const consumptionMeasured = measuredConsumption !== null
  const consumption = measuredConsumption ?? args.assumedConsumption
  const priceMeasured = measuredPricePerLitreUsd !== null
  const price = measuredPricePerLitreUsd ?? args.defaultPricePerLitreUsd

  // `odometerView` already withholds a zero or backwards pace, so in practice
  // only the null arrives here; the rest of the guard costs nothing and keeps
  // an unusable figure from being multiplied into a monthly cost.
  if (!usable(kmPerDay)) return null
  if (!usable(consumption) || !usable(price)) return null

  const km = bn(kmPerDay).times(bn(DAYS_PER_MONTH))
  const litres = km.times(bn(consumption)).div(bn(FUEL_ECONOMY_DISTANCE))
  const cost = litres.times(bn(price))

  return {
    km: km.toNumber(),
    litres: litres.toNumber(),
    costUsd: cost.toNumber(),
    consumption,
    consumptionMeasured,
    pricePerLitreUsd: price,
    priceMeasured,
  }
}
