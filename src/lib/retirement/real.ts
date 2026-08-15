import type BigNumber from "bignumber.js"
import { MONTHS_PER_YEAR } from "@/lib/retirement/constants"
import { compoundFactor } from "@/lib/retirement/projection"

/**
 * Nominal → real, and TRY-quoted expected returns → their USD growth rate.
 * Both are pure re-derivations of already-computed figures: the nominal/real
 * toggle never changes a stored input, and a TRY option's saved return stays
 * TRY-quoted.
 *
 * See GLOSSARY: nominal-and-real, expected-return.
 */

/**
 * `real = nominal ÷ (1+i)^years` — the amount in today's purchasing power.
 * Deflation to a rate of −100%/yr or worse has no meaningful factor, so the
 * nominal amount passes through unchanged.
 */
export function toReal(
  nominalUsd: BigNumber,
  monthsFromNow: number,
  usdInflationPct: number,
): BigNumber {
  const factor = compoundFactor(usdInflationPct, monthsFromNow / MONTHS_PER_YEAR)
  if (!factor.isGreaterThan(0)) return nominalUsd
  return nominalUsd.dividedBy(factor)
}

/**
 * A TRY-linked option's expected return converted to USD growth:
 * `(1 + r_TRY) ÷ (1 + dep) − 1`, both quoted as annual percentages.
 * A depreciation of −100% or worse leaves nothing to divide by; the TRY rate
 * passes through rather than blowing up to infinity.
 */
export function usdRateFromTryRate(
  tryRatePct: number,
  tryDepreciationPct: number,
): number {
  const depreciationFactor = 1 + tryDepreciationPct / 100
  if (depreciationFactor <= 0) return tryRatePct
  return ((1 + tryRatePct / 100) / depreciationFactor - 1) * 100
}
