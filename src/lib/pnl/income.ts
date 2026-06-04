import type BigNumber from "bignumber.js"
import type { Transaction, ExchangeRate } from "@/types/database"
import { BN_ZERO } from "@/lib/config"
import { normalizeToUsd } from "@/lib/pnl/currency"

/**
 * Income (realized gain) from dividend & interest, in USD.
 *
 * Dividends and interest are earnings, not external capital and not an
 * unrealized mark — they're recognized at the amount received. This is the
 * `income` term in the P&L decomposition `total = unrealized + realized + income`,
 * which must equal the canonical money-weighted total `value − net invested`.
 */
export function computeIncomeUsd(
  transactions: Transaction[],
  rates: ExchangeRate[],
): BigNumber {
  let sum = BN_ZERO
  for (const tx of transactions) {
    if (tx.type !== "dividend" && tx.type !== "interest") continue
    sum = sum.plus(
      normalizeToUsd(tx.total_cost ?? 0, tx.price_currency, tx.date, rates),
    )
  }
  return sum
}
