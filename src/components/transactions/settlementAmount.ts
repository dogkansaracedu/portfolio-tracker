import { CURRENCY_CONFIG, DECIMALS } from "@/lib/config"
import { DISPLAY_LOCALE } from "@/lib/constants/app"
import { CURRENCY_SYMBOLS, isFiatCurrency } from "@/lib/constants/currencies"
import { formatCurrency } from "@/lib/prices"

/**
 * The settlement side of a trade — the cash leg's amount and the unit it is
 * denominated in.
 *
 * That unit is NOT necessarily a fiat currency: a trade can settle in a
 * stablecoin (USDT), which is why this cannot simply forward every call to
 * `formatCurrency` — that takes a `FiatCurrency`, so every call site used to
 * cast a bare ticker to one and lean on a `?? ""` to absorb the lie. Here the
 * unit is a plain string; a fiat one goes through `formatCurrency` itself, and
 * an unknown one simply has no symbol, which is the intended reading: the
 * ticker is printed beside the figure instead.
 *
 * A fiat figure therefore groups by the CURRENCY's own locale, exactly as it
 * does everywhere else in the app (`₺15.570,91`, not `₺15,570.91`). A
 * stablecoin unit has no locale of its own, so its digits follow the app's
 * display locale.
 */
export function settlementSymbol(unit: string): string {
  return isFiatCurrency(unit) ? CURRENCY_SYMBOLS[unit] : ""
}

/** The digits alone, for a caller that styles the symbol separately. Grouping
 *  and decimals follow the same rule as {@link formatSettlementAmount}. */
export function formatSettlementDigits(value: number, unit: string): string {
  const cfg = isFiatCurrency(unit) ? CURRENCY_CONFIG[unit] : null
  const sign = value < 0 ? "-" : ""
  const digits = new Intl.NumberFormat(cfg?.locale ?? DISPLAY_LOCALE, {
    minimumFractionDigits: cfg?.decimals ?? DECIMALS.fiat,
    maximumFractionDigits: cfg?.decimals ?? DECIMALS.fiat,
  }).format(Math.abs(value))
  return `${sign}${digits}`
}

/** Symbol + digits, e.g. "$1,234.56", "₺15.570,91", or "1,234.56" for a
 *  stablecoin unit. */
export function formatSettlementAmount(value: number, unit: string): string {
  return isFiatCurrency(unit)
    ? formatCurrency(value, unit)
    : formatSettlementDigits(value, unit)
}
