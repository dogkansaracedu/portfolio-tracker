import { useState } from "react"
import { Link, useParams } from "react-router"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  TransactionsSheetGrid,
  type TransactionsSheetControls,
} from "@/components/transactions/sheet/TransactionsSheetGrid"
import { ImportPopover } from "@/components/transactions/sheet/ImportPopover"
import { useAssets } from "@/hooks/useAssets"
import { usePlatforms } from "@/hooks/usePlatforms"

const PLACEHOLDER_ROWS = 6

/** SimplyWallSt-style full-page transactions editor. Route:
 *   /transactions/edit            → all transactions, bulk edit
 *   /transactions/edit/:assetId   → per-asset, asset column locked
 *
 *  Layout: dark sticky header (title + Import) → spreadsheet grid → dark
 *  sticky footer (Discard + counts + Save). */
export default function TransactionsEditPage() {
  const { assetId } = useParams<{ assetId?: string }>()
  const { assets } = useAssets()
  const { platforms } = usePlatforms()
  const [controls, setControls] = useState<TransactionsSheetControls | null>(null)

  const asset = assetId ? assets.find((a) => a.id === assetId) : null
  const title = asset ? `Add ${asset.ticker} transactions` : "Add your transactions"

  return (
    <div className="-m-4 flex h-[calc(100vh-3rem)] flex-col md:-m-6 md:h-[calc(100vh-3rem)]">
      {/* Dark sticky header */}
      <header className="sticky top-0 z-20 flex items-center justify-between gap-4 border-b bg-zinc-900 px-6 py-4 text-zinc-100 dark:bg-zinc-950">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-medium">{title}</h1>
          {asset && (
            <span className="text-sm text-zinc-400">{asset.name}</span>
          )}
          {controls && (
            <ImportPopover
              assets={assets}
              platforms={platforms}
              lockedAssetId={assetId}
              onAppend={controls.appendRows}
            />
          )}
        </div>
        <div className="flex items-center gap-4 text-sm">
          <Button
            variant="ghost"
            size="sm"
            nativeButton={false}
            render={<Link to={assetId ? "/portfolio" : "/transactions"} />}
            className="text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
          >
            Cancel
          </Button>
        </div>
      </header>

      {/* Spreadsheet grid — fills the remaining space and scrolls internally */}
      <main className="min-h-0 flex-1 overflow-auto bg-background">
        <TransactionsSheetGrid
          assetId={assetId}
          assets={assets}
          platforms={platforms}
          placeholderRowCount={PLACEHOLDER_ROWS}
          onControlsReady={setControls}
        />
      </main>

      {/* Dark sticky footer */}
      <footer className="sticky bottom-0 z-20 flex items-center justify-between gap-4 border-t bg-zinc-900 px-6 py-4 text-zinc-100 dark:bg-zinc-950">
        <Button
          variant="ghost"
          size="sm"
          nativeButton={false}
          render={<Link to={assetId ? "/portfolio" : "/transactions"} />}
          className="text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
        >
          Discard and go back
        </Button>

        <div className="flex items-center gap-4">
          {controls && (
            <Badge
              variant="secondary"
              className="bg-zinc-800 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-800"
            >
              <span className="font-semibold tabular-nums">
                {controls.counts.new + controls.counts.dirty}
              </span>{" "}
              /{" "}
              <span className="tabular-nums">
                {controls.counts.new +
                  controls.counts.dirty +
                  controls.counts.clean +
                  controls.counts.deleted}
              </span>{" "}
              transactions ready
              {controls.counts.invalid > 0 && (
                <span className="ml-2 text-red-400">
                  · {controls.counts.invalid} invalid
                </span>
              )}
            </Badge>
          )}
          <Button
            size="sm"
            onClick={controls?.save}
            disabled={!controls?.hasChanges || controls?.saving}
            className="bg-amber-400 px-6 text-zinc-900 hover:bg-amber-300"
          >
            {controls?.saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </footer>
    </div>
  )
}
