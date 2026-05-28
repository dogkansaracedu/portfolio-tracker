import BigNumber from "bignumber.js"
import type { ExchangeRate } from "@/types/database"
import { bn } from "@/lib/config"

/**
 * Find the exchange rate for a given date: the nearest rate at or before
 * `date`, or — when `date` predates every rate we have — the EARLIEST rate as
 * a fallback. Rates must be sorted by date ASC. Returns null only when there
 * are no rates at all.
 *
 * The earliest-rate fallback is the guard against silent corruption: without
 * it, a transaction older than our rate history resolves to no rate, and
 * callers (`normalizeToUsd`) then treat the foreign amount as if it were USD —
 * a ~30x error for a TRY figure. Degrading to the nearest known rate keeps the
 * converted figure in the right order of magnitude. The bulk-import path also
 * proactively backfills missing historical rates (see ensureHistoricalRate),
 * so this fallback is a last resort, not the common case.
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

  // `date` is before the earliest rate → fall back to the earliest available
  // (rates is sorted ASC, so rates[0]) rather than signalling "no rate".
  return result ?? rates[0]
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
    console.warn(
      `[normalizeToUsd] No exchange rate found for ${upper} on ${date.slice(0, 10)} — falling back to amount as-is. Backfill via fetch-historical-rate.`,
    )
    return bnAmount
  }

  if (upper === "TRY") {
    const usdTry = bn(rate.usd_try ?? 1)
    return usdTry.isZero() ? bnAmount : bnAmount.div(usdTry)
  }

  if (upper === "EUR") {
    const eurUsd = bn(rate.eur_usd ?? 0)
    if (eurUsd.gt(0)) return bnAmount.times(eurUsd)
    // Fallback: pivot through TRY for legacy rows missing eur_usd
    const eurTry = bn(rate.eur_try ?? 1)
    const usdTry = bn(rate.usd_try ?? 1)
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

/**
 * Convert a USD amount *into* `toCurrency` using the exchange rate for `date`.
 *
 * The inverse of {@link normalizeToUsd}. Needed because {@link convertOnDate}
 * only targets USD|TRY, but a transaction's native currency may be EUR (e.g.
 * an IBKR EUR-denominated sell). All P&L is computed in USD; this is purely a
 * display helper to render a USD figure in its native currency.
 *
 * A missing rate falls back to the USD amount as-is (mirrors `normalizeToUsd`).
 */
export function fromUsdOnDate(
  amountUsd: BigNumber.Value,
  toCurrency: string,
  date: string,
  rates: ExchangeRate[],
): BigNumber {
  const upper = toCurrency.toUpperCase()
  const usd = bn(amountUsd)

  if (upper === "USD") return usd

  const rate = getExchangeRateForDate(date, rates)
  if (!rate) {
    console.warn(
      `[fromUsdOnDate] No exchange rate found for ${upper} on ${date.slice(0, 10)} — falling back to USD amount as-is. Backfill via fetch-historical-rate.`,
    )
    return usd
  }

  if (upper === "TRY") {
    return usd.times(bn(rate.usd_try ?? 1))
  }

  if (upper === "EUR") {
    const eurUsd = bn(rate.eur_usd ?? 0)
    if (eurUsd.gt(0)) return usd.div(eurUsd)
    // Fallback: pivot through TRY for legacy rows missing eur_usd
    const eurTry = bn(rate.eur_try ?? 0)
    const usdTry = bn(rate.usd_try ?? 1)
    if (eurTry.gt(0)) return usd.times(usdTry).div(eurTry)
    return usd
  }

  // Unknown currency — return as-is
  return usd
}

/**
 * Convert an amount from `fromCurrency` to `toCurrency` using the
 * exchange rate for `date`. Pivots through USD when needed.
 */
export function convertOnDate(
  amount: number,
  fromCurrency: string,
  toCurrency: "USD" | "TRY",
  date: string,
  rates: ExchangeRate[],
): BigNumber {
  const usd = normalizeToUsd(amount, fromCurrency, date, rates)
  if (toCurrency === "USD") return usd
  const rate = getExchangeRateForDate(date, rates)
  const usdTry = bn(rate?.usd_try ?? 1)
  return usd.times(usdTry)
}
