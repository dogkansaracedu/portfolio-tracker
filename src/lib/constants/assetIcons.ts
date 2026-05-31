/** Asset-logo sources and sizing. Logos are resolved deterministically from a
 *  ticker (see lib/assetIcons) against public GitHub repos served over the
 *  jsDelivr CDN — no token, no signup, no rate limit. */

import type { FiatCurrency } from "@/lib/constants/currencies"

/** jsDelivr base URLs for the logo repos — token-free, no signup, no rate limit.
 *  - BIST files are `{TICKER}.png` (by ahmeterenodaci).
 *  - US (Nasdaq/NYSE) files are `_{TICKER}.png` — note the leading underscore.
 *  - Crypto files are `{symbol}.png` (spothq/cryptocurrency-icons), keyed by
 *    lowercase ticker symbol, e.g. "btc".
 *  - Flags are `{slug}.svg` (HatScripts/circle-flags) — already circular, so
 *    they fill the round chip edge-to-edge with no letterboxing. */
export const LOGO_BASE = {
  bist: "https://cdn.jsdelivr.net/gh/ahmeterenodaci/Istanbul-Stock-Exchange--BIST--including-symbols-and-logos/logos",
  nasdaq:
    "https://cdn.jsdelivr.net/gh/ahmeterenodaci/Nasdaq-Stock-Exchange-including-Symbols-and-Logos/logos",
  nyse: "https://cdn.jsdelivr.net/gh/ahmeterenodaci/New-York-Stock-Exchange--NYSE--including-Symbols-and-Logos/logos",
  cryptoSymbol:
    "https://cdn.jsdelivr.net/npm/cryptocurrency-icons@0.18.1/128/color",
  flag: "https://cdn.jsdelivr.net/gh/HatScripts/circle-flags/flags",
} as const

/** Fiat currency → circle-flags file slug. Drives the round flag icon shown for
 *  currency holdings, which carry no exchange logo and can't be edited from the
 *  UI. EUR maps to the EU flag. */
export const FIAT_FLAG_SLUG: Record<FiatCurrency, string> = {
  USD: "us",
  EUR: "european_union",
  TRY: "tr",
}

export type AssetIconSize = "sm" | "md" | "lg"

/** Circular box size per icon size (Tailwind size-* utilities). */
export const ASSET_ICON_SIZE_CLASS: Record<AssetIconSize, string> = {
  sm: "size-6",
  md: "size-7",
  lg: "size-10",
}
