import BigNumber from "bignumber.js"

// ─── BigNumber Global Config ────────────────────────────────────────

BigNumber.config({
  DECIMAL_PLACES: 20, // internal precision
  ROUNDING_MODE: BigNumber.ROUND_HALF_UP,
})

// ─── Display Decimal Places ─────────────────────────────────────────

/** How many decimals to show for different contexts */
export const DECIMALS = {
  /** Fiat currency display: $1,234.56 */
  fiat: 2,
  /** Crypto quantity display: 0.00123456 */
  cryptoAmount: 8,
  /** Stock quantity display: 150.00 */
  stockAmount: 2,
  /** Fiat quantity display: 1,500 */
  fiatAmount: 0,
  /** Percentage display: 12.34% */
  percentage: 2,
  /** Price display for crypto in USD: $84,500.12 */
  priceUsd: 2,
  /** Price display for crypto in TRY: ₺1,234,567.89 */
  priceTry: 2,
  /** Exchange rate display: 44.4949 */
  exchangeRate: 4,
  /** P&L display: +$1,234.56 */
  pnl: 2,
} as const

// ─── Asset Category → Amount Decimals ───────────────────────────────

export const AMOUNT_DECIMALS: Record<string, number> = {
  fiat: DECIMALS.fiatAmount,
  crypto: DECIMALS.cryptoAmount,
  gold: DECIMALS.stockAmount,
  stock_bist: DECIMALS.stockAmount,
  stock_us: DECIMALS.stockAmount,
}

/** Get decimal places for displaying an asset's quantity */
export function getAmountDecimals(category: string): number {
  return AMOUNT_DECIMALS[category] ?? DECIMALS.stockAmount
}

// ─── Currency Formatting ────────────────────────────────────────────

export const CURRENCY_CONFIG = {
  USD: { symbol: "$", locale: "en-US", decimals: DECIMALS.fiat },
  TRY: { symbol: "₺", locale: "tr-TR", decimals: DECIMALS.fiat },
  EUR: { symbol: "€", locale: "de-DE", decimals: DECIMALS.fiat },
} as const

// ─── BigNumber Helpers ──────────────────────────────────────────────

/** Create a BigNumber from any value, defaulting to 0 for null/undefined/"" */
export function bn(value: BigNumber.Value | null | undefined): BigNumber {
  if (value === null || value === undefined || value === "") {
    return new BigNumber(0)
  }
  const result = new BigNumber(value)
  return result.isNaN() ? new BigNumber(0) : result
}

/** Zero constant */
export const BN_ZERO = new BigNumber(0)

/** Hundred constant (for percentage calculations) */
export const BN_HUNDRED = new BigNumber(100)

// ─── Live Price Polling ─────────────────────────────────────────────

/**
 * Cadences for the app-wide price refresh loop in `PricesProvider`. Both run
 * only while the tab is visible and a user is signed in, so a
 * backgrounded/blurred or logged-out app never burns Supabase or Yahoo calls.
 *
 * - `readMs`: how often a visible tab re-reads `price_cache` (a cheap `SELECT`)
 *   so on-screen figures track the cache.
 * - `triggerMs`: how often a visible tab pings the `fetch-prices` edge function
 *   to refresh upstream. The function itself decides, per asset, what's
 *   actually due (see its cadence constants), so most pings are near-free.
 */
export const PRICE_POLL = {
  readMs: 10_000,
  triggerMs: 30_000,
} as const

// ─── Timezone ───────────────────────────────────────────────────────

/**
 * The portfolio's home timezone. `snapshot_date` is stamped in this zone (not
 * UTC) so a snapshot's calendar day matches the user's local day and lines up
 * with the local-date logic the dashboard / performance views use. The edge
 * function (take-snapshots) hardcodes the same zone — keep them in sync.
 */
export const HOME_TIMEZONE = "Europe/Istanbul"

/** Today's date as "YYYY-MM-DD" in {@link HOME_TIMEZONE}. */
export function homeDayIso(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: HOME_TIMEZONE }).format(
    date,
  )
}
