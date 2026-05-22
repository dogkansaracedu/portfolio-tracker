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

/** SimplyWallSt-style full-page transactions editor.
 *  Routes (both rendered OUTSIDE AppLayout so the page owns the entire viewport):
 *    /transactions/edit            → all transactions, bulk edit
 *    /transactions/edit/:assetId   → per-asset, asset column locked
 *
 *  Layout: dark header bar (flex item, no sticky math needed) → scrollable
 *  spreadsheet area (overflow-auto, owns the only Y scroll on the page) →
 *  dark footer bar. The grid's <thead> sticks to the top of the scroll area. */
export default function TransactionsEditPage() {
  const { assetId } = useParams<{ assetId?: string }>()
  const { assets } = useAssets()
  const { platforms } = usePlatforms()
  const [controls, setControls] = useState<TransactionsSheetControls | null>(null)

  const asset = assetId ? assets.find((a) => a.id === assetId) : null
  const title = asset ? `Add ${asset.ticker} transactions` : "Add your transactions"

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      {/* Dark header (flex item — height auto, no sticky needed) */}
      <header className="flex shrink-0 items-center justify-between gap-4 border-b bg-zinc-900 px-6 py-4 text-zinc-100">
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
        <Button
          variant="ghost"
          size="sm"
          nativeButton={false}
          render={<Link to={assetId ? "/portfolio" : "/transactions"} />}
          className="text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
        >
          Cancel
        </Button>
      </header>

      {/* The single Y-scroll container on the page. The grid's thead sticks
       *  to the top of this element via `sticky top-0`. */}
      <main className="min-h-0 flex-1 overflow-auto bg-background">
        <TransactionsSheetGrid
          assetId={assetId}
          assets={assets}
          platforms={platforms}
          placeholderRowCount={PLACEHOLDER_ROWS}
          onControlsReady={setControls}
        />
      </main>

      {/* Dark footer */}
      <footer className="flex shrink-0 items-center justify-between gap-4 border-t bg-zinc-900 px-6 py-4 text-zinc-100">
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
