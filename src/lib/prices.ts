import { CURRENCY_CONFIG, DECIMALS, getAmountDecimals } from "@/lib/config"
import type { FiatCurrency } from "@/lib/constants/currencies"
import type { PriceCache, ExchangeRate } from "@/types/database"

export const OBFUSCATED_VALUE = "••••••"

export function obfuscate(value: string, isObfuscated: boolean): string {
  return isObfuscated ? OBFUSCATED_VALUE : value
}

/**
 * Format a numeric value as currency.
 * - USD: $1,234.56 (en-US locale)
 * - TRY: ₺1.234,56 (tr-TR locale: . for thousands, , for decimal)
 * - EUR: 1.234,56 € (de-DE locale)
 */
export function formatCurrency(
  value: number,
  currency: FiatCurrency
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
 * Canonical Tailwind text-color classes for a gain/loss figure — the single
 * source every surface (transactions, portfolio, performance, dashboard) uses
 * so the green/red never drifts. `positive` is typically `value >= 0`.
 * (Dark-mode variants are intentionally omitted; TopMovers adds its own.)
 */
export function gainLossClass(positive: boolean): string {
  return positive ? "text-emerald-600" : "text-red-500"
}

/**
 * Format a signed currency figure: a leading +/− and the absolute amount
 * (e.g. "+$1,234.56", "-₺500,00"). Zero renders without a sign. The sign is
 * applied here (over `Math.abs`) rather than relying on the locale formatter,
 * so "+" is shown for gains.
 */
export function formatSignedCurrency(
  value: number,
  currency: FiatCurrency
): string {
  const sign = value > 0 ? "+" : value < 0 ? "-" : ""
  return `${sign}${formatCurrency(Math.abs(value), currency)}`
}

/**
 * Format a signed percentage to `decimals` places (e.g. "+12.3%", "-4.0%").
 * Zero renders without a sign. Defaults to `DECIMALS.percentage`.
 */
export function formatSignedPercent(
  value: number,
  decimals: number = DECIMALS.percentage
): string {
  const sign = value > 0 ? "+" : value < 0 ? "-" : ""
  return `${sign}${Math.abs(value).toFixed(decimals)}%`
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
 * Structural equality for the prices map (keyed by price_id). The live poll
 * re-reads `price_cache` every few seconds; when nothing upstream changed the
 * fetched rows are value-identical to what's already in state. Comparing here
 * lets the store skip a no-op `setState`, so an identical re-read doesn't churn
 * a fresh object reference through every price consumer (which otherwise
 * rebuilds the whole portfolio memo chain and flickers the table each tick).
 * Compares only the value-bearing fields consumers read — `updated_at` and the
 * two prices; `ticker`/`source` are stable per key.
 */
export function priceMapsEqual(
  a: Record<string, PriceCache>,
  b: Record<string, PriceCache>
): boolean {
  const aKeys = Object.keys(a)
  if (aKeys.length !== Object.keys(b).length) return false
  for (const key of aKeys) {
    const pa = a[key]
    const pb = b[key]
    if (!pb) return false
    if (
      pa.updated_at !== pb.updated_at ||
      pa.price_usd !== pb.price_usd ||
      pa.price_try !== pb.price_try
    ) {
      return false
    }
  }
  return true
}

/**
 * Value equality for the latest exchange-rate row — the same no-op-`setState`
 * guard as {@link priceMapsEqual}, applied to the single rates row.
 */
export function ratesEqual(
  a: ExchangeRate | null,
  b: ExchangeRate | null
): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return (
    a.date === b.date &&
    a.usd_try === b.usd_try &&
    a.eur_try === b.eur_try &&
    a.eur_usd === b.eur_usd &&
    a.gold_gram_try === b.gold_gram_try
  )
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
