import { useMemo } from "react"
import { useTransactionData } from "@/contexts/TransactionDataContext"
import { buildRealizedByTx } from "@/lib/pnl/realized"
import type { RealizedPnLEntry } from "@/lib/pnl/types"

/**
 * `transactionId → RealizedPnLEntry` for every realizing transaction, computed
 * via FIFO over the full transaction history (the global source of truth, not
 * any filtered slice). Consumers join entries to displayed rows by `tx.id`.
 *
 * Returns an empty map while the source data is still loading.
 */
export function useRealizedPnL(): Map<string, RealizedPnLEntry> {
  const { transactions, rates, loading } = useTransactionData()

  return useMemo(() => {
    if (loading) return new Map<string, RealizedPnLEntry>()
    return buildRealizedByTx(transactions, rates)
  }, [transactions, rates, loading])
}
