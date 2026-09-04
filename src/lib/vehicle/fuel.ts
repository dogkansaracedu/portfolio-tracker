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

/** Whether there is anything to show at all — any litre or any lira of fuel.
 *  One predicate, so the card and the layout that reserves room for it cannot
 *  disagree: reserving a column for a card that hides itself leaves a hole. */
export function hasFuelData(fuel: FuelEconomy): boolean {
  return fuel.totalLitres > 0 || fuel.totalFuelUsd > 0
}

export function computeFuelEconomy(
  entries: VehicleCostEntry[],
  rates: ExchangeRate[],
): FuelEconomy {
  const fills = fuelEntries(entries)

  let totalLitres = BN_ZERO
  let totalSpend = BN_ZERO
  for (const fill of fills) {
    if (fill.litres !== null && fill.litres !== undefined) {
      totalLitres = totalLitres.plus(bn(Number(fill.litres)))
    }
    if (fill.amount !== null && fill.amount !== undefined) {
      totalSpend = totalSpend.plus(
        normalizeToUsd(Number(fill.amount), fill.currency, fill.date, rates),
      )
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
    avgPricePerLitreUsd: totalLitres.gt(BN_ZERO)
      ? totalSpend.div(totalLitres).toNumber()
      : null,
    totalFuelUsd: totalSpend.toNumber(),
  }
}
