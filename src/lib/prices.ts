import { CURRENCY_CONFIG, DECIMALS, getAmountDecimals } from "@/lib/config"
import { DISPLAY_LOCALE } from "@/lib/constants/app"
import type { FiatCurrency } from "@/lib/constants/currencies"
import type { StalenessLevel } from "@/lib/constants/prices"
import type { PriceCache, ExchangeRate } from "@/types/database"

export const OBFUSCATED_VALUE = "••••••"

export function obfuscate(value: string, isObfuscated: boolean): string {
  return isObfuscated ? OBFUSCATED_VALUE : value
}

/**
 * Format a numeric value as currency. Grouping and decimal separators follow
 * the currency's own locale (see `CURRENCY_CONFIG`); the symbol is always
 * PREFIXED and the minus sign always leads, so a row mixing currencies reads
 * with one shape:
 * - USD: $1,234.56 (en-US grouping)
 * - TRY: ₺1.234,56 (tr-TR grouping: . for thousands, , for decimal)
 * - EUR: €1.234,56 (de-DE grouping, symbol moved to the front)
 */
export function formatCurrency(
  value: number,
  currency: FiatCurrency
): string {
  const cfg = CURRENCY_CONFIG[currency]
  const sign = value < 0 ? "-" : ""
  const digits = new Intl.NumberFormat(cfg.locale, {
    minimumFractionDigits: cfg.decimals,
    maximumFractionDigits: cfg.decimals,
  }).format(Math.abs(value))
  return `${sign}${cfg.symbol}${digits}`
}

/**
 * The axis/dense-space form of {@link formatCurrency}: "$4.5k", "-$1.5k",
 * "₺160k", "$3.2M". Chart ticks and any other place where a quarter of the
 * width would otherwise go to ".00" use this — the symbol still leads and the
 * minus still leads the symbol, so it reads with the same shape as the full
 * form.
 *
 * One decimal below ten so a half-step tick reads "$1.5k" rather than rounding
 * to "$2k"; the trailing ".0" is dropped so "$2.0k" reads "$2k".
 */
export function formatCompactCurrency(
  value: number,
  currency: FiatCurrency
): string {
  const symbol = CURRENCY_CONFIG[currency].symbol
  const abs = Math.abs(value)
  const sign = value < 0 ? "-" : ""
  const trim = (s: string) => s.replace(/\.0$/, "")
  if (abs >= 1_000_000) {
    const v = abs / 1_000_000
    return `${sign}${symbol}${trim(v.toFixed(v < 10 ? 1 : 0))}M`
  }
  if (abs >= 1_000) {
    const v = abs / 1_000
    return `${sign}${symbol}${trim(v.toFixed(v < 10 ? 1 : 0))}k`
  }
  return `${sign}${symbol}${abs.toFixed(0)}`
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

/** The neutral tone: a figure that is neither a gain nor a loss. */
export const NEUTRAL_FIGURE_CLASS = "text-muted-foreground"

/**
 * Below this a figure is flat, not a gain: half a cent (and half of the last
 * displayed percent digit), so anything that renders as "0.00" / "0.00%" is
 * coloured neutral instead of green.
 */
const FLAT_EPSILON = 0.005

/**
 * Tri-state companion to {@link gainLossClass}: gain / loss / **neutral at
 * zero**. Use this wherever a figure can legitimately be flat (a cash row, a
 * period with no movement, a window with no starting base) — `gainLossClass`
 * alone paints every zero as a gain.
 */
export function gainLossToneClass(value: number): string {
  if (Math.abs(value) < FLAT_EPSILON) return NEUTRAL_FIGURE_CLASS
  return gainLossClass(value > 0)
}

/**
 * A gain/loss money figure: losses carry a leading ASCII minus, gains and zero
 * render bare (e.g. "$1,234.56", "-₺500,00") — direction is carried by the
 * gain/loss colour, not a "+". Since {@link formatCurrency} itself leads with
 * the minus for every currency, this is the same string; the name survives
 * because it marks a P&L figure at the call site (the convention CLAUDE.md
 * and the UI skill point to), not because it formats differently.
 */
export function formatSignedCurrency(
  value: number,
  currency: FiatCurrency
): string {
  return formatCurrency(value, currency)
}

/**
 * Format a "signed" percentage to `decimals` places: losses get a leading
 * minus, gains and zero render bare (e.g. "12.3%", "-4.0%"). Defaults to
 * `DECIMALS.percentage`.
 */
export function formatSignedPercent(
  value: number,
  decimals: number = DECIMALS.percentage
): string {
  const sign = value < 0 ? "-" : ""
  return `${sign}${Math.abs(value).toFixed(decimals)}%`
}

/**
 * Format a crypto amount with up to 8 decimal places,
 * trimming trailing zeros.
 */
export function formatCryptoAmount(value: number): string {
  return new Intl.NumberFormat(DISPLAY_LOCALE, {
    minimumFractionDigits: 0,
    maximumFractionDigits: DECIMALS.cryptoAmount,
  }).format(value)
}

/**
 * Format an asset quantity using the appropriate decimals for its category.
 */
export function formatAmount(value: number, category: string): string {
  const decimals = getAmountDecimals(category)
  return new Intl.NumberFormat(DISPLAY_LOCALE, {
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
export function getStalenessLevel(updatedAt: string): StalenessLevel {
  const ageMs = Date.now() - new Date(updatedAt).getTime()
  const ageMinutes = ageMs / (60 * 1000)

  if (ageMinutes < 30) return "fresh"
  if (ageMinutes < 120) return "warning"
  return "stale"
}
