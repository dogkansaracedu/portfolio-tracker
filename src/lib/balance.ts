import { supabase } from "@/lib/supabase"
import { bn, BN_ZERO } from "@/lib/config"
import { ADD_TYPES, SUBTRACT_TYPES } from "@/lib/constants/transaction-types"

/**
 * Recalculate and upsert a holding's balance from its transactions.
 *
 * balance = SUM(buy + transfer_in + dividend + interest + cash_credit)
 *         - SUM(sell + transfer_out + fee + cash_debit)
 *
 * Cash rows (type=cash_credit/cash_debit) are auto-generated children of
 * buy/sell parents — they sit on the fiat asset (USD/TRY/EUR), so when
 * recalculating that fiat asset's balance, they participate naturally.
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

  let balance = BN_ZERO
  for (const tx of transactions ?? []) {
    if (ADD_TYPES.has(tx.type)) {
      balance = balance.plus(bn(tx.amount))
    } else if (SUBTRACT_TYPES.has(tx.type)) {
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
