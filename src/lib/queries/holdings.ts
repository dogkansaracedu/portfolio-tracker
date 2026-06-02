import { supabase } from "@/lib/supabase"
import type { Holding, HoldingInsert } from "@/types/database"

export interface HoldingWithDetails extends Holding {
  assets: {
    name: string
    ticker: string
    // Price-fetch key; price_cache is keyed by this. Null falls back to ticker.
    price_id: string | null
    category: string
    tags: string[]
    is_currency: boolean
    // Needed so the snapshot auto-refresh can value these in-memory rows
    // (it skips inactive assets) without a second holdings fetch.
    is_active: boolean
  }
  platforms: { name: string; color: string }
}

export async function fetchHoldings(
  userId: string,
): Promise<HoldingWithDetails[]> {
  const { data, error } = await supabase
    .from("holdings")
    .select("*, assets(name, ticker, price_id, category, tags, is_currency, is_active), platforms(name, color)")
    .eq("user_id", userId)
    .neq("balance", 0)
    .order("assets(name)")

  if (error) throw error
  return (data ?? []) as unknown as HoldingWithDetails[]
}

export async function fetchHoldingsByAsset(
  assetId: string,
): Promise<HoldingWithDetails[]> {
  const { data, error } = await supabase
    .from("holdings")
    .select("*, assets(name, ticker, price_id, category, tags, is_currency, is_active), platforms(name, color)")
    .eq("asset_id", assetId)

  if (error) throw error
  return (data ?? []) as unknown as HoldingWithDetails[]
}

export async function upsertHolding(data: HoldingInsert): Promise<Holding> {
  const { data: holding, error } = await supabase
    .from("holdings")
    .upsert(
      {
        ...data,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,asset_id,platform_id" },
    )
    .select()
    .single()

  if (error) throw error
  return holding
}
