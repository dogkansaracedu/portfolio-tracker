import { supabase } from "@/lib/supabase"
import { bn, BN_ZERO } from "@/lib/config"

/**
 * Recalculate and update an asset's cached balance from its transactions.
 *
 * balance = SUM(buy + transfer_in + dividend + interest)
 *         - SUM(sell + transfer_out + fee)
 */
export async function recalculateBalance(assetId: string): Promise<number> {
  const { data: transactions, error } = await supabase
    .from("transactions")
    .select("type, amount")
    .eq("asset_id", assetId)

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

  const balanceNum = balance.toNumber()

  const { error: updateError } = await supabase
    .from("assets")
    .update({ balance: balanceNum, updated_at: new Date().toISOString() })
    .eq("id", assetId)

  if (updateError) throw updateError

  return balanceNum
}
