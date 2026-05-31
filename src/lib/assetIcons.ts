import { LOGO_BASE } from "@/lib/constants/assetIcons"

/** Minimal asset shape needed to resolve a logo. */
export interface IconableAsset {
  ticker: string
  category: string
  icon_url?: string | null
}

/** Normalize a ticker for logo-file lookup: trim, uppercase, and drop a
 *  trailing exchange suffix (e.g. "THYAO.IS" → "THYAO") so the bare symbol
 *  matches the repo filenames. */
function normalizeTicker(ticker: string): string {
  return ticker.trim().toUpperCase().replace(/\.[A-Z]+$/, "")
}

/** Normalize a crypto ticker symbol for logo-file lookup: trim + lowercase.
 *  The cryptocurrency-icons repo names files by lowercase symbol ("btc.png"),
 *  and crypto symbols aren't exchange-suffixed, so — unlike stock tickers — we
 *  neither uppercase nor strip a trailing suffix. */
function normalizeCryptoSymbol(ticker: string): string {
  return ticker.trim().toLowerCase()
}

/** Ordered candidate image URLs for an asset's logo. `<AssetIcon>` tries each
 *  in order and falls back to a monogram when all fail to load.
 *
 *  Order: manual `icon_url` override (always wins) → exchange/coin logo repo(s).
 *  US assets don't record Nasdaq vs NYSE, so both are tried; US tickers are
 *  unique across the two exchanges, so a wrong company can never match.
 *  Crypto resolves by ticker symbol (e.g. "BTC" → btc.png). Gold / fiat have no
 *  automated source yet → override or monogram. */
export function getAssetIconCandidates(asset: IconableAsset): string[] {
  const candidates: string[] = []

  const override = asset.icon_url?.trim()
  if (override) candidates.push(override)

  const t = normalizeTicker(asset.ticker)

  switch (asset.category) {
    case "stock_us":
      if (t) {
        candidates.push(`${LOGO_BASE.nasdaq}/_${t}.png`)
        candidates.push(`${LOGO_BASE.nyse}/_${t}.png`)
      }
      break
    case "stock_bist":
      if (t) candidates.push(`${LOGO_BASE.bist}/${t}.png`)
      break
    case "crypto": {
      // Symbol-keyed source — matches our display ticker (e.g. "BTC" → btc).
      const symbol = normalizeCryptoSymbol(asset.ticker)
      if (symbol) candidates.push(`${LOGO_BASE.cryptoSymbol}/${symbol}.png`)
      break
    }
  }

  return candidates
}

const MONOGRAM_SATURATION = 60
const MONOGRAM_LIGHTNESS = 45

/** Deterministic monogram (initials + background color) for the fallback chip.
 *  Color is hashed from the ticker so it's stable per asset. Branding only —
 *  unrelated to the gain/loss palette. */
export function monogramFor(asset: IconableAsset): {
  initials: string
  bgColor: string
} {
  const t = normalizeTicker(asset.ticker)
  const initials = t.slice(0, 2) || "?"

  let hash = 0
  for (let i = 0; i < t.length; i++) {
    hash = (hash * 31 + t.charCodeAt(i)) | 0
  }
  const hue = Math.abs(hash) % 360

  return {
    initials,
    bgColor: `hsl(${hue}, ${MONOGRAM_SATURATION}%, ${MONOGRAM_LIGHTNESS}%)`,
  }
}
