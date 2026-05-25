/** When a user types a ticker that doesn't exist yet, the row stores the
 *  ticker prefixed with this sentinel in the `assetId` field. The grid's
 *  save flow detects these and routes through the Resolve-Unknowns stepper
 *  to create the real asset and patch the rows before committing. */
export const NEW_ASSET_PREFIX = "new:"

export function isNewAssetSentinel(assetId: string): boolean {
  return assetId.startsWith(NEW_ASSET_PREFIX)
}

/** Convert raw user/PDF input to the canonical Yahoo-aligned ticker
 *  shape: uppercase + trimmed, with US class-share dots rewritten to
 *  dashes (BRK.B → BRK-B). BIST tickers ending in `.IS` keep their dot.
 *  Use this anywhere you need to compare or look up a ticker against
 *  the asset table — the asset's stored form follows the same rule. */
export function canonicalizeTicker(input: string): string {
  const upper = input.trim().toUpperCase()
  if (upper.endsWith(".IS")) return upper
  return upper.replace(/\./g, "-")
}

export function makeNewAssetSentinel(ticker: string): string {
  return `${NEW_ASSET_PREFIX}${canonicalizeTicker(ticker)}`
}

export function tickerFromSentinel(sentinel: string): string {
  return sentinel.slice(NEW_ASSET_PREFIX.length)
}
