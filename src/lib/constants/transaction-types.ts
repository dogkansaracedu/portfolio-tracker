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
