import { describe, expect, it, vi } from "vitest"
import { computeCashAmount } from "@/lib/cash"
import { TRANSACTION_TYPES } from "@/lib/constants/transaction-types"

// `cash.ts` also exports `resolveFiatAsset`, which imports the Supabase
// client — and that module throws at import time when the env vars are
// absent. The functions under test here are pure, so stub the client to
// keep this suite runnable in a checkout with no `.env.local` (CI, a fresh
// clone) the way every other suite already is.
vi.mock("@/lib/supabase", () => ({ supabase: {} }))

/**
 * The cash leg's amount is the one figure the Add-transaction form previews
 * ("Sale proceeds: …") *before* the ledger books it, so the preview and the
 * booked leg must come out of this same function. These cases pin the rule
 * the preview used to restate incorrectly: a fee denominated in a currency
 * other than the trade's `price_currency` is informational only and never
 * nets off the cash leg.
 */
describe("computeCashAmount", () => {
  it("nets a same-currency fee off a sell's proceeds", () => {
    const amount = computeCashAmount({
      type: TRANSACTION_TYPES.SELL,
      total_cost: "1000",
      fee: "7.5",
      fee_currency: "USD",
      price_currency: "USD",
    })
    expect(amount.toFixed(2)).toBe("992.50")
  })

  it("leaves a cross-currency fee out of a sell's proceeds", () => {
    // A USD sell with a ₺300 fee: the ledger credits the full $1,000, so the
    // preview must promise $1,000 too — not $700, and not $1,000 − ₺300.
    const amount = computeCashAmount({
      type: TRANSACTION_TYPES.SELL,
      total_cost: "1000",
      fee: "300",
      fee_currency: "TRY",
      price_currency: "USD",
    })
    expect(amount.toFixed(2)).toBe("1000.00")
  })

  it("treats a null fee currency as same-currency", () => {
    const amount = computeCashAmount({
      type: TRANSACTION_TYPES.SELL,
      total_cost: "1000",
      fee: null,
      fee_currency: null,
      price_currency: "USD",
    })
    expect(amount.toFixed(2)).toBe("1000.00")
  })

  it("adds a same-currency fee to a buy's outlay", () => {
    const amount = computeCashAmount({
      type: TRANSACTION_TYPES.BUY,
      total_cost: "1000",
      fee: "7.5",
      fee_currency: "USD",
      price_currency: "USD",
    })
    expect(amount.toFixed(2)).toBe("1007.50")
  })

  it("leaves a cross-currency fee out of a buy's outlay", () => {
    const amount = computeCashAmount({
      type: TRANSACTION_TYPES.BUY,
      total_cost: "1000",
      fee: "300",
      fee_currency: "TRY",
      price_currency: "USD",
    })
    expect(amount.toFixed(2)).toBe("1000.00")
  })

  it("keeps full precision (no float drift)", () => {
    const amount = computeCashAmount({
      type: TRANSACTION_TYPES.SELL,
      total_cost: "0.3",
      fee: "0.1",
      fee_currency: "USD",
      price_currency: "USD",
    })
    expect(amount.toFixed()).toBe("0.2")
  })

  it("refuses a type that has no cash leg", () => {
    expect(() =>
      computeCashAmount({
        type: TRANSACTION_TYPES.DIVIDEND,
        total_cost: "100",
        fee: null,
        fee_currency: null,
        price_currency: "USD",
      }),
    ).toThrow()
  })
})
