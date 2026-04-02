export interface CostLot {
  /** Source transaction ID */
  transactionId: string
  date: string
  /** Remaining quantity in this lot */
  amount: number
  /** Original price in the transaction's currency */
  unitPriceOriginal: number
  priceCurrency: string
  /** Price normalized to USD using historical exchange rate */
  unitPriceUsd: number
}

export interface ConsumedLot {
  lotTransactionId: string
  amount: number
  costBasisUsd: number
}

export interface RealizedPnLEntry {
  transactionId: string
  date: string
  amount: number
  proceedsUsd: number
  costBasisUsd: number
  realizedPnlUsd: number
  lots: ConsumedLot[]
}

export interface FIFOResult {
  /** Remaining open lots (unsold) */
  lots: CostLot[]
  /** Realized P&L entries from sells */
  realized: RealizedPnLEntry[]
}

export interface UnrealizedPnLResult {
  costBasisUsd: number
  currentValueUsd: number
  unrealizedPnlUsd: number
  unrealizedPnlPct: number
}

export interface AssetPnL {
  assetId: string
  ticker: string
  category: string
  costBasisUsd: number
  currentValueUsd: number
  unrealizedPnlUsd: number
  unrealizedPnlPct: number
  realizedPnlUsd: number
  lots: CostLot[]
}

export interface PortfolioPnL {
  assetPnLs: AssetPnL[]
  totalCostBasisUsd: number
  totalCurrentValueUsd: number
  totalUnrealizedPnlUsd: number
  totalRealizedPnlUsd: number
}
