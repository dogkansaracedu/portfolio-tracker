import { useMemo, useState } from "react"
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react"
import { PageHeading } from "@/components/common/PageHeading"
import { AssetIcon } from "@/components/common/AssetIcon"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { CatalogSearchDialog } from "@/components/watchlist/CatalogSearchDialog"
import { useWatchlist } from "@/hooks/useWatchlist"
import { usePrices } from "@/hooks/usePrices"
import {
  formatCurrency,
  formatSignedPercent,
  gainLossToneClass,
  NEUTRAL_FIGURE_CLASS,
} from "@/lib/prices"
import { WATCHLIST_COPY } from "@/lib/constants/watchlist"
import { cn } from "@/lib/utils"
import type { PriceCache, WatchlistRow } from "@/types/database"
import { watchItemFromAsset } from "@/lib/watchlist"
import { buildWatchlist } from "../../supabase/functions/_shared/widget.ts"

/** Rows as of now — staleness is age at render time, like `PriceDisplay`. */
function watchlistEntries(
  items: WatchlistRow[],
  prices: Record<string, PriceCache>,
  usdTry: number | null,
) {
  return buildWatchlist(
    items.map((i) => watchItemFromAsset(i.asset)),
    prices,
    usdTry,
    Date.now(),
  )
}

/**
 * Component 19 — Watchlist (Takip listesi). Catalog assets followed without
 * holding them: price and today's change per row, in the user's order. The same rows
 * (and the same formula, `buildWatchlist`) feed the home-screen widget.
 *
 * Rows stay read-only until Edit: reorder and remove replace the figures
 * there, so a phone row never has to fit buttons and numbers side by side.
 */
export default function WatchlistPage() {
  const { items, loading, error, add, remove, move } = useWatchlist()
  const { prices, rates } = usePrices()
  const [editing, setEditing] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)

  const entries = useMemo(
    () => watchlistEntries(items, prices, rates?.usd_try ?? null),
    [items, prices, rates],
  )
  const watchedAssetIds = useMemo(() => new Set(items.map((i) => i.asset_id)), [items])

  return (
    <div className="space-y-4">
      <PageHeading
        title={WATCHLIST_COPY.pageTitle}
        subtitle={WATCHLIST_COPY.pageSubtitle}
      />

      <div className="flex max-w-2xl items-center justify-end gap-2">
        {items.length > 0 && (
          <Button variant="outline" size="sm" onClick={() => setEditing((v) => !v)}>
            {editing ? WATCHLIST_COPY.done : WATCHLIST_COPY.edit}
          </Button>
        )}
        <Button size="sm" onClick={() => setSearchOpen(true)}>
          <Plus />
          {WATCHLIST_COPY.add}
        </Button>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      {loading ? (
        <Skeleton className="h-40 w-full max-w-2xl" />
      ) : (
        items.length > 0 && (
          <ul className="w-full max-w-2xl divide-y overflow-hidden rounded-lg border">
            {items.map((item, index) => {
              const e = entries[index]
              return (
                <li key={item.id} className="flex min-h-14 items-center gap-3 px-3 py-2">
                  <AssetIcon asset={item.asset} size="sm" />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="font-medium">{item.asset.ticker}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {item.asset.name}
                    </span>
                  </div>

                  {editing ? (
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        disabled={index === 0}
                        onClick={() => void move(item.id, -1)}
                        aria-label={`${WATCHLIST_COPY.moveUp} ${item.asset.ticker}`}
                      >
                        <ArrowUp />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        disabled={index === items.length - 1}
                        onClick={() => void move(item.id, 1)}
                        aria-label={`${WATCHLIST_COPY.moveDown} ${item.asset.ticker}`}
                      >
                        <ArrowDown />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => void remove(item.id)}
                        aria-label={`${WATCHLIST_COPY.remove} ${item.asset.ticker}`}
                        className="text-red-500"
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  ) : (
                    <div
                      className={cn(
                        "flex shrink-0 flex-col items-end gap-0.5 tabular-nums",
                        e.stale && "opacity-50",
                      )}
                    >
                      <span>
                        {e.price == null
                          ? WATCHLIST_COPY.noPrice
                          : formatCurrency(e.price, e.priceCurrency)}
                      </span>
                      <span
                        className={cn(
                          "text-xs",
                          e.changePct == null
                            ? NEUTRAL_FIGURE_CLASS
                            : gainLossToneClass(e.changePct),
                        )}
                      >
                        {e.changePct == null
                          ? WATCHLIST_COPY.noChange
                          : formatSignedPercent(e.changePct)}
                      </span>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )
      )}

      <CatalogSearchDialog
        open={searchOpen}
        onOpenChange={setSearchOpen}
        watchedAssetIds={watchedAssetIds}
        onPick={(assetId) => void add(assetId)}
      />
    </div>
  )
}
