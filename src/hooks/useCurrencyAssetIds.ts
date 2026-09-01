import { useMemo } from "react"
import { useAssets } from "@/hooks/useAssets"

/**
 * Ids of catalog assets with `is_currency` (EUR/TRY/USD cash). The P&L engine
 * needs the set to run fiat-mode FIFO on the right (asset, platform) groups —
 * bare `Transaction`s don't carry `is_currency`, and a sold-out currency has
 * no holdings row to derive it from.
 */
export function useCurrencyAssetIds(): ReadonlySet<string> {
  const { assets } = useAssets()
  return useMemo(
    () => new Set(assets.filter((a) => a.is_currency).map((a) => a.id)),
    [assets],
  )
}
