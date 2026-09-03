import { DECIMALS } from "@/lib/config"
import { CURRENCY_SYMBOLS, isFiatCurrency } from "@/lib/constants/currencies"

/**
 * The settlement side of a trade — the cash leg's amount and the unit it is
 * denominated in.
 *
 * That unit is NOT necessarily a fiat currency: a trade can settle in a
 * stablecoin (USDT), which is why this cannot go through `formatCurrency` —
 * that takes a `FiatCurrency`, so every call site used to cast a bare ticker to
 * one and lean on a `?? ""` to absorb the lie. Here the unit is a plain string
 * and an unknown one simply has no symbol, which is the intended reading: the
 * ticker is printed beside the figure instead.
 *
 * The digits deliberately follow the BROWSER's locale rather than the
 * currency's, which is what these surfaces have always done — so a ₺ figure
 * here groups differently from the same figure through `formatCurrency`. That
 * inconsistency is real and pre-existing; it now has one place to be fixed in.
 */
export function settlementSymbol(unit: string): string {
  return isFiatCurrency(unit) ? CURRENCY_SYMBOLS[unit] : ""
}

/** The digits alone, for a caller that styles the symbol separately. */
export function formatSettlementDigits(value: number): string {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: DECIMALS.fiat,
    maximumFractionDigits: DECIMALS.fiat,
  })
}

/** Symbol + digits, e.g. "$1,234.56" or "1,234.56" for a stablecoin unit. */
export function formatSettlementAmount(value: number, unit: string): string {
  return `${settlementSymbol(unit)}${formatSettlementDigits(value)}`
}
