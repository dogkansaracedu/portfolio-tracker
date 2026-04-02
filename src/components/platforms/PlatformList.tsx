import { useState, useMemo } from "react";
import type { Platform } from "@/types/database";
import { usePlatforms } from "@/hooks/usePlatforms";
import { useHoldings } from "@/hooks/useHoldings";
import { PlatformCard } from "@/components/platforms/PlatformCard";
import { PlatformForm } from "@/components/platforms/PlatformForm";
import { Button } from "@/components/ui/button";
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
import { Plus } from "lucide-react";

export function PlatformList() {
  const { platforms, loading, error, addPlatform, editPlatform, removePlatform } =
    usePlatforms();
  const { holdings } = useHoldings();

  const [formOpen, setFormOpen] = useState(false);
  const [editingPlatform, setEditingPlatform] = useState<Platform | null>(null);
  const [deletingPlatform, setDeletingPlatform] = useState<Platform | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const assetCountByPlatform = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const h of holdings) {
      if (h.balance > 0) {
        counts[h.platform_id] = (counts[h.platform_id] || 0) + 1;
      }
    }
    return counts;
  }, [holdings]);

  function handleEdit(platform: Platform) {
    setEditingPlatform(platform);
    setFormOpen(true);
  }

  function handleDelete(platform: Platform) {
    setDeleteError(null);
    setDeletingPlatform(platform);
  }

  async function confirmDelete() {
    if (!deletingPlatform) return;
    try {
      await removePlatform(deletingPlatform.id);
      setDeletingPlatform(null);
    } catch (err) {
      setDeleteError(
        err instanceof Error ? err.message : "Failed to delete platform"
      );
    }
  }

  function openCreateForm() {
    setEditingPlatform(null);
    setFormOpen(true);
  }

  const deletingHasAssets =
    deletingPlatform != null &&
    (assetCountByPlatform[deletingPlatform.id] ?? 0) > 0;

  if (loading) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        Loading platforms...
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
          {platforms.length} {platforms.length === 1 ? "platform" : "platforms"}
        </p>
        <Button size="sm" onClick={openCreateForm}>
          <Plus className="size-4" />
          Add Platform
        </Button>
      </div>

      {platforms.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-sm text-muted-foreground">
            No platforms yet. Add one to start organizing your assets.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {platforms.map((platform) => (
            <PlatformCard
              key={platform.id}
              platform={platform}
              assetCount={assetCountByPlatform[platform.id] ?? 0}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      <PlatformForm
        open={formOpen}
        onOpenChange={setFormOpen}
        platform={editingPlatform}
        onSubmit={async (data) => {
          if (editingPlatform) {
            await editPlatform(editingPlatform.id, data);
          } else {
            await addPlatform(data);
          }
        }}
      />

      <AlertDialog
        open={deletingPlatform != null}
        onOpenChange={(open) => {
          if (!open) setDeletingPlatform(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deletingHasAssets
                ? "Cannot Delete Platform"
                : "Delete Platform"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deletingHasAssets
                ? `"${deletingPlatform?.name}" has ${assetCountByPlatform[deletingPlatform!.id]} active asset(s). Remove or reassign all assets before deleting this platform.`
                : `Are you sure you want to delete "${deletingPlatform?.name}"? This action cannot be undone.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError && (
            <p className="text-sm text-destructive">{deleteError}</p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>
              {deletingHasAssets ? "OK" : "Cancel"}
            </AlertDialogCancel>
            {!deletingHasAssets && (
              <AlertDialogAction
                variant="destructive"
                onClick={confirmDelete}
              >
                Delete
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
