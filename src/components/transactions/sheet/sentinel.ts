/** When a user types a ticker that doesn't exist yet, the row stores the
 *  ticker prefixed with this sentinel in the `assetId` field. The grid's
 *  save flow detects these and routes through the Resolve-Unknowns stepper
 *  to create the real asset and patch the rows before committing. */
export const NEW_ASSET_PREFIX = "new:"

export function isNewAssetSentinel(assetId: string): boolean {
  return assetId.startsWith(NEW_ASSET_PREFIX)
}

export function makeNewAssetSentinel(ticker: string): string {
  return `${NEW_ASSET_PREFIX}${ticker.trim().toUpperCase()}`
}

export function tickerFromSentinel(sentinel: string): string {
  return sentinel.slice(NEW_ASSET_PREFIX.length)
}
