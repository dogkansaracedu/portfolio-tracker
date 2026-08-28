import {
  POSITIVE_TYPES,
  TRANSACTION_TYPES,
} from "@/lib/constants/transaction-types"
import { isFiatCurrency, type FiatCurrency } from "@/lib/constants/currencies"
import { convertOnDate, fromUsdOnDate } from "@/lib/pnl/currency"
import { BN_HUNDRED } from "@/lib/config"
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

const QUANTITY_FORMAT = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 8,
})

/** Quantity as the log rows render it (grouped, up to 8 decimals). */
export function formatTxQuantity(amount: number): string {
  return QUANTITY_FORMAT.format(amount)
}

export function formatTxDate(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

export interface TransactionDisplay {
  sign: string
  amountColor: string
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
  currency: "USD" | "TRY",
  realized: RealizedPnLEntry | null,
  rates: ExchangeRate[],
  /** A linked transfer pair rendered as one combined row is an internal move —
   *  neutral quantity, no sign, no gain/loss color. */
  opts?: { transferPair?: boolean },
): TransactionDisplay {
  const isPositive = POSITIVE_TYPES.includes(tx.type)
  const sign = opts?.transferPair ? "" : isPositive ? "" : "-"
  const amountColor = opts?.transferPair
    ? ""
    : isPositive
      ? "text-green-600"
      : "text-red-600"

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
  const realizedColor = usdIsGain ? "text-green-600" : "text-red-600"
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
  const realizedPct = realizedPctBn
    ? `${usdSign}${realizedPctBn.abs().toFixed(1)}%`
    : null
  const nativeIsUsd = nativeCurrency === "USD"

  return {
    sign,
    amountColor,
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
