import { useMemo, useState } from "react";
import { bn, BN_ZERO } from "@/lib/config";
import { useAssets } from "@/hooks/useAssets";
import { useHoldings } from "@/hooks/useHoldings";
import { usePrices } from "@/hooks/usePrices";
import type { Asset } from "@/types/database";
import { AssetForm } from "@/components/assets/AssetForm";
import { AssetRow } from "@/components/assets/AssetRow";
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Plus, ChevronRight, ChevronDown } from "lucide-react";

export function AssetList() {
  const { assets, loading, error, addAsset, editAsset, deactivateAsset } =
    useAssets();
  const { holdings } = useHoldings();
  const { prices } = usePrices();

  // Owned = net balance across all platforms is positive. Matches how the
  // portfolio decides what's held (usePortfolio filters totalBalance > 0); a
  // looser "any non-zero row" check would surface negative/residual leftovers.
  // Keep each group in the assets' existing name order; just float owned to top.
  const { ownedAssets, otherAssets } = useMemo(() => {
    const netByAsset = new Map<string, ReturnType<typeof bn>>();
    for (const h of holdings) {
      const prev = netByAsset.get(h.asset_id) ?? BN_ZERO;
      netByAsset.set(h.asset_id, prev.plus(bn(h.balance)));
    }
    const ownedAssets: Asset[] = [];
    const otherAssets: Asset[] = [];
    for (const asset of assets) {
      const net = netByAsset.get(asset.id) ?? BN_ZERO;
      (net.gt(0) ? ownedAssets : otherAssets).push(asset);
    }
    return { ownedAssets, otherAssets };
  }, [assets, holdings]);

  const [showNotHeld, setShowNotHeld] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null);
  const [deactivatingAsset, setDeactivatingAsset] = useState<Asset | null>(
    null
  );
  const [deactivateError, setDeactivateError] = useState<string | null>(null);

  function handleEdit(asset: Asset) {
    setEditingAsset(asset);
    setFormOpen(true);
  }

  function handleDeactivate(asset: Asset) {
    setDeactivateError(null);
    setDeactivatingAsset(asset);
  }

  async function confirmDeactivate() {
    if (!deactivatingAsset) return;
    try {
      await deactivateAsset(deactivatingAsset.id);
      setDeactivatingAsset(null);
    } catch (err) {
      setDeactivateError(
        err instanceof Error ? err.message : "Failed to deactivate asset"
      );
    }
  }

  function openCreateForm() {
    setEditingAsset(null);
    setFormOpen(true);
  }

  if (loading) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        Loading assets...
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-8 text-center text-sm text-destructive">{error}</div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {assets.filter((a) => a.is_active).length} active /{" "}
          {assets.length} total assets
        </p>
        <Button size="sm" onClick={openCreateForm}>
          <Plus className="size-4" />
          Add Asset
        </Button>
      </div>

      {assets.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-sm text-muted-foreground">
            No assets yet. Add one to start tracking your portfolio.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ticker</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Group</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {ownedAssets.map((asset) => (
                <AssetRow
                  key={asset.id}
                  asset={asset}
                  prices={prices}
                  onEdit={handleEdit}
                  onDeactivate={handleDeactivate}
                />
              ))}
              {otherAssets.length > 0 && (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={5} className="bg-muted/50 p-0">
                    <button
                      type="button"
                      onClick={() => setShowNotHeld((v) => !v)}
                      className="flex w-full items-center gap-1.5 px-4 py-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {showNotHeld ? (
                        <ChevronDown className="size-3.5" />
                      ) : (
                        <ChevronRight className="size-3.5" />
                      )}
                      Not held ({otherAssets.length})
                    </button>
                  </TableCell>
                </TableRow>
              )}
              {showNotHeld &&
                otherAssets.map((asset) => (
                  <AssetRow
                    key={asset.id}
                    asset={asset}
                    prices={prices}
                    onEdit={handleEdit}
                    onDeactivate={handleDeactivate}
                  />
                ))}
            </TableBody>
          </Table>
        </div>
      )}

      <AssetForm
        open={formOpen}
        onOpenChange={setFormOpen}
        asset={editingAsset}
        onSubmit={async (data) => {
          if (editingAsset) {
            await editAsset(editingAsset.id, {
              category: data.category,
              ticker: data.ticker,
              price_id: data.price_id,
              icon_url: data.icon_url,
              name: data.name,
              tags: data.tags,
              price_source: data.price_source,
            });
          } else {
            await addAsset({
              ...data,
              price_id: data.price_id,
              is_currency: false,
            });
          }
        }}
      />

      <AlertDialog
        open={deactivatingAsset != null}
        onOpenChange={(open) => {
          if (!open) setDeactivatingAsset(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate Asset</AlertDialogTitle>
            <AlertDialogDescription>
              {`Are you sure you want to deactivate "${deactivatingAsset?.name}"? It will be hidden from your active portfolio but can be reactivated later.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deactivateError && (
            <p className="text-sm text-destructive">{deactivateError}</p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={confirmDeactivate}
            >
              Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
