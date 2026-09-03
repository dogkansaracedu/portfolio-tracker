import {
  CASH_LEG_TYPES,
  POSITIVE_TYPES,
  TRANSACTION_TYPES,
  TRANSFER_PAIR_FILTER_TYPE,
  type TransactionFilterType,
} from "@/lib/constants/transaction-types"
import { type DisplayCurrency, isFiatCurrency, type FiatCurrency } from "@/lib/constants/currencies"
import { convertOnDate, fromUsdOnDate } from "@/lib/pnl/currency"
import { BN_HUNDRED, DECIMALS } from "@/lib/config"
import { DISPLAY_LOCALE } from "@/lib/constants/app"
import { formatSignedPercent, gainLossClass } from "@/lib/prices"
import type { TransactionWithDetails } from "@/lib/queries/transactions"
import type { RealizedPnLEntry } from "@/lib/pnl/types"
import type { ExchangeRate } from "@/types/database"

/** Fold linked transfer pairs for display: drop a transfer_in whose
 *  transfer_out parent is visible in the same list — the parent renders as the
 *  combined "source → destination" row. A transfer_in whose parent is NOT in
 *  the list (lone deposit, or the filter matched only the destination side)
 *  stays as its own row. */
export function collapseLinkedTransferIns<
  T extends Pick<TransactionWithDetails, "id" | "type" | "linked_tx_id">,
>(rows: T[]): T[] {
  const visibleIds = new Set(rows.map((tx) => tx.id))
  return rows.filter(
    (tx) =>
      !(
        tx.type === TRANSACTION_TYPES.TRANSFER_IN &&
        tx.linked_tx_id &&
        visibleIds.has(tx.linked_tx_id)
      ),
  )
}

/** Drop the auto-generated cash legs of trades (`cash_credit`/`cash_debit`).
 *  Used by the single-asset view: drilling into a fiat holding otherwise shows
 *  a wall of context-free cash rows, because a trade's cash leg is booked
 *  against the fiat asset while the trade itself lives on the traded asset.
 *  The Transactions page keeps them — that is the full audit trail. */
export function dropCashLegs<T extends Pick<TransactionWithDetails, "type">>(
  rows: T[],
): T[] {
  return rows.filter((tx) => !CASH_LEG_TYPES.has(tx.type))
}

const QUANTITY_FORMAT = new Intl.NumberFormat(DISPLAY_LOCALE, {
  minimumFractionDigits: 0,
  maximumFractionDigits: 8,
})

/** Quantity as the log rows render it (grouped, up to 8 decimals). */
export function formatTxQuantity(amount: number): string {
  return QUANTITY_FORMAT.format(amount)
}

export function formatTxDate(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString(DISPLAY_LOCALE, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

export interface TransactionDisplay {
  sign: string
  nativeCurrency: FiatCurrency
  convertedTotal: number | null
  convertedUnitPrice: number | null
  showRealized: boolean
  realizedColor: string
  usdSign: string
  realizedUsdAbs: number
  nativeSign: string
  realizedNativeAbs: number
  realizedPct: string | null
  nativeIsUsd: boolean
}

// Mirrors the derivation that used to live inline in TransactionRow. USD is the
// source of truth for realized returns; the % and the whole realized sub-line's
// color follow the USD sign (a position up in lira can be down in dollars).
export function deriveTransactionDisplay(
  tx: TransactionWithDetails,
  currency: DisplayCurrency,
  realized: RealizedPnLEntry | null,
  rates: ExchangeRate[],
  /** A linked transfer pair rendered as one combined row is an internal move —
   *  neutral quantity, no sign, no gain/loss color. */
  opts?: { transferPair?: boolean },
): TransactionDisplay {
  // The quantity carries direction with its ASCII sign only — never the
  // gain/loss palette. A sale is not a loss, and on this page the palette is
  // reserved for the realized P&L sub-line.
  const isPositive = POSITIVE_TYPES.includes(tx.type)
  const sign = opts?.transferPair ? "" : isPositive ? "" : "-"

  const nativeCurrency: FiatCurrency = isFiatCurrency(tx.price_currency)
    ? tx.price_currency
    : currency
  const showConverted = nativeCurrency !== currency && rates.length > 0
  const convertedTotal = showConverted
    ? convertOnDate(tx.total_cost, nativeCurrency, currency, tx.date, rates).toNumber()
    : null
  const convertedUnitPrice = showConverted
    ? convertOnDate(tx.unit_price, nativeCurrency, currency, tx.date, rates).toNumber()
    : null

  const showRealized = tx.type === TRANSACTION_TYPES.SELL && realized != null
  const realizedPnlUsd = realized?.realizedPnlUsd ?? null
  const usdIsGain = realizedPnlUsd ? realizedPnlUsd.gte(0) : false
  const usdSign = usdIsGain ? "" : "-"
  const realizedColor = gainLossClass(usdIsGain)
  const realizedUsdAbs = realizedPnlUsd ? realizedPnlUsd.abs().toNumber() : 0

  const nativePnlBn =
    realized?.nativePnl != null && realized.nativeCurrency === nativeCurrency
      ? realized.nativePnl
      : realizedPnlUsd
        ? fromUsdOnDate(realizedPnlUsd, nativeCurrency, tx.date, rates)
        : null
  const nativeSign = nativePnlBn?.gte(0) ? "" : "-"
  const realizedNativeAbs = nativePnlBn ? nativePnlBn.abs().toNumber() : 0

  const realizedPctBn =
    realized && realized.costBasisUsd.gt(0)
      ? realized.realizedPnlUsd.div(realized.costBasisUsd).times(BN_HUNDRED)
      : null
  // A return %, so it carries the app-wide 2 dp — the same precision the
  // Portfolio and Asset Detail returns use.
  const realizedPct = realizedPctBn
    ? formatSignedPercent(realizedPctBn.toNumber(), DECIMALS.percentage)
    : null
  const nativeIsUsd = nativeCurrency === "USD"

  return {
    sign,
    nativeCurrency,
    convertedTotal,
    convertedUnitPrice,
    showRealized,
    realizedColor,
    usdSign,
    realizedUsdAbs,
    nativeSign,
    realizedNativeAbs,
    realizedPct,
    nativeIsUsd,
  }
}

/** Ids of the `transfer_out` rows that own a linked `transfer_in` child — i.e.
 *  the parents of internal transfer pairs. Only the child carries the link, so
 *  "is this an internal transfer?" can only be answered by looking at the other
 *  side; derive the set once from the **full** history so the answer never
 *  depends on which rows the current date/asset/platform filters fetched. */
export function transferPairParentIds<
  T extends Pick<TransactionWithDetails, "type" | "linked_tx_id">,
>(allTransactions: T[]): Set<string> {
  const ids = new Set<string>()
  for (const tx of allTransactions) {
    if (tx.type === TRANSACTION_TYPES.TRANSFER_IN && tx.linked_tx_id) {
      ids.add(tx.linked_tx_id)
    }
  }
  return ids
}

/** Does a row match one type filter chip? Matching is on the **derived** type,
 *  not the stored enum: an internal transfer pair is its own thing, so
 *  - Transfer   → either side of a linked pair (both sides so a destination-only
 *                 filter still surfaces it; when both are visible the collapse
 *                 folds them into the one combined row),
 *  - Withdrawal → a lone `transfer_out` (no linked `transfer_in` child),
 *  - Deposit    → a lone `transfer_in` (not the child of a pair).
 *  Every other chip is a plain stored-type match. */
export function matchesFilterType<
  T extends Pick<TransactionWithDetails, "id" | "type" | "linked_tx_id">,
>(tx: T, filterType: TransactionFilterType, pairParentIds: Set<string>): boolean {
  switch (filterType) {
    case TRANSFER_PAIR_FILTER_TYPE:
      return (
        (tx.type === TRANSACTION_TYPES.TRANSFER_OUT && pairParentIds.has(tx.id)) ||
        (tx.type === TRANSACTION_TYPES.TRANSFER_IN && tx.linked_tx_id != null)
      )
    case TRANSACTION_TYPES.TRANSFER_OUT:
      return tx.type === TRANSACTION_TYPES.TRANSFER_OUT && !pairParentIds.has(tx.id)
    case TRANSACTION_TYPES.TRANSFER_IN:
      return tx.type === TRANSACTION_TYPES.TRANSFER_IN && tx.linked_tx_id == null
    default:
      return tx.type === filterType
  }
}

/** Multi-select variant: a row matches when any active chip matches it. */
export function matchesAnyFilterType<
  T extends Pick<TransactionWithDetails, "id" | "type" | "linked_tx_id">,
>(
  tx: T,
  filterTypes: TransactionFilterType[],
  pairParentIds: Set<string>,
): boolean {
  return filterTypes.some((type) => matchesFilterType(tx, type, pairParentIds))
}
