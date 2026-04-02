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
  stock_bist: DECIMALS.stockAmount,
  stock_us: DECIMALS.stockAmount,
  commodity: DECIMALS.stockAmount,
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

/** Create a BigNumber from any value, defaulting to 0 for null/undefined */
export function bn(value: BigNumber.Value | null | undefined): BigNumber {
  if (value === null || value === undefined) return new BigNumber(0)
  const result = new BigNumber(value)
  return result.isNaN() ? new BigNumber(0) : result
}

/** Zero constant */
export const BN_ZERO = new BigNumber(0)

/** Hundred constant (for percentage calculations) */
export const BN_HUNDRED = new BigNumber(100)
