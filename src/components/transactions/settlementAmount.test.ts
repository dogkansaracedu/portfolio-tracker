import { describe, expect, it } from "vitest"
import { formatCurrency } from "@/lib/prices"
import {
  formatSettlementAmount,
  formatSettlementDigits,
  settlementSymbol,
} from "./settlementAmount"

/**
 * A settlement figure and the same amount rendered anywhere else in the app
 * must group identically — a sell card once showed `₺15,570.91` beside a
 * `₺15.570,91` total because this module formatted in the browser's locale
 * rather than the currency's.
 */
describe("formatSettlementAmount", () => {
  it("matches formatCurrency for every fiat unit", () => {
    for (const unit of ["USD", "TRY", "EUR"] as const) {
      expect(formatSettlementAmount(15570.91, unit)).toBe(
        formatCurrency(15570.91, unit),
      )
    }
  })

  it("groups a lira figure by the lira's own locale", () => {
    expect(formatSettlementAmount(15570.91, "TRY")).toBe("₺15.570,91")
  })

  it("groups a dollar figure by the dollar's own locale", () => {
    expect(formatSettlementAmount(15570.91, "USD")).toBe("$15,570.91")
  })

  it("renders a stablecoin unit bare, in the app display locale", () => {
    expect(settlementSymbol("USDT")).toBe("")
    expect(formatSettlementAmount(15570.91, "USDT")).toBe("15,570.91")
  })

  it("leads a negative figure with the minus, before the symbol", () => {
    expect(formatSettlementAmount(-1234.5, "TRY")).toBe("-₺1.234,50")
  })

  it("formats digits alone in the unit's locale, for a styled symbol", () => {
    expect(formatSettlementDigits(15570.91, "TRY")).toBe("15.570,91")
    expect(formatSettlementDigits(15570.91, "USD")).toBe("15,570.91")
    expect(formatSettlementDigits(15570.91, "USDT")).toBe("15,570.91")
  })
})
