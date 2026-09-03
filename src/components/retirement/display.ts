import { useCallback, useMemo } from "react"
import type BigNumber from "bignumber.js"
import { useDisplayCurrency } from "@/contexts/DisplayContext"
import { usePrices } from "@/hooks/usePrices"
import { bn } from "@/lib/config"
import { MONTHS_PER_YEAR, toReal } from "@/lib/retirement"
import {
  formatCompactCurrency,
  formatMoney,
  formatSignedMoney,
  moneyAxisLabels,
  type MoneyAxisLabels,
} from "@/lib/prices"
import {
  AGE_LABEL,
  CHART_AXIS_FONT_SIZE,
  CHART_AXIS_WIDTH,
  EMPTY_FIGURE,
  VALUE_VIEW,
  type ValueView,
} from "./constants"
import type { DisplayCurrency } from "@/lib/constants/currencies"

/**
 * The display edge of the retirement views: BigNumber USD in, formatted string
 * (or a plain chart number) out. Three conventions meet here — the nominal/real
 * toggle (a re-derivation, never a stored change), the display currency, and
 * amount obfuscation (percentages and durations stay visible).
 */

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

/** "Age 52" — an age read as a label (headline answers, chart markers, tooltips). */
export function formatAgeLabel(age: number): string {
  return `${AGE_LABEL} ${formatAge(age)}`
}

export interface RetirementDisplay {
  currency: DisplayCurrency
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
  /** Spread over a money YAxis: hidden amounts drop its labels (the axis keeps
   *  its scale). One config for all three charts — see `moneyAxisLabels`. */
  axisLabels: MoneyAxisLabels
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
      currency === "USD" ? usd.toNumber() : usd.times(bn(usdTry)).toNumber(),
    [currency, usdTry],
  )

  return useMemo(() => {
    const chartValue = (nominalUsd: BigNumber, monthsFromNow: number) =>
      toDisplayNumber(toViewUsd(nominalUsd, monthsFromNow))

    const moneyFromChartValue = (value: number) =>
      formatMoney(value, currency, obfuscated)

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
          : formatSignedMoney(
              chartValue(nominalUsd, monthsFromNow),
              currency,
              obfuscated,
            ),
      axisTick: (value: number) => formatCompactCurrency(value, currency),
      axisLabels: moneyAxisLabels(obfuscated, {
        fontSize: CHART_AXIS_FONT_SIZE,
        width: CHART_AXIS_WIDTH,
      }),
    }
  }, [currency, obfuscated, isReal, toViewUsd, toDisplayNumber])
}
