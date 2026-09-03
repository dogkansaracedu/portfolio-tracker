import { useMemo } from "react"
import { useDisplayCurrency } from "@/contexts/DisplayContext"
import { usePrices } from "@/hooks/usePrices"
import { bn } from "@/lib/config"
import { formatMoney, formatSignedMoney } from "@/lib/prices"
import type { FiatCurrency } from "@/lib/constants/currencies"

/**
 * The display edge for USD-anchored figures. Every P&L number in this app is
 * computed in USD (the anchor never moves); this hook is the single place that
 * re-denominates one for display when the user is in TRY, so a row can never
 * show its value in ₺ beside its P&L in $.
 *
 * Presentation only: nothing here feeds a computation. Conversion is at today's
 * rate — the same rate the dashboard hero uses for its own USD→TRY figures.
 */
export interface DisplayMoney {
  currency: FiatCurrency
  obfuscated: boolean
  /** A USD amount as a plain number in the display currency. */
  fromUsd: (usd: number) => number
  /** A USD amount, formatted in the display currency, obfuscation-aware. */
  money: (usd: number) => string
  /** As {@link money}, with the signed convention (losses lead with a minus). */
  signedMoney: (usd: number) => string
  /** An amount ALREADY in the display currency, formatted + obfuscation-aware. */
  display: (value: number) => string
}

export function useDisplayMoney(): DisplayMoney {
  const { currency, obfuscated } = useDisplayCurrency()
  const { rates } = usePrices()
  const usdTry = rates?.usd_try ?? 0

  return useMemo(() => {
    const fromUsd = (usd: number) =>
      currency === "USD" ? usd : bn(usd).times(bn(usdTry)).toNumber()
    return {
      currency,
      obfuscated,
      fromUsd,
      money: (usd: number) => formatMoney(fromUsd(usd), currency, obfuscated),
      signedMoney: (usd: number) =>
        formatSignedMoney(fromUsd(usd), currency, obfuscated),
      display: (value: number) => formatMoney(value, currency, obfuscated),
    }
  }, [currency, obfuscated, usdTry])
}
