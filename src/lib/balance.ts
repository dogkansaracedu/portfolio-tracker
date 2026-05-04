import { supabase } from "@/lib/supabase"
import { bn, BN_ZERO } from "@/lib/config"

/**
 * Recalculate and upsert a holding's balance from its transactions.
 *
 * balance = SUM(buy + transfer_in + dividend + interest)
 *         - SUM(sell + transfer_out + fee)
 *
 * Writes the result into the `holdings` table (upsert on user_id, asset_id, platform_id).
 */
export async function recalculateBalance(
  userId: string,
  assetId: string,
  platformId: string,
): Promise<string> {
  const { data: transactions, error } = await supabase
    .from("transactions")
    .select("type, amount")
    .eq("asset_id", assetId)
    .eq("platform_id", platformId)

  if (error) throw error

  const addTypes = new Set(["buy", "transfer_in", "dividend", "interest"])
  const subtractTypes = new Set(["sell", "transfer_out", "fee"])

  let balance = BN_ZERO
  for (const tx of transactions ?? []) {
    if (addTypes.has(tx.type)) {
      balance = balance.plus(bn(tx.amount))
    } else if (subtractTypes.has(tx.type)) {
      balance = balance.minus(bn(tx.amount))
    }
  }

  // Pass the BigNumber as a string so the Postgres `numeric` column stores
  // full precision; .toNumber() would silently round token decimals beyond
  // ~15-17 sig figs.
  const balanceStr = balance.toFixed()

  const { error: upsertError } = await supabase.from("holdings").upsert(
    {
      user_id: userId,
      asset_id: assetId,
      platform_id: platformId,
      balance: balanceStr,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,asset_id,platform_id" },
  )

  if (upsertError) throw upsertError

  return balanceStr
}
