import type { Transaction, ExchangeRate } from "@/types/database"
import type { RealizedPnLEntry } from "./types"
import { computeFIFOLots } from "./fifo"

/**
 * Build a `transactionId → RealizedPnLEntry` lookup for every realizing
 * transaction (sells, and fees) across the full transaction history.
 *
 * FIFO is computed per (asset, platform) pair — the same composite key
 * `usePnL` uses — because lots only match within a single holding. The caller
 * MUST pass the *full, unfiltered* transaction set: matching a sell against the
 * oldest open lots requires the asset's complete prior history, so computing
 * over a filtered view (e.g. the Transactions page's date/type filters) would
 * produce wrong cost bases. Consumers join the result back to displayed rows
 * by `tx.id`.
 *
 * Each entry's `realizedPnlUsd` is already net of fees and denominated in USD.
 */
export function buildRealizedByTx(
  transactions: Transaction[],
  rates: ExchangeRate[],
): Map<string, RealizedPnLEntry> {
  const groups = new Map<string, Transaction[]>()
  for (const tx of transactions) {
    const key = `${tx.asset_id}|${tx.platform_id}`
    const group = groups.get(key)
    if (group) group.push(tx)
    else groups.set(key, [tx])
  }

  const byTx = new Map<string, RealizedPnLEntry>()
  for (const group of groups.values()) {
    const { realized } = computeFIFOLots(group, rates)
    for (const entry of realized) {
      byTx.set(entry.transactionId, entry)
    }
  }

  return byTx
}
