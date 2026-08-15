import type BigNumber from "bignumber.js"
import type { Transaction, ExchangeRate } from "@/types/database"
import { BN_ZERO } from "@/lib/config"
import { normalizeToUsd } from "@/lib/pnl/currency"
import { TRANSACTION_TYPES } from "@/lib/constants/transaction-types"

export interface AssetCostsUsd {
  /** Withholding booked as `tax` events (e.g. stopaj) — tax already taken,
   *  distinct from the pending at-source accrual (`taxAccrualUsd`). */
  taxesUsd: BigNumber
  /** Fees paid: standalone `fee` events plus the `fee` field carried on the
   *  asset's other transactions. */
  feesUsd: BigNumber
}

/**
 * Lifetime taxes/fees paid on one asset's transactions, each normalized to USD
 * at its own date. A reporting sum for the asset-detail view — not part of the
 * P&L decomposition (fees already flow into net invested via the engine).
 */
export function computeAssetCostsUsd(
  transactions: Transaction[],
  rates: ExchangeRate[],
): AssetCostsUsd {
  let taxesUsd = BN_ZERO
  let feesUsd = BN_ZERO
  for (const tx of transactions) {
    if (tx.type === TRANSACTION_TYPES.TAX) {
      taxesUsd = taxesUsd.plus(
        normalizeToUsd(tx.total_cost ?? 0, tx.price_currency, tx.date, rates),
      )
    } else if (tx.type === TRANSACTION_TYPES.FEE) {
      feesUsd = feesUsd.plus(
        normalizeToUsd(tx.total_cost ?? 0, tx.price_currency, tx.date, rates),
      )
    }
    if (tx.fee && tx.type !== TRANSACTION_TYPES.FEE) {
      feesUsd = feesUsd.plus(
        normalizeToUsd(
          tx.fee,
          tx.fee_currency ?? tx.price_currency,
          tx.date,
          rates,
        ),
      )
    }
  }
  return { taxesUsd, feesUsd }
}
