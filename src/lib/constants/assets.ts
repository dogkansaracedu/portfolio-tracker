/** Asset category and price-source enums. Single source so the AssetForm
 *  and the resolve-unknown stepper stay in sync. */

export const ASSET_CATEGORIES = [
  { value: "fiat", label: "Fiat" },
  { value: "crypto", label: "Crypto" },
  { value: "gold", label: "Gold" },
  { value: "stock_us", label: "US Stock" },
  { value: "stock_bist", label: "BIST Stock" },
] as const

export type AssetCategoryValue = (typeof ASSET_CATEGORIES)[number]["value"]

export const PRICE_SOURCES = [
  { value: "coingecko", label: "CoinGecko" },
  { value: "yahoo", label: "Yahoo Finance" },
  { value: "tcmb", label: "TCMB" },
  { value: "manual", label: "Manual" },
] as const

export type PriceSourceValue = (typeof PRICE_SOURCES)[number]["value"]

/** Per-category hint for what the ticker should look like. */
export const TICKER_HINTS: Record<AssetCategoryValue, string> = {
  fiat: 'Use ISO code, e.g. "USD", "TRY", "EUR"',
  crypto: 'Use CoinGecko ID, e.g. "bitcoin", "ethereum"',
  gold: 'CoinGecko ID for tokenized, "XAU_GRAM" for physical',
  stock_us: 'Use US ticker, e.g. "AAPL", "MSFT"',
  stock_bist: 'Use Yahoo format, e.g. "THYAO.IS", "ASELS.IS"',
}

/** Default price source per category. Used when seeding the resolve-unknown
 *  form so the user usually doesn't have to pick. */
export const DEFAULT_PRICE_SOURCE: Record<AssetCategoryValue, PriceSourceValue> = {
  fiat: "tcmb",
  crypto: "coingecko",
  gold: "coingecko",
  stock_us: "yahoo",
  stock_bist: "yahoo",
}
