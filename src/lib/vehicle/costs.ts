/**
 * Cost of ownership (Component 17) — pure.
 *
 * The figure the comparators all miss. Drivvo, Fuelly and Carfax track real
 * receipts and ignore capital entirely (Drivvo even *stores* purchase and sale
 * value and never uses them); Edmunds and AAA model capital rigorously but
 * only for a hypothetical average new car in a single low-inflation currency.
 * This computes it from the owner's actual costs **and** their actual
 * depreciation.
 *
 * Two conventions carry the numbers:
 *
 *  1. **Every amount is normalized to the USD anchor at its own date's rate**,
 *     never at today's. That is what stops a Turkish car whose lira price
 *     merely tracked inflation from reading as a gain: Cardata's index ran
 *     +0.4% nominal from Dec 2024 to Jul 2026 against +56.9% cumulative
 *     inflation — about a third of its real value gone. It is the same
 *     per-entry-date rule Component 14 uses, and the pattern the BLS
 *     documents for consumption measurement (deflate in the intermediate
 *     steps, present in reference-period money).
 *  2. **Two denominators, not one** (AAA's split). Variable costs are quoted
 *     per km, fixed costs per month. AAA publishes the reason: the same car
 *     reads $1.00/mi at 10k mi/yr and $0.66/mi at 20k, a 34% swing from the
 *     denominator alone. The blended per-km figure is still offered, last, and
 *     always beside the distance it assumes.
 *
 * Nothing here is ever booked. No transaction, no holding, no P&L.
 */

import BigNumber from "bignumber.js"
import { bn, BN_ZERO, homeDayIso } from "@/lib/config"
import { normalizeToUsd } from "@/lib/pnl/currency"
import { daysBetweenIsoDays } from "@/lib/campaigns"
import { DAYS_PER_YEAR } from "@/lib/xirr"
// Pure compounding helper, reused rather than restated — the app has one
// implementation of `(1 + r)^years`.
import { compoundFactor } from "@/lib/retirement/projection"
import {
  VEHICLE_VARIABLE_CATEGORIES,
  type VehicleCostCategory,
} from "@/lib/constants/vehicle"
import type { ExchangeRate, Vehicle, VehicleCostEntry } from "@/types/database"

/** Average days in a month, for turning a span into whole-ish months. */
const DAYS_PER_MONTH = DAYS_PER_YEAR / 12

export interface OwnershipCost {
  /** Cash actually paid out, all entries at their own date's rate. */
  cashUsd: number
  /**
   * How many entries carry no amount — work recorded at a price no longer
   * known. They contribute nothing to `cashUsd` (they are not zero), so
   * without this count the total looks complete when it is not. The card
   * prints it beside the cash figure, the same way a missing current value
   * explains the depreciation blank.
   */
  unpricedEntries: number
  /**
   * Purchase price − current value, both at their own dates' rates. Positive
   * = value lost. Null when the car has no recorded current value: with no
   * value there is no depreciation figure, and a zero would be a lie about
   * the largest component of ownership cost.
   */
  depreciationUsd: number | null
  /** Cash + depreciation. Null whenever depreciation is. */
  totalUsd: number | null
  /** Purchase price in USD at the purchase date. */
  purchaseUsd: number
  /** Current value in USD at the date it was read. Null when unrecorded. */
  currentValueUsd: number | null

  /** Distance since purchase. Null when no odometer progress is known. */
  kmDriven: number | null
  /** Fractional months since purchase. */
  monthsOwned: number

  /** Costs that accrue with time — insurance, tax, inspection, fines,
   *  parking, other — plus depreciation. Null when depreciation is. */
  fixedUsd: number | null
  /** Costs that scale with distance — fuel, maintenance, tyres. */
  variableUsd: number
  /** Fixed ÷ months owned. Null when fixed is, or the span is zero. */
  fixedPerMonthUsd: number | null
  /** Variable ÷ km driven. Null when no distance is known. */
  variablePerKmUsd: number | null
  /** Total ÷ km driven — offered last, and never without its distance. */
  blendedPerKmUsd: number | null
}

/** One entry's amount in USD at its own date. Null-amount rows contribute
 *  nothing: "work done, price not recorded" is not zero spend. */
function entryUsd(entry: VehicleCostEntry, rates: ExchangeRate[]): BigNumber {
  if (entry.amount === null || entry.amount === undefined) return BN_ZERO
  return normalizeToUsd(Number(entry.amount), entry.currency, entry.date, rates)
}

export function computeOwnershipCost(
  vehicle: Vehicle,
  entries: VehicleCostEntry[],
  rates: ExchangeRate[],
  currentKm: number | null,
  today: string = homeDayIso(),
): OwnershipCost {
  const purchaseUsd = normalizeToUsd(
    Number(vehicle.purchase_price),
    vehicle.purchase_currency,
    vehicle.purchased_on,
    rates,
  )

  const currentValueUsd =
    vehicle.current_value !== null &&
    vehicle.current_value_currency &&
    vehicle.current_value_at
      ? normalizeToUsd(
          Number(vehicle.current_value),
          vehicle.current_value_currency,
          vehicle.current_value_at,
          rates,
        )
      : null

  const depreciation =
    currentValueUsd === null ? null : purchaseUsd.minus(currentValueUsd)

  // ── Cash, split fixed vs variable in one pass.
  let cash = BN_ZERO
  let variable = BN_ZERO
  let fixedCash = BN_ZERO
  let unpricedEntries = 0

  for (const entry of entries) {
    if (entry.amount === null || entry.amount === undefined) unpricedEntries++
    const usd = entryUsd(entry, rates)
    if (usd.isZero()) continue
    cash = cash.plus(usd)

    if (
      VEHICLE_VARIABLE_CATEGORIES.includes(
        entry.category as VehicleCostCategory,
      )
    ) {
      variable = variable.plus(usd)
    } else {
      fixedCash = fixedCash.plus(usd)
    }
  }

  const total = depreciation === null ? null : cash.plus(depreciation)
  const fixed = depreciation === null ? null : fixedCash.plus(depreciation)

  // ── Denominators
  const purchaseOdometer = Number(vehicle.purchase_odometer ?? 0)
  const kmDriven =
    currentKm !== null && currentKm > purchaseOdometer
      ? bn(currentKm).minus(bn(purchaseOdometer)).toNumber()
      : null

  const daysOwned = daysBetweenIsoDays(vehicle.purchased_on, today)
  const monthsOwned =
    daysOwned > 0 ? bn(daysOwned).div(bn(DAYS_PER_MONTH)).toNumber() : 0

  const fixedPerMonthUsd =
    fixed !== null && monthsOwned > 0
      ? fixed.div(bn(monthsOwned)).toNumber()
      : null
  const variablePerKmUsd =
    kmDriven !== null && kmDriven > 0
      ? variable.div(bn(kmDriven)).toNumber()
      : null
  const blendedPerKmUsd =
    total !== null && kmDriven !== null && kmDriven > 0
      ? total.div(bn(kmDriven)).toNumber()
      : null

  return {
    cashUsd: cash.toNumber(),
    unpricedEntries,
    depreciationUsd: depreciation === null ? null : depreciation.toNumber(),
    totalUsd: total === null ? null : total.toNumber(),
    purchaseUsd: purchaseUsd.toNumber(),
    currentValueUsd:
      currentValueUsd === null ? null : currentValueUsd.toNumber(),
    kmDriven,
    monthsOwned,
    fixedUsd: fixed === null ? null : fixed.toNumber(),
    variableUsd: variable.toNumber(),
    fixedPerMonthUsd,
    variablePerKmUsd,
    blendedPerKmUsd,
  }
}

// ─── Opportunity cost ───────────────────────────────────────────────

export interface OpportunityCost {
  /** The capital that left the portfolio at purchase, in USD. */
  capitalUsd: number
  /** Years held, for the compounding span. */
  years: number
  /** The annualized lifetime portfolio rate used, in percent. */
  ratePct: number
  /** What that capital would have earned over the same span. */
  foregoneUsd: number
  /** Cost of ownership + foregone return. */
  trueCostUsd: number | null
}

/**
 * What the purchase price would have earned had it stayed in the portfolio,
 * compounding at the owner's own lifetime annualized return over the holding
 * period. The one figure no car app can compute, because no car app knows the
 * owner's portfolio.
 *
 * It follows the same reasoning Edmunds documents for charging loan interest
 * even to cash buyers — TCO is an economic cost, not a cash-flow statement —
 * except the rate is the owner's realized MWR rather than a lending rate.
 *
 * Null when the portfolio has no annualizable rate yet (`ratePct` null, which
 * `computeLifetimeXirrPct` returns for under a year of history), when nothing
 * was paid, or over a zero-length span. Never a zero: a zero would claim the
 * capital would have earned nothing.
 */
export function computeOpportunityCost(
  cost: OwnershipCost,
  vehicle: Vehicle,
  annualRatePct: number | null,
  today: string = homeDayIso(),
): OpportunityCost | null {
  if (annualRatePct === null) return null
  if (!(cost.purchaseUsd > 0)) return null

  const days = daysBetweenIsoDays(vehicle.purchased_on, today)
  const years = days > 0 ? days / DAYS_PER_YEAR : 0
  if (!(years > 0)) return null

  const capital = bn(cost.purchaseUsd)
  const factor = compoundFactor(annualRatePct, years)
  const foregone = capital.times(factor).minus(capital)

  return {
    capitalUsd: cost.purchaseUsd,
    years,
    ratePct: annualRatePct,
    foregoneUsd: foregone.toNumber(),
    trueCostUsd:
      cost.totalUsd === null
        ? null
        : bn(cost.totalUsd).plus(foregone).toNumber(),
  }
}
