import type { TransactionType } from "@/types/database"

export const TRANSACTION_TYPES = {
  BUY: "buy",
  SELL: "sell",
  TRANSFER_IN: "transfer_in",
  TRANSFER_OUT: "transfer_out",
  DIVIDEND: "dividend",
  INTEREST: "interest",
  FEE: "fee",
  CASH_CREDIT: "cash_credit",
  CASH_DEBIT: "cash_debit",
} as const satisfies Record<string, TransactionType>

/** Types whose `amount` adds to a holding's balance. */
export const ADD_TYPES = new Set<TransactionType>([
  TRANSACTION_TYPES.BUY,
  TRANSACTION_TYPES.TRANSFER_IN,
  TRANSACTION_TYPES.DIVIDEND,
  TRANSACTION_TYPES.INTEREST,
  TRANSACTION_TYPES.CASH_CREDIT,
])

/** Types whose `amount` subtracts from a holding's balance. */
export const SUBTRACT_TYPES = new Set<TransactionType>([
  TRANSACTION_TYPES.SELL,
  TRANSACTION_TYPES.TRANSFER_OUT,
  TRANSACTION_TYPES.FEE,
  TRANSACTION_TYPES.CASH_DEBIT,
])

/** Types rendered with a positive (green) sign in the transactions list. */
export const POSITIVE_TYPES: TransactionType[] = [
  TRANSACTION_TYPES.BUY,
  TRANSACTION_TYPES.TRANSFER_IN,
  TRANSACTION_TYPES.DIVIDEND,
  TRANSACTION_TYPES.INTEREST,
  TRANSACTION_TYPES.CASH_CREDIT,
]

/** Auto-paired child types — never directly user-creatable. */
export const CASH_TYPES = new Set<TransactionType>([
  TRANSACTION_TYPES.CASH_CREDIT,
  TRANSACTION_TYPES.CASH_DEBIT,
])

/** Parent types that may carry a linked child row. */
export const TYPES_WITH_LINKED_CHILD = new Set<TransactionType>([
  TRANSACTION_TYPES.BUY,
  TRANSACTION_TYPES.SELL,
])

/** Types selectable in the AddTransactionModal type picker. */
export const USER_PICKABLE_TYPES: TransactionType[] = [
  TRANSACTION_TYPES.BUY,
  TRANSACTION_TYPES.SELL,
  TRANSACTION_TYPES.TRANSFER_IN,
  TRANSACTION_TYPES.TRANSFER_OUT,
  TRANSACTION_TYPES.DIVIDEND,
  TRANSACTION_TYPES.INTEREST,
  TRANSACTION_TYPES.FEE,
]

/** Per-type display label and Tailwind color classes — single source for
 *  every UI that renders a transaction type (selector, filter chips, badge). */
export const TRANSACTION_TYPE_DISPLAY: Record<
  TransactionType,
  { label: string; color: string; bg: string }
> = {
  buy: { label: "Buy", color: "text-green-700", bg: "bg-green-100 border-green-300" },
  sell: { label: "Sell", color: "text-red-700", bg: "bg-red-100 border-red-300" },
  transfer_in: { label: "Transfer In", color: "text-blue-700", bg: "bg-blue-100 border-blue-300" },
  transfer_out: { label: "Transfer Out", color: "text-orange-700", bg: "bg-orange-100 border-orange-300" },
  dividend: { label: "Dividend", color: "text-purple-700", bg: "bg-purple-100 border-purple-300" },
  interest: { label: "Interest", color: "text-teal-700", bg: "bg-teal-100 border-teal-300" },
  fee: { label: "Fee", color: "text-gray-700", bg: "bg-gray-100 border-gray-300" },
  cash_credit: { label: "Cash credit", color: "text-green-700", bg: "bg-green-100 border-green-300" },
  cash_debit: { label: "Cash debit", color: "text-red-700", bg: "bg-red-100 border-red-300" },
}
