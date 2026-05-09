export const SUPPORTED_FIAT_CURRENCIES = ["USD", "TRY", "EUR"] as const

export type FiatCurrency = (typeof SUPPORTED_FIAT_CURRENCIES)[number]

export const CURRENCY_SYMBOLS: Record<FiatCurrency, string> = {
  USD: "$",
  TRY: "₺",
  EUR: "€",
}

export function isFiatCurrency(code: string): code is FiatCurrency {
  return (SUPPORTED_FIAT_CURRENCIES as readonly string[]).includes(code)
}

export const DEFAULT_CURRENCY: FiatCurrency = "USD"
