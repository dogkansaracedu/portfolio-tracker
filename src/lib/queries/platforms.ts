import { supabase } from "@/lib/supabase";
import type { Platform, PlatformInsert, PlatformUpdate } from "@/types/database";

export async function fetchPlatforms(userId: string): Promise<Platform[]> {
  const { data, error } = await supabase
    .from("platforms")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data;
}

export async function createPlatform(data: PlatformInsert): Promise<Platform> {
  const { data: platform, error } = await supabase
    .from("platforms")
    .insert(data)
    .select()
    .single();

  if (error) throw error;
  return platform;
}

export async function updatePlatform(
  id: string,
  data: PlatformUpdate
): Promise<Platform> {
  const { data: platform, error } = await supabase
    .from("platforms")
    .update(data)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return platform;
}

export async function deletePlatform(id: string): Promise<void> {
  const { error } = await supabase.from("platforms").delete().eq("id", id);

  if (error) throw error;
}
