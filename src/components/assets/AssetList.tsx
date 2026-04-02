import { useState } from "react";
import { useAssets } from "@/hooks/useAssets";
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
import { Plus } from "lucide-react";

export function AssetList() {
  const { assets, loading, error, addAsset, editAsset, deactivateAsset } =
    useAssets();

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
                <TableHead>Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Group</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {assets.map((asset) => (
                <AssetRow
                  key={asset.id}
                  asset={asset}
                  onEdit={handleEdit}
                  onDeactivate={handleDeactivate}
                />
              ))}
              {assets.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center">
                    <p className="text-sm text-muted-foreground">
                      No assets found
                    </p>
                  </TableCell>
                </TableRow>
              )}
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
              name: data.name,
              tags: data.tags,
              price_source: data.price_source,
            });
          } else {
            await addAsset(data);
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
