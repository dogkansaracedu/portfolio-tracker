import { useMemo, useState } from "react"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Badge } from "@/components/ui/badge"
import { AssetIcon } from "@/components/common/AssetIcon"
import { useAssets } from "@/hooks/useAssets"
import { usePrices } from "@/hooks/usePrices"
import { CATEGORY_LABELS } from "@/lib/constants/assets"
import { WATCHLIST_COPY } from "@/lib/constants/watchlist"
import { formatCurrency } from "@/lib/prices"
import { filterCatalog, watchItemFromAsset } from "@/lib/watchlist"
import { buildWatchlist } from "../../../supabase/functions/_shared/widget.ts"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Assets already on the list — not offered again. */
  watchedAssetIds: Set<string>
  onPick: (assetId: string) => void
}

/** Add flow: pick an asset from the catalog, filtered by ticker or name as
 *  you type (client side — the catalog is already loaded). On a phone the
 *  dialog is the full-height sheet, so the list sits above the keyboard. */
export function CatalogSearchDialog({ open, onOpenChange, watchedAssetIds, onPick }: Props) {
  const { assets } = useAssets()
  const { prices, rates } = usePrices()
  const [query, setQuery] = useState("")

  const matches = useMemo(
    () => filterCatalog(assets, query, watchedAssetIds),
    [assets, query, watchedAssetIds],
  )
  // The row's own formula, so a result shows the price the list will.
  // Staleness isn't shown here, so "now" doesn't matter (0).
  const entries = useMemo(
    () =>
      buildWatchlist(matches.map(watchItemFromAsset), prices, rates?.usd_try ?? null, 0),
    [matches, prices, rates],
  )

  const handleOpenChange = (next: boolean) => {
    if (!next) setQuery("")
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{WATCHLIST_COPY.searchTitle}</DialogTitle>
        </DialogHeader>
        <Command shouldFilter={false} className="min-h-0 flex-1 bg-transparent p-0">
          <CommandInput
            autoFocus
            value={query}
            onValueChange={setQuery}
            placeholder={WATCHLIST_COPY.searchPlaceholder}
          />
          <DialogBody>
            <CommandList className="max-h-none">
              <CommandEmpty>{WATCHLIST_COPY.noResults}</CommandEmpty>
              {matches.map((asset, index) => {
                const e = entries[index]
                return (
                  <CommandItem
                    key={asset.id}
                    value={asset.id}
                    onSelect={() => {
                      onPick(asset.id)
                      handleOpenChange(false)
                    }}
                    className="min-h-11"
                  >
                    <AssetIcon asset={asset} size="sm" />
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="font-medium">{asset.ticker}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {asset.name}
                      </span>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-0.5">
                      <span className="tabular-nums">
                        {e.price == null
                          ? WATCHLIST_COPY.noPrice
                          : formatCurrency(e.price, e.priceCurrency)}
                      </span>
                      <Badge variant="secondary" className="text-[10px]">
                        {CATEGORY_LABELS[asset.category] ?? asset.category}
                      </Badge>
                    </div>
                  </CommandItem>
                )
              })}
            </CommandList>
          </DialogBody>
        </Command>
      </DialogContent>
    </Dialog>
  )
}
