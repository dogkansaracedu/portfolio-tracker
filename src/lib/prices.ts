import { CURRENCY_CONFIG, DECIMALS, getAmountDecimals } from "@/lib/config"

export const OBFUSCATED_VALUE = "••••••"

export function obfuscate(value: string, isObfuscated: boolean): string {
  return isObfuscated ? OBFUSCATED_VALUE : value
}

/**
 * Format a numeric value as currency.
 * - USD: $1,234.56 (en-US locale)
 * - TRY: ₺1.234,56 (tr-TR locale: . for thousands, , for decimal)
 */
export function formatCurrency(
  value: number,
  currency: "USD" | "TRY"
): string {
  const cfg = CURRENCY_CONFIG[currency]
  return new Intl.NumberFormat(cfg.locale, {
    style: "currency",
    currency,
    minimumFractionDigits: cfg.decimals,
    maximumFractionDigits: cfg.decimals,
  }).format(value)
}

/**
 * Format a crypto amount with up to 8 decimal places,
 * trimming trailing zeros.
 */
export function formatCryptoAmount(value: number): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: DECIMALS.cryptoAmount,
  }).format(value)
}

/**
 * Format an asset quantity using the appropriate decimals for its category.
 */
export function formatAmount(value: number, category: string): string {
  const decimals = getAmountDecimals(category)
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  }).format(value)
}

/**
 * Check if a price timestamp is stale.
 * @param updatedAt  ISO timestamp string
 * @param thresholdMinutes  minutes until considered stale (default 30)
 */
export function isStale(
  updatedAt: string,
  thresholdMinutes: number = 30
): boolean {
  const updated = new Date(updatedAt).getTime()
  const now = Date.now()
  return now - updated > thresholdMinutes * 60 * 1000
}

/**
 * Returns a staleness level for display purposes.
 * - fresh: less than 30 minutes old
 * - warning: 30 minutes to 2 hours old
 * - stale: more than 2 hours old
 */
export function getStalenessLevel(
  updatedAt: string
): "fresh" | "warning" | "stale" {
  const ageMs = Date.now() - new Date(updatedAt).getTime()
  const ageMinutes = ageMs / (60 * 1000)

  if (ageMinutes < 30) return "fresh"
  if (ageMinutes < 120) return "warning"
  return "stale"
}
