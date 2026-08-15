import { useCallback, useMemo } from "react"
import type BigNumber from "bignumber.js"
import { useDisplayCurrency } from "@/contexts/DisplayContext"
import { usePrices } from "@/hooks/usePrices"
import { CURRENCY_CONFIG } from "@/lib/config"
import { MONTHS_PER_YEAR, toReal } from "@/lib/retirement"
import {
  formatCurrency,
  formatSignedCurrency,
  obfuscate,
} from "@/lib/prices"
import { EMPTY_FIGURE, VALUE_VIEW, type ValueView } from "./constants"

/**
 * The display edge of the retirement views: BigNumber USD in, formatted string
 * (or a plain chart number) out. Three conventions meet here — the nominal/real
 * toggle (a re-derivation, never a stored change), the display currency, and
 * amount obfuscation (percentages and durations stay visible).
 */

/** Compact axis tick — the retirement horizon reaches millions. */
function compactMoney(value: number, symbol: string): string {
  const abs = Math.abs(value)
  const sign = value < 0 ? "-" : ""
  const trim = (s: string) => s.replace(/\.0$/, "")
  if (abs >= 1_000_000) {
    const v = abs / 1_000_000
    return `${sign}${symbol}${trim(v.toFixed(v < 10 ? 1 : 0))}M`
  }
  if (abs >= 1_000) {
    const v = abs / 1_000
    return `${sign}${symbol}${trim(v.toFixed(v < 10 ? 1 : 0))}k`
  }
  return `${sign}${symbol}${abs.toFixed(0)}`
}

/** "12 years 4 months" / "8 months" / "now". */
export function formatMonthsDuration(months: number): string {
  const whole = Math.max(0, Math.round(months))
  if (whole === 0) return "now"
  const years = Math.floor(whole / MONTHS_PER_YEAR)
  const rest = whole % MONTHS_PER_YEAR
  const parts: string[] = []
  if (years > 0) parts.push(`${years} year${years === 1 ? "" : "s"}`)
  if (rest > 0) parts.push(`${rest} month${rest === 1 ? "" : "s"}`)
  return parts.join(" ")
}

/** Ages are plain numbers but need not be whole ("62.5" stays "62.5"). */
export function formatAge(age: number): string {
  return Number.isInteger(age) ? String(age) : String(Number(age.toFixed(1)))
}

export function formatYearsFromMonths(months: number | null): string {
  if (months === null) return EMPTY_FIGURE
  return formatMonthsDuration(months)
}

export interface RetirementDisplay {
  currency: "USD" | "TRY"
  isReal: boolean
  /** Nominal USD → the viewed USD amount (real applies the inflation deflator). */
  toViewUsd: (nominalUsd: BigNumber, monthsFromNow: number) => BigNumber
  /** Nominal USD → a plain number in the display currency, for chart geometry. */
  chartValue: (nominalUsd: BigNumber, monthsFromNow: number) => number
  /** Formatted, obfuscation-aware money from a nominal USD amount. */
  money: (nominalUsd: BigNumber | null, monthsFromNow?: number) => string
  signedMoney: (nominalUsd: BigNumber | null, monthsFromNow?: number) => string
  /** Formats a value already converted by `chartValue` (tooltips, axis). */
  moneyFromChartValue: (value: number) => string
  axisTick: (value: number) => string
}

export function useRetirementDisplay(
  usdInflationPct: number,
  valueView: ValueView,
): RetirementDisplay {
  const { currency, obfuscated } = useDisplayCurrency()
  const { rates } = usePrices()
  const usdTry = rates?.usd_try ?? 0
  const isReal = valueView === VALUE_VIEW.real

  const toViewUsd = useCallback(
    (nominalUsd: BigNumber, monthsFromNow: number) =>
      isReal ? toReal(nominalUsd, monthsFromNow, usdInflationPct) : nominalUsd,
    [isReal, usdInflationPct],
  )

  const toDisplayNumber = useCallback(
    (usd: BigNumber) =>
      currency === "USD" ? usd.toNumber() : usd.times(usdTry).toNumber(),
    [currency, usdTry],
  )

  return useMemo(() => {
    const chartValue = (nominalUsd: BigNumber, monthsFromNow: number) =>
      toDisplayNumber(toViewUsd(nominalUsd, monthsFromNow))

    const moneyFromChartValue = (value: number) =>
      obfuscate(formatCurrency(value, currency), obfuscated)

    return {
      currency,
      isReal,
      toViewUsd,
      chartValue,
      moneyFromChartValue,
      money: (nominalUsd, monthsFromNow = 0) =>
        nominalUsd === null
          ? EMPTY_FIGURE
          : moneyFromChartValue(chartValue(nominalUsd, monthsFromNow)),
      signedMoney: (nominalUsd, monthsFromNow = 0) =>
        nominalUsd === null
          ? EMPTY_FIGURE
          : obfuscate(
              formatSignedCurrency(chartValue(nominalUsd, monthsFromNow), currency),
              obfuscated,
            ),
      axisTick: (value: number) =>
        compactMoney(value, CURRENCY_CONFIG[currency].symbol),
    }
  }, [currency, obfuscated, isReal, toViewUsd, toDisplayNumber])
}
