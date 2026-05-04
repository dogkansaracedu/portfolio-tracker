import BigNumber from "bignumber.js"

export interface CostLot {
  /** Source transaction ID */
  transactionId: string
  date: string
  /** Remaining quantity in this lot */
  amount: BigNumber
  /** Original price in the transaction's currency */
  unitPriceOriginal: BigNumber
  priceCurrency: string
  /** Price normalized to USD using historical exchange rate */
  unitPriceUsd: BigNumber
}

export interface ConsumedLot {
  lotTransactionId: string
  amount: BigNumber
  costBasisUsd: BigNumber
}

export interface RealizedPnLEntry {
  transactionId: string
  date: string
  amount: BigNumber
  proceedsUsd: BigNumber
  costBasisUsd: BigNumber
  realizedPnlUsd: BigNumber
  lots: ConsumedLot[]
}

export interface FIFOResult {
  /** Remaining open lots (unsold) */
  lots: CostLot[]
  /** Realized P&L entries from sells */
  realized: RealizedPnLEntry[]
}

export interface UnrealizedPnLResult {
  costBasisUsd: BigNumber
  currentValueUsd: BigNumber
  unrealizedPnlUsd: BigNumber
  unrealizedPnlPct: BigNumber
}

export interface AssetPnL {
  assetId: string
  ticker: string
  category: string
  costBasisUsd: BigNumber
  currentValueUsd: BigNumber
  unrealizedPnlUsd: BigNumber
  unrealizedPnlPct: BigNumber
  realizedPnlUsd: BigNumber
  lots: CostLot[]
}

export interface PortfolioPnL {
  assetPnLs: AssetPnL[]
  totalCostBasisUsd: BigNumber
  totalCurrentValueUsd: BigNumber
  totalUnrealizedPnlUsd: BigNumber
  totalRealizedPnlUsd: BigNumber
  /**
   * Cash-flow net invested capital (buys + fees − sells − dividends, with
   * transfers cancelling). Same denominator the Dashboard P&L card uses, so
   * surfaces using this for the % match exactly.
   */
  totalInvestedUsd: BigNumber
}
