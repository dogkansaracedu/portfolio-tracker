import { describe, expect, it } from "vitest"
import { foreignIncomeDeclarationThresholdTry } from "@/lib/constants/tax"

describe("foreignIncomeDeclarationThresholdTry", () => {
  it("uses the threshold for the selected tax year", () => {
    expect(foreignIncomeDeclarationThresholdTry(2025)).toBe(18_000)
    expect(foreignIncomeDeclarationThresholdTry(2026)).toBe(22_000)
  })

  it("does not silently reuse an old threshold for an unknown year", () => {
    expect(foreignIncomeDeclarationThresholdTry(2027)).toBeNull()
  })
})
