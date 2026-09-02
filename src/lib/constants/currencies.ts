import { CURRENCY_CONFIG } from "@/lib/config"

export const SUPPORTED_FIAT_CURRENCIES = ["USD", "TRY", "EUR"] as const

export type FiatCurrency = (typeof SUPPORTED_FIAT_CURRENCIES)[number]

/** Currency symbols re-projected from {@link CURRENCY_CONFIG} so the
 *  symbol mapping stays single-sourced. */
export const CURRENCY_SYMBOLS: Record<FiatCurrency, string> = {
  USD: CURRENCY_CONFIG.USD.symbol,
  TRY: CURRENCY_CONFIG.TRY.symbol,
  EUR: CURRENCY_CONFIG.EUR.symbol,
}

/**
 * The one currency palette. Consumed by every surface that colours money BY
 * CURRENCY — the allocation donut's outer (fiat) ring and the Currencies card —
 * so a currency is never one hue in one card and another in the next.
 *
 * One family (fuchsia, dark → light) so the donut's outer ring still reads as a
 * single "cash" block, spaced far enough apart to tell the bars in the
 * Currencies card apart. The family is deliberately one no platform colour uses
 * (platform dots are blue / violet / orange / cyan / green / yellow / emerald /
 * slate), so a currency dot can never be mistaken for a platform dot.
 *
 * Includes the USD-pegged settlement stablecoins, which the donut nests under
 * the fiat wedge alongside the fiat rows.
 */
export const CURRENCY_CHART_COLORS: Record<string, string> = {
  TRY: "#a21caf", // fuchsia-700
  USD: "#c026d3", // fuchsia-600
  EUR: "#d946ef", // fuchsia-500
  USDC: "#e879f9", // fuchsia-400
  USDT: "#f0abfc", // fuchsia-300
}

/** Any currency outside {@link CURRENCY_CHART_COLORS}. */
export const CURRENCY_CHART_FALLBACK_COLOR = "#64748b" // slate-500

export function isFiatCurrency(code: string): code is FiatCurrency {
  return (SUPPORTED_FIAT_CURRENCIES as readonly string[]).includes(code)
}

export const DEFAULT_CURRENCY: FiatCurrency = "USD"
