import { describe, expect, it } from "vitest"
import { dedupeImportedRows, type DedupCandidate } from "./dedupeImportedRows"

function row(overrides: Partial<DedupCandidate> = {}): DedupCandidate {
  return {
    date: "2026-07-01",
    assetId: "asset-1",
    type: "buy",
    amount: "10",
    unitPrice: "14.5",
    priceCurrency: "USD",
    ...overrides,
  }
}

describe("dedupeImportedRows", () => {
  it("keeps everything when nothing exists", () => {
    const parsed = [row(), row({ date: "2026-07-02" })]
    const result = dedupeImportedRows(parsed, [])
    expect(result.kept).toHaveLength(2)
    expect(result.duplicates).toBe(0)
  })

  it("drops an exact overlap", () => {
    const result = dedupeImportedRows([row()], [row()])
    expect(result.kept).toHaveLength(0)
    expect(result.duplicates).toBe(1)
  })

  it("uses count semantics: 2 existing + 3 parsed → 1 kept", () => {
    const parsed = [row(), row(), row()]
    const existing = [row(), row()]
    const result = dedupeImportedRows(parsed, existing)
    expect(result.kept).toHaveLength(1)
    expect(result.duplicates).toBe(2)
  })

  it("matches numerically equal amounts and prices ('14.50' vs '14.5', '10.0' vs '10')", () => {
    const parsed = [row({ amount: "10.0", unitPrice: "14.50" })]
    const existing = [row({ amount: "10", unitPrice: "14.5" })]
    const result = dedupeImportedRows(parsed, existing)
    expect(result.kept).toHaveLength(0)
    expect(result.duplicates).toBe(1)
  })

  it("treats different quantity/price/type/date/currency as distinct", () => {
    const existing = [row()]
    const variants = [
      row({ amount: "11" }),
      row({ unitPrice: "14.6" }),
      row({ type: "sell" }),
      row({ date: "2026-07-02" }),
      row({ priceCurrency: "TRY" }),
    ]
    const result = dedupeImportedRows(variants, existing)
    expect(result.kept).toHaveLength(5)
    expect(result.duplicates).toBe(0)
  })

  it("matches currency case-insensitively", () => {
    const result = dedupeImportedRows(
      [row({ priceCurrency: "usd" })],
      [row({ priceCurrency: "USD" })],
    )
    expect(result.duplicates).toBe(1)
  })

  it("never matches unresolved-asset sentinel rows", () => {
    const parsed = [row({ assetId: "new:VOO" })]
    const existing = [row({ assetId: "new:VOO" })]
    const result = dedupeImportedRows(parsed, existing)
    expect(result.kept).toHaveLength(1)
    expect(result.duplicates).toBe(0)
  })

  it("does not choke on empty/unparseable numbers (collapse to 0 via bn())", () => {
    const result = dedupeImportedRows(
      [row({ amount: "" })],
      [row({ amount: "" })],
    )
    expect(result.duplicates).toBe(1)
  })
})
