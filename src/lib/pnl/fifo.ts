import BigNumber from "bignumber.js"
import type { Transaction, ExchangeRate } from "@/types/database"
import type { CostLot, RealizedPnLEntry, FIFOResult, ConsumedLot } from "./types"
import { unitPriceToUsd, normalizeToUsd } from "./currency"
import { bn, BN_ZERO } from "@/lib/config"

export interface FIFOOptions {
  /**
   * Fiat mode, for currency holdings (EUR/TRY/USD cash). Same lot mechanics,
   * three differences (docs/pnl-test-cases.md Cases 27–30):
   * - every outflow (`transfer_out`, `cash_debit`) consumes FIFO and BOOKS
   *   REALIZED = market USD value − consumed lots' cost, so departed cash
   *   locks its FX gain instead of leaving it in the remaining pile;
   * - `tax` consumes FIFO and books the consumed cost as a realized loss
   *   (net invested stays put — the charge is a cost, not a flow);
   * - a disposal that finds no lots borrows the shortfall at its own market
   *   rate (owed negative basis) instead of booking a phantom gain — estimated
   *   cash histories (Midas) have outflows recorded before their inflows; the
   *   next inflow repays the owed units, booking only the rate gap.
   */
  fiat?: boolean
}

/**
 * FIFO cost basis engine.
 *
 * Takes all transactions for a SINGLE asset, sorted by date ASC,
 * and computes the remaining cost lots and realized P&L entries.
 */
export function computeFIFOLots(
  transactions: Transaction[],
  rates: ExchangeRate[],
  opts: FIFOOptions = {},
): FIFOResult {
  const fiat = opts.fiat === true
  const lots: CostLot[] = []
  const realized: RealizedPnLEntry[] = []
  // Fiat mode only: units disposed while no lots were open, carried as
  // negative basis at the rate they were borrowed at.
  let owedUnits = BN_ZERO
  let owedCostUsd = BN_ZERO

  /**
   * Consume `amount` units oldest-first. In fiat mode a shortfall (lots ran
   * dry) is borrowed at `marketUnitPriceUsd` and counted in the cost basis at
   * that rate, so the disposal stays P&L-neutral on the unrecorded portion.
   * Outside fiat mode the shortfall is silently dropped (pre-existing
   * behavior for non-currency holdings).
   */
  function consume(
    amount: BigNumber,
    marketUnitPriceUsd: BigNumber,
    nativeCurrency?: string,
  ) {
    let remaining = amount
    let costBasisUsd = BN_ZERO
    let costBasisNative = BN_ZERO
    let nativeConsistent = true
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

      costBasisUsd = costBasisUsd.plus(costBasis)
      costBasisNative = costBasisNative.plus(
        consumed.times(oldest.unitPriceOriginal),
      )
      if (
        nativeCurrency !== undefined &&
        oldest.priceCurrency !== nativeCurrency
      ) {
        nativeConsistent = false
      }
      oldest.amount = oldest.amount.minus(consumed)
      remaining = remaining.minus(consumed)

      if (oldest.amount.lte(0)) {
        lots.shift()
      }
    }

    if (fiat && remaining.gt(0)) {
      // Borrow the shortfall at the disposal's own market rate.
      owedUnits = owedUnits.plus(remaining)
      owedCostUsd = owedCostUsd.plus(remaining.times(marketUnitPriceUsd))
      costBasisUsd = costBasisUsd.plus(remaining.times(marketUnitPriceUsd))
      nativeConsistent = false
    }

    return { costBasisUsd, costBasisNative, consumedLots, nativeConsistent }
  }

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
      case "interest":
      // A cash_credit reaches FIFO on a stablecoin settlement holding (leg
      // carries unit_price = 1 USD, so the lot books at the peg) and, in fiat
      // mode, on the currency holding a sale's proceeds land on.
      case "cash_credit": {
        // Capitalize trade fees into the cost basis of the new lot so unrealized
        // P&L reflects the true acquisition cost (industry standard). Without
        // this, fees would silently disappear — neither in cost basis nor in
        // realized P&L. transfer_in/dividend/interest don't usually have fees,
        // but we handle defensively if present.
        const baseAmount = bn(tx.amount)
        const lotCostUsd = baseAmount.times(priceUsd)
        const feeUsd = tx.fee
          ? normalizeToUsd(
              tx.fee,
              tx.fee_currency ?? tx.price_currency,
              tx.date,
              rates,
            )
          : BN_ZERO
        const adjustedUnitPriceUsd = baseAmount.gt(0)
          ? lotCostUsd.plus(feeUsd).div(baseAmount)
          : priceUsd

        let pushAmount = baseAmount
        if (fiat && owedUnits.gt(0) && baseAmount.gt(0)) {
          // Repay borrowed units first; only the rate gap between borrow and
          // repayment is P&L (zero on all-USD groups).
          const repay = BigNumber.min(baseAmount, owedUnits)
          const avgOwedUsd = owedCostUsd.div(owedUnits)
          const borrowedAtUsd = repay.times(avgOwedUsd)
          const repaidAtUsd = repay.times(adjustedUnitPriceUsd)
          owedUnits = owedUnits.minus(repay)
          owedCostUsd = owedCostUsd.minus(borrowedAtUsd)
          pushAmount = baseAmount.minus(repay)
          const gap = borrowedAtUsd.minus(repaidAtUsd)
          if (!gap.isZero()) {
            realized.push({
              transactionId: tx.id,
              date: tx.date,
              amount: repay,
              proceedsUsd: borrowedAtUsd,
              costBasisUsd: repaidAtUsd,
              realizedPnlUsd: gap,
              lots: [],
            })
          }
        }

        if (pushAmount.gt(0)) {
          lots.push({
            transactionId: tx.id,
            date: tx.date,
            amount: pushAmount,
            unitPriceOriginal: bn(tx.unit_price),
            priceCurrency: tx.price_currency,
            unitPriceUsd: adjustedUnitPriceUsd,
          })
        }
        break
      }

      case "sell": {
        const sellPriceUsd = priceUsd
        // Native-currency cost basis is valid only while every consumed lot is
        // denominated in the sell's own currency (see nativePnl on the entry).
        const { costBasisUsd, costBasisNative, consumedLots, nativeConsistent } =
          consume(bn(tx.amount), sellPriceUsd, tx.price_currency)
        const totalProceeds = bn(tx.amount).times(sellPriceUsd)

        // Capitalize sell fees by subtracting them from proceeds — symmetric
        // with the buy-side treatment.
        const sellFeeUsd = tx.fee
          ? normalizeToUsd(
              tx.fee,
              tx.fee_currency ?? tx.price_currency,
              tx.date,
              rates,
            )
          : BN_ZERO
        const netProceedsUsd = totalProceeds.minus(sellFeeUsd)

        // Exact native P&L: proceeds − fee − cost basis, all in the sell's
        // currency. Only meaningful when the consumed lots share that currency
        // and the fee (if any) is in it too — otherwise we'd be summing across
        // currencies, so we omit it and let the caller convert from USD.
        const feeCurrency = tx.fee_currency ?? tx.price_currency
        const feeSameCurrency = !tx.fee || feeCurrency === tx.price_currency
        const nativeValid = nativeConsistent && feeSameCurrency
        const proceedsNative = bn(tx.amount).times(bn(tx.unit_price))
        const feeNative = tx.fee ? bn(tx.fee) : BN_ZERO
        const realizedPnlNative = proceedsNative
          .minus(feeNative)
          .minus(costBasisNative)

        realized.push({
          transactionId: tx.id,
          date: tx.date,
          amount: bn(tx.amount),
          proceedsUsd: netProceedsUsd,
          costBasisUsd,
          realizedPnlUsd: netProceedsUsd.minus(costBasisUsd),
          nativePnl: nativeValid ? realizedPnlNative : undefined,
          nativeCurrency: nativeValid ? tx.price_currency : undefined,
          lots: consumedLots,
        })
        break
      }

      case "transfer_out":
      // A cash_debit on a stablecoin settlement holding disposes at the $1
      // peg with ~$1 lots underneath — realized P&L on a stablecoin spend is
      // zero by convention (see docs/prior-art/stablecoin-settled-trades.md),
      // so it consumes lots exactly like a transfer_out.
      case "cash_debit": {
        if (!fiat) {
          // Remove lots FIFO but do NOT record P&L.
          // The cost basis will be carried to the destination
          // via the transfer_in's unit_price (set during Component 4).
          consume(bn(tx.amount), priceUsd)
          break
        }
        // Fiat mode: every outflow (withdrawal, currency conversion, cash
        // spent on a buy) locks in the FX gain/loss on the departed units:
        // realized = market USD value − consumed lots' cost. A transfer whose
        // legs record market-at-date (the currency auto-fill) realizes at the
        // move date; legs carrying cost would make this a pure carry
        // (market = cost ⇒ $0). USD spends are the degenerate case ($1 = $1).
        const marketUsd = bn(tx.amount).times(priceUsd)
        const { costBasisUsd, consumedLots } = consume(bn(tx.amount), priceUsd)
        realized.push({
          transactionId: tx.id,
          date: tx.date,
          amount: bn(tx.amount),
          proceedsUsd: marketUsd,
          costBasisUsd,
          realizedPnlUsd: marketUsd.minus(costBasisUsd),
          lots: consumedLots,
        })
        break
      }

      case "tax": {
        // Only meaningful on fiat holdings (stopaj charged to a cash balance).
        // Neutral to net invested; the money the tax office took surfaces as
        // a realized loss equal to the consumed lots' cost (Case 23).
        if (!fiat) break
        const { costBasisUsd, consumedLots } = consume(bn(tx.amount), priceUsd)
        realized.push({
          transactionId: tx.id,
          date: tx.date,
          amount: bn(tx.amount),
          proceedsUsd: BN_ZERO,
          costBasisUsd,
          realizedPnlUsd: costBasisUsd.negated(),
          lots: consumedLots,
        })
        break
      }

      case "fee": {
        if (fiat) {
          // A standalone fee on a cash balance: pure cost, booked once as a
          // realized loss; lots stay (the balance drop lands in unrealized
          // via valuation). Mirrors applyTxToInvested's fee charge so the
          // decomposition reconciles. Zero occurrences today (Case 21).
          const feeUsd = tx.fee
            ? normalizeToUsd(
                tx.fee,
                tx.fee_currency ?? tx.price_currency,
                tx.date,
                rates,
              )
            : BN_ZERO
          const chargeUsd = feeUsd.isZero()
            ? normalizeToUsd(tx.total_cost ?? 0, tx.price_currency, tx.date, rates)
            : feeUsd
          realized.push({
            transactionId: tx.id,
            date: tx.date,
            amount: bn(tx.amount),
            proceedsUsd: BN_ZERO,
            costBasisUsd: BN_ZERO,
            realizedPnlUsd: chargeUsd.negated(),
            lots: [],
          })
          break
        }
        // Fees are modeled two-sidedly: we consume FIFO lots (so the
        // remaining cost basis stays correct) AND record a realized loss
        // equal to the fee's *current* market value (-feeCostUsd). When
        // cost basis ≠ market value at the time of the fee, this slightly
        // double-counts the gap on that fee unit — kept intentionally for
        // self-consistency: the consumed lots zero out, and the loss
        // reflects what was actually paid in today's terms.
        const feeCostUsd = bn(tx.amount).times(priceUsd)
        const { costBasisUsd, consumedLots } = consume(bn(tx.amount), priceUsd)

        realized.push({
          transactionId: tx.id,
          date: tx.date,
          amount: bn(tx.amount),
          proceedsUsd: BN_ZERO, // fees have no proceeds
          costBasisUsd,
          realizedPnlUsd: feeCostUsd.negated(),
          lots: consumedLots,
        })
        break
      }
    }
  }

  return { lots, realized, fiatOwedCostUsd: fiat ? owedCostUsd : undefined }
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
