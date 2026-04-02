import { supabase } from "@/lib/supabase"
import type { Asset, AssetInsert, AssetUpdate } from "@/types/database"

export async function fetchAssets(userId: string): Promise<Asset[]> {
  const { data, error } = await supabase
    .from("assets")
    .select("*")
    .eq("user_id", userId)
    .order("name")

  if (error) throw error
  return data ?? []
}

export async function createAsset(data: AssetInsert): Promise<Asset> {
  const { data: asset, error } = await supabase
    .from("assets")
    .insert(data)
    .select()
    .single()

  if (error) throw error
  return asset
}

export async function updateAsset(
  id: string,
  data: AssetUpdate,
): Promise<Asset> {
  const { data: asset, error } = await supabase
    .from("assets")
    .update(data)
    .eq("id", id)
    .select()
    .single()

  if (error) throw error
  return asset
}

export async function deactivateAsset(id: string): Promise<void> {
  const { error } = await supabase
    .from("assets")
    .update({ is_active: false })
    .eq("id", id)

  if (error) throw error
}
