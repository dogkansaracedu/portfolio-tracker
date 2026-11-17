import { supabase } from "@/lib/supabase"
import type { AssetPriceSource, AssetPriceSourceUpsert } from "@/types/database"
import { PRICE_SOURCES_TABLE } from "@/lib/constants/priceSources"

/** One asset's price sources, priority 1 first. Readable by any signed-in
 *  user; written only by the admin (RLS). */
export async function fetchPriceSources(assetId: string): Promise<AssetPriceSource[]> {
  const { data, error } = await supabase
    .from(PRICE_SOURCES_TABLE)
    .select("*")
    .eq("asset_id", assetId)
    .order("priority")
  if (error) throw error
  return (data ?? []) as AssetPriceSource[]
}

/**
 * Save an asset's list (`buildSourceSave` output): delete the dropped rows,
 * then write every remaining row in ONE upsert. A single statement is a
 * single transaction, so the deferred unique (asset_id, priority) is checked
 * after all priorities moved — a reorder never trips it halfway. If the
 * upsert fails, only the deletes have landed; the editor keeps the draft so
 * Save can be retried.
 */
export async function savePriceSources(
  assetId: string,
  { deleteIds, upserts }: { deleteIds: string[]; upserts: AssetPriceSourceUpsert[] },
): Promise<void> {
  if (deleteIds.length > 0) {
    const { error } = await supabase
      .from(PRICE_SOURCES_TABLE)
      .delete()
      .eq("asset_id", assetId)
      .in("id", deleteIds)
    if (error) throw error
  }
  if (upserts.length > 0) {
    const { error } = await supabase
      .from(PRICE_SOURCES_TABLE)
      .upsert(upserts, { onConflict: "id" })
    if (error) throw error
  }
}
