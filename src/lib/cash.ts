import BigNumber from "bignumber.js"
import { bn, BN_ZERO } from "@/lib/config"
import { supabase } from "@/lib/supabase"
import {
  TRANSACTION_TYPES,
  TYPES_WITH_LINKED_CHILD,
} from "@/lib/constants/transaction-types"
import { isFiatCurrency } from "@/lib/constants/currencies"
import type { Transaction, TransactionInsert } from "@/types/database"

/**
 * Look up the seeded fiat asset row for a currency code. The seed
 * (20260402100010_seed_function.sql) creates one row per (user, fiat
 * currency) at signup, with category='fiat' and ticker matching the code.
 */
export async function resolveFiatAsset(
  currency: string,
  userId: string,
): Promise<string> {
  if (!isFiatCurrency(currency)) {
    throw new Error(`Currency ${currency} is not a supported fiat currency`)
  }
  const { data, error } = await supabase
    .from("assets")
    .select("id")
    .eq("user_id", userId)
    .eq("category", "fiat")
    .eq("ticker", currency)
    .single()
  if (error) throw error
  if (!data?.id) {
    throw new Error(`Fiat asset row missing for ${currency}; check seed`)
  }
  return data.id
}

/**
 * Compute the cash side's amount in the parent's price_currency.
 * - Sell: net proceeds (total_cost − fee, when fee is in same currency).
 * - Buy (platform_deduct): total outlay (total_cost + fee, same-currency).
 * Different fee currencies fall back to total_cost (fee stays informational).
 */
export function computeCashAmount(parent: {
  type: Transaction["type"]
  total_cost: number | string
  fee: number | string | null
  fee_currency: string | null
  price_currency: string
}): BigNumber {
  const sameCurrencyFee =
    parent.fee_currency == null || parent.fee_currency === parent.price_currency
  const feeBn = sameCurrencyFee ? bn(parent.fee ?? 0) : BN_ZERO
  const total = bn(parent.total_cost)
  if (parent.type === TRANSACTION_TYPES.SELL) {
    return total.minus(feeBn)
  }
  if (parent.type === TRANSACTION_TYPES.BUY) {
    return total.plus(feeBn)
  }
  throw new Error(`computeCashAmount called for non-pair type ${parent.type}`)
}

/**
 * Decide whether a parent transaction needs a linked cash child.
 * - Sells always create one (R1).
 * - Buys create one only when fundingPlatformId is provided (R2).
 * - Other types never do (v1).
 */
export function shouldCreateChild(
  parentType: Transaction["type"],
  fundingPlatformId: string | null | undefined,
): boolean {
  if (!TYPES_WITH_LINKED_CHILD.has(parentType)) return false
  if (parentType === TRANSACTION_TYPES.SELL) return true
  if (parentType === TRANSACTION_TYPES.BUY) return Boolean(fundingPlatformId)
  return false
}

/**
 * Build the child-row payload for a parent transaction. Caller is
 * responsible for inserting it; the returned shape is ready for the
 * Supabase insert (no `id`, no `created_at`).
 */
export function buildChildRow(args: {
  parent: Pick<
    Transaction,
    | "user_id"
    | "platform_id"
    | "type"
    | "date"
    | "total_cost"
    | "fee"
    | "fee_currency"
    | "price_currency"
  >
  parentId: string
  fundingPlatformId: string | null
  cashAssetId: string
}): Omit<TransactionInsert, "id"> {
  const { parent, parentId, fundingPlatformId, cashAssetId } = args
  const cashType =
    parent.type === TRANSACTION_TYPES.SELL
      ? TRANSACTION_TYPES.CASH_CREDIT
      : TRANSACTION_TYPES.CASH_DEBIT
  const platformId =
    parent.type === TRANSACTION_TYPES.SELL
      ? parent.platform_id
      : (fundingPlatformId as string)
  const cashAmount = computeCashAmount(parent).toFixed()
  return {
    user_id: parent.user_id,
    asset_id: cashAssetId,
    platform_id: platformId,
    type: cashType,
    date: parent.date,
    // Cast: Postgres `numeric` accepts BigNumber-toFixed() strings to preserve
    // precision beyond JS Number — the same pattern recalculateBalance uses
    // when writing balances. The Transaction interface types these as
    // `number` for read ergonomics.
    amount: cashAmount as unknown as number,
    unit_price: 1,
    price_currency: parent.price_currency,
    total_cost: cashAmount as unknown as number,
    fee: 0,
    fee_currency: null,
    related_asset_id: null,
    linked_tx_id: parentId,
    notes: null,
  }
}

/**
 * Pure validation helper for the buy form. Returns null if OK, or an
 * error-message string. Caller passes the *current* on-platform cash
 * balance (already as BigNumber-string) plus the existing-child offset
 * if editing — see plan's edit-mode offset cases for details.
 */
export function validateFundingCash(args: {
  cashOnFunding: string
  totalCost: number | string
  fee: number | string | null
  feeCurrency: string | null
  priceCurrency: string
  /** When editing a platform-funded buy whose existing child sits on the
   *  same `(fiat-asset, fundingPlatform)` lens, pass the child's `amount`
   *  here. The validator adds it back into the available figure so the
   *  edit isn't falsely flagged as overdrawing because of itself. */
  existingChildOffset: string | null
  fundingPlatformName: string
}): string | null {
  const sameCurrencyFee =
    args.feeCurrency == null || args.feeCurrency === args.priceCurrency
  const required = sameCurrencyFee
    ? bn(args.totalCost).plus(bn(args.fee ?? 0))
    : bn(args.totalCost)
  const offset = args.existingChildOffset ? bn(args.existingChildOffset) : BN_ZERO
  const available = bn(args.cashOnFunding).plus(offset)
  if (available.lt(required)) {
    return (
      `Insufficient ${args.priceCurrency} on ${args.fundingPlatformName} ` +
      `(${available.toFixed()} available, ${required.toFixed()} needed)`
    )
  }
  return null
}
