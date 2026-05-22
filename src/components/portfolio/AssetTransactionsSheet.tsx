import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import { TransactionsSheetGrid } from "@/components/transactions/sheet/TransactionsSheetGrid"
import { useAssetSheet } from "@/contexts/AssetSheetContext"
import { useAssets } from "@/hooks/useAssets"
import { usePlatforms } from "@/hooks/usePlatforms"

export function AssetTransactionsSheet() {
  const { state, close } = useAssetSheet()
  const { assets } = useAssets()
  const { platforms } = usePlatforms()

  const asset = state.assetId
    ? assets.find((a) => a.id === state.assetId)
    : null

  return (
    <Sheet
      open={state.isOpen}
      onOpenChange={(open) => {
        if (!open) close()
      }}
    >
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-[min(1200px,95vw)]"
      >
        <SheetHeader className="border-b">
          <SheetTitle>
            {asset ? (
              <span className="flex items-center gap-2">
                <span>{asset.name}</span>
                <span className="text-sm font-normal text-muted-foreground">
                  {asset.ticker}
                </span>
              </span>
            ) : (
              "Transactions"
            )}
          </SheetTitle>
          <SheetDescription>
            Edit transactions inline. Changes commit on Save.
          </SheetDescription>
        </SheetHeader>

        {state.assetId && (
          <TransactionsSheetGrid
            assetId={state.assetId}
            assets={assets}
            platforms={platforms}
          />
        )}
      </SheetContent>
    </Sheet>
  )
}
