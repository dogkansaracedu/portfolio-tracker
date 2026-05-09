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

export function isFiatCurrency(code: string): code is FiatCurrency {
  return (SUPPORTED_FIAT_CURRENCIES as readonly string[]).includes(code)
}

export const DEFAULT_CURRENCY: FiatCurrency = "USD"
