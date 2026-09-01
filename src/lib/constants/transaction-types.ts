import type { TransactionType } from "@/types/database"

export const TRANSACTION_TYPES = {
  BUY: "buy",
  SELL: "sell",
  TRANSFER_IN: "transfer_in",
  TRANSFER_OUT: "transfer_out",
  DIVIDEND: "dividend",
  INTEREST: "interest",
  FEE: "fee",
  TAX: "tax",
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
  TRANSACTION_TYPES.TAX,
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

/** Types whose amount may not exceed the platform balance (checked on create). */
export const BALANCE_LIMITED_TYPES = new Set<TransactionType>([
  TRANSACTION_TYPES.SELL,
  TRANSACTION_TYPES.TRANSFER_OUT,
  TRANSACTION_TYPES.FEE,
])

/** Auto-generated cash legs of a trade. Never user-picked: they exist only as
 *  the linked child of a buy/sell, booked against the fiat asset. */
export const CASH_LEG_TYPES = new Set<TransactionType>([
  TRANSACTION_TYPES.CASH_CREDIT,
  TRANSACTION_TYPES.CASH_DEBIT,
])

/** Parent types that may carry a linked child row. */
export const TYPES_WITH_LINKED_CHILD = new Set<TransactionType>([
  TRANSACTION_TYPES.BUY,
  TRANSACTION_TYPES.SELL,
])

/** Badge display for a linked transfer pair rendered as one combined row
 *  (a transfer_out whose linked child is its transfer_in). Neutral slate —
 *  the pair is an internal move, so it must not borrow transfer_in's inflow
 *  blue or transfer_out's outflow orange. */
export const TRANSFER_PAIR_DISPLAY = {
  label: "Transfer",
  color: "text-slate-700",
  bg: "bg-slate-100 border-slate-300",
}

/** Types selectable in the AddTransactionModal type picker. */
export const USER_PICKABLE_TYPES: TransactionType[] = [
  TRANSACTION_TYPES.BUY,
  TRANSACTION_TYPES.SELL,
  TRANSACTION_TYPES.TRANSFER_IN,
  TRANSACTION_TYPES.TRANSFER_OUT,
  TRANSACTION_TYPES.DIVIDEND,
  TRANSACTION_TYPES.INTEREST,
  TRANSACTION_TYPES.FEE,
  TRANSACTION_TYPES.TAX,
]

/** Per-type display label and Tailwind color classes — single source for
 *  every UI that renders a transaction type (selector, filter chips, badge). */
export const TRANSACTION_TYPE_DISPLAY: Record<
  TransactionType,
  { label: string; color: string; bg: string }
> = {
  buy: { label: "Buy", color: "text-green-700", bg: "bg-green-100 border-green-300" },
  sell: { label: "Sell", color: "text-red-700", bg: "bg-red-100 border-red-300" },
  transfer_in: { label: "Deposit", color: "text-blue-700", bg: "bg-blue-100 border-blue-300" },
  transfer_out: { label: "Withdrawal", color: "text-orange-700", bg: "bg-orange-100 border-orange-300" },
  dividend: { label: "Dividend", color: "text-purple-700", bg: "bg-purple-100 border-purple-300" },
  interest: { label: "Interest", color: "text-teal-700", bg: "bg-teal-100 border-teal-300" },
  fee: { label: "Fee", color: "text-gray-700", bg: "bg-gray-100 border-gray-300" },
  tax: { label: "Tax", color: "text-rose-700", bg: "bg-rose-100 border-rose-300" },
  cash_credit: { label: "Cash credit", color: "text-green-700", bg: "bg-green-100 border-green-300" },
  cash_debit: { label: "Cash debit", color: "text-red-700", bg: "bg-red-100 border-red-300" },
}

/** Derived (never stored) type used only by the Transactions page type filter:
 *  an internal transfer pair — a `transfer_out` whose linked child is a
 *  `transfer_in`. The database has no such enum value; the linkage alone
 *  encodes it, so the filter derives it instead of reading `type`. */
export const TRANSFER_PAIR_FILTER_TYPE = "transfer_pair"

/** What the Transactions page type chips filter on: a stored type, or the
 *  derived transfer pair. */
export type TransactionFilterType =
  | TransactionType
  | typeof TRANSFER_PAIR_FILTER_TYPE

/** Chips shown in the Transactions page type filter — the user-pickable stored
 *  types plus the derived Transfer pair, sitting right after the two
 *  directional transfers it is made of. */
export const FILTERABLE_TYPES: TransactionFilterType[] = [
  TRANSACTION_TYPES.BUY,
  TRANSACTION_TYPES.SELL,
  TRANSACTION_TYPES.TRANSFER_IN,
  TRANSACTION_TYPES.TRANSFER_OUT,
  TRANSFER_PAIR_FILTER_TYPE,
  TRANSACTION_TYPES.DIVIDEND,
  TRANSACTION_TYPES.INTEREST,
  TRANSACTION_TYPES.FEE,
  TRANSACTION_TYPES.TAX,
]

/** Label + colors for every filter chip: the per-type display, plus the
 *  combined-row display for the derived pair (one convention with the row
 *  badge, so chip and row read the same). */
export const FILTER_TYPE_DISPLAY: Record<
  TransactionFilterType,
  { label: string; color: string; bg: string }
> = {
  ...TRANSACTION_TYPE_DISPLAY,
  [TRANSFER_PAIR_FILTER_TYPE]: TRANSFER_PAIR_DISPLAY,
}
