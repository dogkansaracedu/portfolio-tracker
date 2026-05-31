/** Asset category and price-source enums. Single source so the AssetForm
 *  and the resolve-unknown stepper stay in sync. */

import { isFiatCurrency, type FiatCurrency } from "@/lib/constants/currencies"

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

/** Ticker for physical gram gold — priced/displayed in TRY. Tokenized gold
 *  (PAXG, XAUT, …) uses its CoinGecko id and stays USD-native. */
export const PHYSICAL_GOLD_TICKER = "XAU_GRAM"

/**
 * The currency an asset's price is natively quoted in. Decides which
 * `price_cache` column a row shows as its primary figure; anything non-USD
 * gets a `~$` estimate beside it (from `price_usd`, which the fetch edge
 * function back-fills for every asset).
 *
 *  - BIST stocks trade in TRY (Yahoo `.IS` symbols)
 *  - physical gram gold (`XAU_GRAM`) is shown in TRY
 *  - fiat assets show their own currency (USD / TRY / EUR)
 *  - US stocks, crypto, and tokenized gold are quoted in USD
 *
 * Note: this can't be inferred from which `price_cache` columns are populated
 * — the edge function fills both `price_usd` and `price_try` for everything,
 * so the currency has to come from the asset itself.
 */
export function assetNativeCurrency(asset: {
  category: string
  ticker: string
}): FiatCurrency {
  if (asset.category === "fiat" && isFiatCurrency(asset.ticker)) {
    return asset.ticker
  }
  if (asset.category === "stock_bist") return "TRY"
  if (asset.category === "gold" && asset.ticker === PHYSICAL_GOLD_TICKER) {
    return "TRY"
  }
  return "USD"
}
