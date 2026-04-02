import BigNumber from "bignumber.js"
import type { Transaction, ExchangeRate } from "@/types/database"
import type { CostLot, RealizedPnLEntry, FIFOResult, ConsumedLot } from "./types"
import { unitPriceToUsd } from "./currency"
import { bn, BN_ZERO } from "@/lib/config"

/**
 * FIFO cost basis engine.
 *
 * Takes all transactions for a SINGLE asset, sorted by date ASC,
 * and computes the remaining cost lots and realized P&L entries.
 */
export function computeFIFOLots(
  transactions: Transaction[],
  rates: ExchangeRate[],
): FIFOResult {
  const lots: CostLot[] = []
  const realized: RealizedPnLEntry[] = []

  for (const tx of transactions) {
    const priceUsd = unitPriceToUsd(
      tx.unit_price,
      tx.price_currency,
      tx.date,
      rates,
    )

    switch (tx.type) {
      case "buy":
      case "transfer_in":
      case "dividend":
      case "interest": {
        lots.push({
          transactionId: tx.id,
          date: tx.date,
          amount: bn(tx.amount),
          unitPriceOriginal: bn(tx.unit_price),
          priceCurrency: tx.price_currency,
          unitPriceUsd: priceUsd,
        })
        break
      }

      case "sell": {
        const sellPriceUsd = priceUsd
        let remaining = bn(tx.amount)
        let totalProceeds = BN_ZERO
        let totalCostBasis = BN_ZERO
        const consumedLots: ConsumedLot[] = []

        while (remaining.gt(0) && lots.length > 0) {
          const oldest = lots[0]
          const consumed = BigNumber.min(oldest.amount, remaining)

          const costBasis = consumed.times(oldest.unitPriceUsd)
          const proceeds = consumed.times(sellPriceUsd)

          consumedLots.push({
            lotTransactionId: oldest.transactionId,
            amount: consumed,
            costBasisUsd: costBasis,
          })

          totalCostBasis = totalCostBasis.plus(costBasis)
          totalProceeds = totalProceeds.plus(proceeds)

          oldest.amount = oldest.amount.minus(consumed)
          remaining = remaining.minus(consumed)

          if (oldest.amount.lte(0)) {
            lots.shift()
          }
        }

        realized.push({
          transactionId: tx.id,
          date: tx.date,
          amount: bn(tx.amount),
          proceedsUsd: totalProceeds,
          costBasisUsd: totalCostBasis,
          realizedPnlUsd: totalProceeds.minus(totalCostBasis),
          lots: consumedLots,
        })
        break
      }

      case "transfer_out": {
        // Remove lots FIFO but do NOT record P&L.
        // The cost basis will be carried to the destination
        // via the transfer_in's unit_price (set during Component 4).
        let remaining = bn(tx.amount)
        while (remaining.gt(0) && lots.length > 0) {
          const oldest = lots[0]
          const consumed = BigNumber.min(oldest.amount, remaining)
          oldest.amount = oldest.amount.minus(consumed)
          remaining = remaining.minus(consumed)
          if (oldest.amount.lte(0)) {
            lots.shift()
          }
        }
        break
      }

      case "fee": {
        // Fee reduces balance. Treat as a realized loss.
        const feeCostUsd = bn(tx.amount).times(priceUsd)
        let remaining = bn(tx.amount)
        let totalCostBasis = BN_ZERO
        const consumedLots: ConsumedLot[] = []

        while (remaining.gt(0) && lots.length > 0) {
          const oldest = lots[0]
          const consumed = BigNumber.min(oldest.amount, remaining)
          const costBasis = consumed.times(oldest.unitPriceUsd)

          consumedLots.push({
            lotTransactionId: oldest.transactionId,
            amount: consumed,
            costBasisUsd: costBasis,
          })

          totalCostBasis = totalCostBasis.plus(costBasis)
          oldest.amount = oldest.amount.minus(consumed)
          remaining = remaining.minus(consumed)

          if (oldest.amount.lte(0)) {
            lots.shift()
          }
        }

        realized.push({
          transactionId: tx.id,
          date: tx.date,
          amount: bn(tx.amount),
          proceedsUsd: BN_ZERO, // fees have no proceeds
          costBasisUsd: totalCostBasis,
          realizedPnlUsd: feeCostUsd.negated(),
          lots: consumedLots,
        })
        break
      }
    }
  }

  return { lots, realized }
}

/**
 * Compute the weighted average cost of lots that would be consumed
 * by a transfer of the given amount. Used to set the unit_price on
 * the transfer_in transaction.
 */
export function computeTransferCostBasis(
  transactions: Transaction[],
  rates: ExchangeRate[],
  transferAmount: number,
): BigNumber {
  const { lots } = computeFIFOLots(transactions, rates)

  let remaining = bn(transferAmount)
  let totalCost = BN_ZERO
  let totalAmount = BN_ZERO

  for (const lot of lots) {
    if (remaining.lte(0)) break
    const consumed = BigNumber.min(lot.amount, remaining)
    totalCost = totalCost.plus(consumed.times(lot.unitPriceUsd))
    totalAmount = totalAmount.plus(consumed)
    remaining = remaining.minus(consumed)
  }

  return totalAmount.gt(0) ? totalCost.div(totalAmount) : BN_ZERO
}
