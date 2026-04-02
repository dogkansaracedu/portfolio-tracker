import BigNumber from "bignumber.js"
import type { ExchangeRate } from "@/types/database"
import { bn } from "@/lib/config"

/**
 * Find the exchange rate for a given date (or nearest prior date).
 * Rates must be sorted by date ASC.
 */
export function getExchangeRateForDate(
  date: string,
  rates: ExchangeRate[],
): ExchangeRate | null {
  if (rates.length === 0) return null

  const target = date.slice(0, 10) // "YYYY-MM-DD"

  // Binary search for the largest date <= target
  let lo = 0
  let hi = rates.length - 1
  let result: ExchangeRate | null = null

  while (lo <= hi) {
    const mid = (lo + hi) >>> 1
    const midDate = rates[mid].date.slice(0, 10)

    if (midDate <= target) {
      result = rates[mid]
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }

  return result
}

/**
 * Convert an amount from a given currency to USD using the exchange rate
 * for the transaction date.
 */
export function normalizeToUsd(
  amount: number,
  currency: string,
  date: string,
  rates: ExchangeRate[],
): BigNumber {
  const upper = currency.toUpperCase()
  const bnAmount = bn(amount)

  if (upper === "USD") return bnAmount

  const rate = getExchangeRateForDate(date, rates)
  if (!rate) {
    // No exchange rate available — return amount as-is (assume USD)
    return bnAmount
  }

  if (upper === "TRY") {
    const usdTry = bn(rate.usd_try ?? 1)
    return usdTry.isZero() ? bnAmount : bnAmount.div(usdTry)
  }

  if (upper === "EUR") {
    const eurTry = bn(rate.eur_try ?? 1)
    const usdTry = bn(rate.usd_try ?? 1)
    // EUR -> TRY -> USD
    return usdTry.isZero() ? bnAmount : bnAmount.times(eurTry).div(usdTry)
  }

  // Unknown currency — return as-is
  return bnAmount
}

/**
 * Convert a unit price to USD.
 */
export function unitPriceToUsd(
  unitPrice: number,
  currency: string,
  date: string,
  rates: ExchangeRate[],
): BigNumber {
  return normalizeToUsd(unitPrice, currency, date, rates)
}
