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
): TransactionDisplay {
  const isPositive = POSITIVE_TYPES.includes(tx.type)
  const sign = isPositive ? "+" : "-"
  const amountColor = isPositive ? "text-green-600" : "text-red-600"

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
  const usdSign = usdIsGain ? "+" : "-"
  const realizedColor = usdIsGain ? "text-green-600" : "text-red-600"
  const realizedUsdAbs = realizedPnlUsd ? realizedPnlUsd.abs().toNumber() : 0

  const nativePnlBn =
    realized?.nativePnl != null && realized.nativeCurrency === nativeCurrency
      ? realized.nativePnl
      : realizedPnlUsd
        ? fromUsdOnDate(realizedPnlUsd, nativeCurrency, tx.date, rates)
        : null
  const nativeSign = nativePnlBn?.gte(0) ? "+" : "-"
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
