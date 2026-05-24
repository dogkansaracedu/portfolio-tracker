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

export interface ResolvedTickerInfo {
  ticker: string
  name: string
  category: "stock_us" | "stock_bist"
  price_source: "yahoo"
  currency: string
}

/** Union of all reasons a ticker may need manual handling in the stepper.
 *  - `not_found | http_error | not_equity` come from the edge function.
 *  - `create_failed` is added client-side when the resolved metadata is
 *    fine but the follow-up `createAsset` call fails. */
export type UnresolvedReason =
  | "not_found"
  | "http_error"
  | "not_equity"
  | "create_failed"

export interface UnresolvedTickerInfo {
  ticker: string
  reason: UnresolvedReason
}

export interface ResolveTickersResult {
  resolved: ResolvedTickerInfo[]
  unresolved: UnresolvedTickerInfo[]
}

export async function resolveTickers(
  tickers: string[],
): Promise<ResolveTickersResult> {
  const { data, error } = await supabase.functions.invoke<ResolveTickersResult>(
    "resolve-tickers",
    { body: { tickers } },
  )
  if (error) {
    const ctx = (error as { context?: Response }).context
    if (ctx && typeof ctx.text === "function") {
      let body: string | undefined
      try {
        body = await ctx.text()
      } catch {
        // ctx.text() failed — fall through to throw the original error
      }
      if (body) {
        let message = body
        try {
          const json = JSON.parse(body)
          message = json.error ?? json.message ?? body
        } catch {
          // not JSON — use raw body as the error message
        }
        throw new Error(message)
      }
    }
    throw error
  }
  return data ?? { resolved: [], unresolved: [] }
}
