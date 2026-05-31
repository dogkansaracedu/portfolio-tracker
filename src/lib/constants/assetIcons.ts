/** Asset-logo sources and sizing. Logos are resolved deterministically from a
 *  ticker (see lib/assetIcons) against public GitHub repos served over the
 *  jsDelivr CDN — no token, no signup, no rate limit. */

/** jsDelivr base URLs for the per-exchange logo repos (by ahmeterenodaci).
 *  - BIST files are `{TICKER}.png`.
 *  - US (Nasdaq/NYSE) files are `_{TICKER}.png` (note the leading underscore). */
export const LOGO_BASE = {
  bist: "https://cdn.jsdelivr.net/gh/ahmeterenodaci/Istanbul-Stock-Exchange--BIST--including-symbols-and-logos/logos",
  nasdaq:
    "https://cdn.jsdelivr.net/gh/ahmeterenodaci/Nasdaq-Stock-Exchange-including-Symbols-and-Logos/logos",
  nyse: "https://cdn.jsdelivr.net/gh/ahmeterenodaci/New-York-Stock-Exchange--NYSE--including-Symbols-and-Logos/logos",
} as const

export type AssetIconSize = "sm" | "md" | "lg"

/** Square box size per icon size (Tailwind size-* utilities). */
export const ASSET_ICON_SIZE_CLASS: Record<AssetIconSize, string> = {
  sm: "size-5",
  md: "size-6",
  lg: "size-9",
}
