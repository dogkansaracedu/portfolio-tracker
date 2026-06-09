/** Asset category and price-source enums. Single source so the AssetForm
 *  and the resolve-unknown stepper stay in sync. */

import {
  isFiatCurrency,
  DEFAULT_CURRENCY,
  type FiatCurrency,
} from "@/lib/constants/currencies"

export const ASSET_CATEGORIES = [
  { value: "fiat", label: "Fiat" },
  { value: "crypto", label: "Crypto" },
  { value: "gold", label: "Gold" },
  { value: "fund", label: "Fund (PPF)" },
  { value: "stock_us", label: "US Stock" },
  { value: "stock_bist", label: "BIST Stock" },
] as const

export type AssetCategoryValue = (typeof ASSET_CATEGORIES)[number]["value"]

export const PRICE_SOURCES = [
  { value: "yahoo", label: "Yahoo Finance" },
  { value: "tcmb", label: "TCMB" },
  { value: "tefas", label: "TEFAS" },
  { value: "manual", label: "Manual" },
] as const

export type PriceSourceValue = (typeof PRICE_SOURCES)[number]["value"]

/** Per-category hint for what the ticker should look like. */
export const TICKER_HINTS: Record<AssetCategoryValue, string> = {
  fiat: 'Use ISO code, e.g. "USD", "TRY", "EUR"',
  crypto: 'Use the symbol, e.g. "BTC", "ETH"',
  gold: 'Symbol for tokenized (e.g. "PAXG"); "XAU_GRAM" for physical',
  fund: 'Fund code, e.g. "TI1" (a TRY money-market fund / PPF)',
  stock_us: 'Use US ticker, e.g. "AAPL", "MSFT"',
  stock_bist: 'Use Yahoo format, e.g. "THYAO.IS", "ASELS.IS"',
}

/** Default price source per category. Used when seeding the resolve-unknown
 *  form so the user usually doesn't have to pick. */
export const DEFAULT_PRICE_SOURCE: Record<AssetCategoryValue, PriceSourceValue> = {
  fiat: "tcmb",
  crypto: "yahoo",
  gold: "yahoo",
  fund: "tefas",
  stock_us: "yahoo",
  stock_bist: "yahoo",
}

/** Ticker for physical gram gold — priced/displayed in TRY. Tokenized gold
 *  (PAXG, XAUT, …) is priced from its Yahoo `*-USD` symbol and stays USD-native. */
export const PHYSICAL_GOLD_TICKER = "XAU_GRAM"

/** USD-pegged stablecoins are tracked as `crypto` but are economically USD cash.
 *  Like funds nest under their fiat, these nest under the USD row in the
 *  portfolio's currency view. Curated set — add new USD pegs here. */
export const STABLECOIN_TICKERS = new Set(["USDT", "USDC"])

/** Whether an asset is a USD-pegged stablecoin (a "fiat crypto"). */
export function isStablecoin(asset: {
  category: string
  ticker: string
}): boolean {
  return (
    asset.category === "crypto" &&
    STABLECOIN_TICKERS.has(asset.ticker.toUpperCase())
  )
}

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
  if (asset.category === "fund") return "TRY"
  return "USD"
}

/** Native currency for an asset id, looked up in `assets`. Falls back to
 *  `DEFAULT_CURRENCY` when the id is unknown (e.g. an unresolved import
 *  sentinel like `new:TICKER`), which is corrected once the asset resolves. */
export function currencyForAssetId(
  assets: { id: string; category: string; ticker: string }[],
  assetId: string | null | undefined,
): FiatCurrency {
  if (!assetId) return DEFAULT_CURRENCY
  const a = assets.find((x) => x.id === assetId)
  return a ? assetNativeCurrency(a) : DEFAULT_CURRENCY
}
