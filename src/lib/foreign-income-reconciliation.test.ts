import { describe, expect, it } from "vitest"
import { foreignIncomeReconciliationState } from "@/lib/foreign-income-reconciliation"
import type { ForeignIncomeReconciliation } from "@/types/database"

function row(
  overrides: Partial<ForeignIncomeReconciliation> = {},
): ForeignIncomeReconciliation {
  return {
    id: "r1",
    user_id: "u1",
    tax_year: 2026,
    statement_amount_try: 6000,
    recorded_amount_try: 6000,
    recorded_fingerprint: "fingerprint-a",
    note: null,
    reconciled_at: "2026-09-12T12:00:00Z",
    created_at: "2026-09-12T12:00:00Z",
    ...overrides,
  }
}

describe("foreignIncomeReconciliationState", () => {
  it("reports an untouched year as not started", () => {
    expect(
      foreignIncomeReconciliationState(null, 6000, "fingerprint-a").status,
    ).toBe(
      "not-started",
    )
  })

  it("matches amounts within one kuruş", () => {
    expect(
      foreignIncomeReconciliationState(
        row({ statement_amount_try: 6000.004 }),
        6000,
        "fingerprint-a",
      ).status,
    ).toBe("matched")
  })

  it("preserves the signed verified-minus-recorded difference", () => {
    const state = foreignIncomeReconciliationState(
      row({ statement_amount_try: 6200 }),
      6000,
      "fingerprint-a",
    )
    expect(state.status).toBe("difference")
    expect(state.differenceTry.toFixed(2)).toBe("200.00")
  })

  it("becomes stale when the contributing transactions change", () => {
    const state = foreignIncomeReconciliationState(
      row(),
      6100,
      "fingerprint-b",
    )
    expect(state.status).toBe("stale")
    expect(state.differenceTry.toFixed(2)).toBe("-100.00")
  })

  it("becomes stale when rows change even if the total stays the same", () => {
    const state = foreignIncomeReconciliationState(
      row(),
      6000,
      "fingerprint-b",
    )
    expect(state.status).toBe("stale")
    expect(state.differenceTry.toFixed(2)).toBe("0.00")
  })
})
