import { useState } from "react"
import { Link, useParams } from "react-router"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  TransactionsSheetGrid,
  type TransactionsSheetControls,
} from "@/components/transactions/sheet/TransactionsSheetGrid"
import { ImportPopover } from "@/components/transactions/sheet/ImportPopover"
import { MidasPdfImportButton } from "@/components/transactions/sheet/MidasPdfImportButton"
import {
  ADD_ROW_LABEL,
  BULK_EDITOR_PHONE_ADD_BY_HAND,
  BULK_EDITOR_PHONE_INTRO,
} from "@/lib/constants/transaction-types"
import { cn } from "@/lib/utils"
import { useAssets } from "@/hooks/useAssets"
import { usePlatforms } from "@/hooks/usePlatforms"

/** SimplyWallSt-style full-page transactions editor.
 *  Routes (both rendered OUTSIDE AppLayout so the page owns the entire viewport):
 *    /transactions/edit            → bulk add, blank canvas (no existing rows)
 *    /transactions/edit/:assetId   → per-asset, existing rows visible + editable,
 *                                    asset column locked
 *
 *  Layout: header bar (flex item, no sticky math needed) → scrollable
 *  spreadsheet area (overflow-auto, owns the only Y scroll on the page) →
 *  footer bar. The grid's <thead> sticks to the top of the scroll area.
 *  Both bars sit on the app's own surface tokens (`bg-card` + a hairline), so
 *  the editor reads as this app in both themes — an inverted zinc chrome made
 *  its outline buttons invisible in light mode. */
export default function TransactionsEditPage() {
  const { assetId } = useParams<{ assetId?: string }>()
  const { assets, refetch: refetchAssets } = useAssets()
  const { platforms } = usePlatforms()
  const [controls, setControls] = useState<TransactionsSheetControls | null>(null)

  const asset = assetId ? assets.find((a) => a.id === assetId) : null
  // How many real rows the grid holds (loaded or added) — the blank
  // placeholders don't count. On a phone the grid only appears once there is
  // something in it, so this must count EVERY status: leaving `invalid` out
  // meant a Save that failed validation dropped the count to zero and swapped
  // the grid back for the import screen — hiding the very rows, and the very
  // messages, the user was told to review.
  const rowCount = controls
    ? controls.counts.new +
      controls.counts.dirty +
      controls.counts.clean +
      controls.counts.deleted +
      controls.counts.invalid
    : 0
  const isBulkAdd = !assetId
  const placeholderRows = isBulkAdd ? 12 : 6
  const title = asset
    ? `Edit ${asset.ticker} transactions`
    : "Add your transactions"

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      {/* Header (flex item — height auto, no sticky needed) */}
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b bg-card px-4 py-4 md:gap-4 md:px-6">
        <div className="flex flex-wrap items-center gap-2 md:gap-4">
          <h1 className="text-lg font-medium sm:text-xl">{title}</h1>
          {asset && (
            <span className="text-sm text-muted-foreground">{asset.name}</span>
          )}
          {controls && (
            // While the import-first block is showing on a phone these three
            // are its own labelled buttons — the header would be a second,
            // weaker copy of them.
            <div
              className={cn(
                "flex flex-wrap items-center gap-2 md:gap-4",
                rowCount === 0 && "max-sm:hidden",
              )}
            >
              {/* Labels collapse below `sm` so the header stays one row on a
                  phone — the icon plus an accessible name carries it. */}
              <Button
                variant="outline"
                size="sm"
                onClick={controls.addBlankRow}
                aria-label={ADD_ROW_LABEL}
                className="max-sm:min-h-10"
              >
                <Plus className="size-3.5" />
                <span className="hidden sm:inline">{ADD_ROW_LABEL}</span>
              </Button>
              <ImportPopover
                assets={assets}
                platforms={platforms}
                lockedAssetId={assetId}
                onAppend={controls.appendRows}
              />
              {!assetId && (
                <MidasPdfImportButton
                  assets={assets}
                  platforms={platforms}
                  gridRows={controls.rows}
                  onAppend={controls.appendRows}
                />
              )}
            </div>
          )}
        </div>
      </header>

      {/* The single Y-scroll container on the page. The grid's thead sticks
       *  to the top of this element via `sticky top-0`. */}
      {/* Import-first on a phone: bringing in a broker statement is the only
          reason to open this page there, and an empty 690px spreadsheet is a
          poor thing to land on. The grid stays mounted (it owns `controls`),
          just hidden until it holds rows. */}
      {rowCount === 0 && controls && (
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-4 sm:hidden">
          <p className="text-sm text-muted-foreground">
            {BULK_EDITOR_PHONE_INTRO}
          </p>
          <ImportPopover
            assets={assets}
            platforms={platforms}
            lockedAssetId={assetId}
            onAppend={controls.appendRows}
            labelled
          />
          {!assetId && (
            <MidasPdfImportButton
              assets={assets}
              platforms={platforms}
              gridRows={controls.rows}
              onAppend={controls.appendRows}
              labelled
            />
          )}
          <Button
            variant="ghost"
            size="sm"
            className="min-h-10 self-start"
            onClick={controls.addBlankRow}
          >
            {BULK_EDITOR_PHONE_ADD_BY_HAND}
          </Button>
        </div>
      )}

      <main
        className={cn(
          "min-h-0 flex-1 overflow-auto bg-background",
          rowCount === 0 && controls && "max-sm:hidden",
        )}
      >
        <TransactionsSheetGrid
          assetId={assetId}
          assets={assets}
          platforms={platforms}
          placeholderRowCount={placeholderRows}
          loadExisting={!isBulkAdd}
          onControlsReady={setControls}
          refetchAssets={refetchAssets}
        />
      </main>

      {/* Footer — the two terminal actions sit together, as in every dialog
          footer in the app: discard on the left, Save on the right. */}
      <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t bg-card px-4 py-4 pb-safe-4 md:gap-4 md:px-6 md:pb-4">
        <Button
          variant="ghost"
          size="sm"
          nativeButton={false}
          render={<Link to={assetId ? "/portfolio" : "/transactions"} />}
        >
          Discard and go back
        </Button>

        <div className="flex items-center gap-4">
          {controls && (
            <Badge variant="secondary" className="px-3 py-1.5 text-xs">
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
                <span className="ml-2 text-destructive">
                  · {controls.counts.invalid} invalid
                </span>
              )}
            </Badge>
          )}
          <Button
            size="sm"
            onClick={controls?.save}
            disabled={!controls?.hasChanges || controls?.saving}
            className="px-6"
          >
            {controls?.saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </footer>
    </div>
  )
}
