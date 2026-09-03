import { useTransactionData } from "@/contexts/TransactionDataContext"
import {
  deriveTransactionDisplay,
  isTransferPair,
  type TransactionRowProps,
} from "@/components/transactions/transactionRowModel"

/**
 * The display model both layouts render from: whether this row is a folded
 * transfer pair, and the figures derived for it. The rates come from the shared
 * transaction store, so neither layout fetches its own.
 */
export function useTransactionRowDisplay({
  transaction,
  linkedChild,
  currency,
  realized,
}: TransactionRowProps) {
  const { rates } = useTransactionData()
  const transferPair = isTransferPair(transaction, linkedChild ?? null)
  return {
    transferPair,
    display: deriveTransactionDisplay(
      transaction,
      currency,
      realized ?? null,
      rates,
      { transferPair },
    ),
  }
}
