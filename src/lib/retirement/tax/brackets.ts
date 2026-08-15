import BigNumber from "bignumber.js"
import { bn, BN_ZERO, BN_HUNDRED } from "@/lib/config"
import { MONTHS_PER_YEAR } from "@/lib/retirement/constants"
import { compoundFactor } from "@/lib/retirement/projection"
import { TRY_INCOME_TAX_BRACKETS } from "@/lib/retirement/tax/constants"

/**
 * The progressive non-employment tariff, applied to a TRY amount.
 *
 * The thresholds are nominal TL re-set every year by tebliğ, so a projection
 * that compared a 20-years-out gain against today's bands would put almost
 * every plan in the top bracket. `bracketIndexationFactor` grows them by the
 * scenario's TRY-inflation assumption over the horizon; the scenario's "now" is
 * taken as the brackets' base year.
 */

/** `(1 + TRY inflation)^years` from the bracket base year to the taxable event. */
export function bracketIndexationFactor(
  tryInflationPct: number,
  monthsFromNow: number,
): BigNumber {
  const factor = compoundFactor(tryInflationPct, monthsFromNow / MONTHS_PER_YEAR)
  return factor.isGreaterThan(0) ? factor : bn(1)
}

/** Tax due on `taxableTry` with every bracket threshold scaled by `indexation`. */
export function progressiveTaxTry(
  taxableTry: BigNumber,
  indexation: BigNumber,
): BigNumber {
  if (!taxableTry.isGreaterThan(0)) return BN_ZERO

  let remainingTry = taxableTry
  let bandFloorTry = BN_ZERO
  let taxTry = BN_ZERO

  for (const bracket of TRY_INCOME_TAX_BRACKETS) {
    if (!remainingTry.isGreaterThan(0)) break
    const ceilingTry =
      bracket.upToTry === null ? null : bn(bracket.upToTry).times(indexation)
    const bandTry =
      ceilingTry === null
        ? remainingTry
        : BigNumber.min(remainingTry, ceilingTry.minus(bandFloorTry))
    taxTry = taxTry.plus(bandTry.times(bracket.ratePct).dividedBy(BN_HUNDRED))
    remainingTry = remainingTry.minus(bandTry)
    if (ceilingTry !== null) bandFloorTry = ceilingTry
  }

  return taxTry
}
