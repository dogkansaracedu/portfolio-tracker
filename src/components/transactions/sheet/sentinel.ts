/** When a user types a ticker that doesn't exist yet, the row stores the
 *  ticker prefixed with this sentinel in the `assetId` field. The grid's
 *  save flow detects these and routes through the Resolve-Unknowns stepper
 *  to create the real asset and patch the rows before committing. */
export const NEW_ASSET_PREFIX = "new:"

export function isNewAssetSentinel(assetId: string): boolean {
  return assetId.startsWith(NEW_ASSET_PREFIX)
}

/** US class shares are commonly written with a dot (BRK.B, BF.B) but
 *  Yahoo's symbol uses a dash (BRK-B, BF-B). BIST tickers carry a real
 *  `.IS` suffix that must stay intact. */
function normalizeTicker(ticker: string): string {
  if (ticker.endsWith(".IS")) return ticker
  return ticker.replace(/\./g, "-")
}

export function makeNewAssetSentinel(ticker: string): string {
  return `${NEW_ASSET_PREFIX}${normalizeTicker(ticker.trim().toUpperCase())}`
}

export function tickerFromSentinel(sentinel: string): string {
  return sentinel.slice(NEW_ASSET_PREFIX.length)
}
