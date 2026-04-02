import type { Transaction, ExchangeRate } from "@/types/database"
import type { CostLot, RealizedPnLEntry, FIFOResult, ConsumedLot } from "./types"
import { unitPriceToUsd } from "./currency"

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
          amount: tx.amount,
          unitPriceOriginal: tx.unit_price,
          priceCurrency: tx.price_currency,
          unitPriceUsd: priceUsd,
        })
        break
      }

      case "sell": {
        const sellPriceUsd = priceUsd
        let remaining = tx.amount
        let totalProceeds = 0
        let totalCostBasis = 0
        const consumedLots: ConsumedLot[] = []

        while (remaining > 0 && lots.length > 0) {
          const oldest = lots[0]
          const consumed = Math.min(oldest.amount, remaining)

          const costBasis = consumed * oldest.unitPriceUsd
          const proceeds = consumed * sellPriceUsd

          consumedLots.push({
            lotTransactionId: oldest.transactionId,
            amount: consumed,
            costBasisUsd: costBasis,
          })

          totalCostBasis += costBasis
          totalProceeds += proceeds

          oldest.amount -= consumed
          remaining -= consumed

          if (oldest.amount <= 0) {
            lots.shift()
          }
        }

        realized.push({
          transactionId: tx.id,
          date: tx.date,
          amount: tx.amount,
          proceedsUsd: totalProceeds,
          costBasisUsd: totalCostBasis,
          realizedPnlUsd: totalProceeds - totalCostBasis,
          lots: consumedLots,
        })
        break
      }

      case "transfer_out": {
        // Remove lots FIFO but do NOT record P&L.
        // The cost basis will be carried to the destination
        // via the transfer_in's unit_price (set during Component 4).
        let remaining = tx.amount
        while (remaining > 0 && lots.length > 0) {
          const oldest = lots[0]
          const consumed = Math.min(oldest.amount, remaining)
          oldest.amount -= consumed
          remaining -= consumed
          if (oldest.amount <= 0) {
            lots.shift()
          }
        }
        break
      }

      case "fee": {
        // Fee reduces balance. Treat as a realized loss.
        const feeCostUsd = tx.amount * priceUsd
        let remaining = tx.amount
        let totalCostBasis = 0
        const consumedLots: ConsumedLot[] = []

        while (remaining > 0 && lots.length > 0) {
          const oldest = lots[0]
          const consumed = Math.min(oldest.amount, remaining)
          const costBasis = consumed * oldest.unitPriceUsd

          consumedLots.push({
            lotTransactionId: oldest.transactionId,
            amount: consumed,
            costBasisUsd: costBasis,
          })

          totalCostBasis += costBasis
          oldest.amount -= consumed
          remaining -= consumed

          if (oldest.amount <= 0) {
            lots.shift()
          }
        }

        realized.push({
          transactionId: tx.id,
          date: tx.date,
          amount: tx.amount,
          proceedsUsd: 0, // fees have no proceeds
          costBasisUsd: totalCostBasis,
          realizedPnlUsd: -feeCostUsd,
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
): number {
  const { lots } = computeFIFOLots(transactions, rates)

  let remaining = transferAmount
  let totalCost = 0
  let totalAmount = 0

  for (const lot of lots) {
    if (remaining <= 0) break
    const consumed = Math.min(lot.amount, remaining)
    totalCost += consumed * lot.unitPriceUsd
    totalAmount += consumed
    remaining -= consumed
  }

  return totalAmount > 0 ? totalCost / totalAmount : 0
}
