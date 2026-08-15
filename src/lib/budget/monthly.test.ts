import { describe, it, expect } from "vitest"
import { computeMonthlyBudget } from "@/lib/budget"
import { tx, transferIn, transferOut, buy, cashDebit, rate } from "@/lib/pnl/test-fixtures"
import type { CashflowEntry, IncomeDefault } from "@/types/database"

/** An income entry (Component 14); amounts are TRY unless overridden. */
let entrySeq = 0
function income(
  date: string,
  amount: number,
  opts: Partial<CashflowEntry> = {},
): CashflowEntry {
  entrySeq += 1
  return {
    id: `cf-${entrySeq}`,
    user_id: "u",
    date,
    type: "income",
    amount,
    currency: "TRY",
    note: null,
    created_at: date,
    ...opts,
  }
}

/** A salary-schedule row; TRY unless overridden. */
let defaultSeq = 0
function salary(
  effectiveFrom: string,
  amount: number,
  opts: Partial<IncomeDefault> = {},
): IncomeDefault {
  defaultSeq += 1
  return {
    id: `def-${defaultSeq}`,
    user_id: "u",
    amount,
    currency: "TRY",
    effective_from: effectiveFrom,
    created_at: effectiveFrom,
    ...opts,
  }
}

// A flat USD/TRY = 50 world unless a test provides its own rates.
const RATES = [rate("2026-01-01", { usd_try: 50 })]

function run(
  overrides: Partial<Parameters<typeof computeMonthlyBudget>[0]> = {},
) {
  return computeMonthlyBudget({
    entries: [],
    incomeDefaults: [],
    transactions: [],
    rates: RATES,
    fromMonth: "2026-01",
    toMonth: "2026-03",
    ...overrides,
  })
}

describe("computeMonthlyBudget — invested (net external money in)", () => {
  it("counts a lone deposit (transfer_in) as that month's invested", () => {
    const rows = run({
      transactions: [transferIn(100, 1, { date: "2026-01-10" })],
    })
    expect(rows.map((r) => r.month)).toEqual(["2026-01", "2026-02", "2026-03"])
    expect(rows[0].investedUsd.toNumber()).toBe(100)
    expect(rows[1].investedUsd.toNumber()).toBe(0)
  })

  it("nets a buy against its paired cash_debit — internal shuffles are not new money", () => {
    const rows = run({
      transactions: [
        buy(10, 5, { date: "2026-01-10" }),
        cashDebit(50, { date: "2026-01-10" }),
      ],
    })
    expect(rows[0].investedUsd.toNumber()).toBe(0)
  })

  it("buckets transactions into their own calendar months", () => {
    const rows = run({
      transactions: [
        transferIn(100, 1, { date: "2026-01-10" }),
        transferIn(40, 1, { date: "2026-02-05" }),
      ],
    })
    expect(rows[0].investedUsd.toNumber()).toBe(100)
    expect(rows[1].investedUsd.toNumber()).toBe(40)
  })

  it("goes negative on a net-withdrawal month", () => {
    const rows = run({
      transactions: [transferOut(30, 1, { date: "2026-02-15" })],
    })
    expect(rows[1].investedUsd.toNumber()).toBe(-30)
  })

  it("converts invested to TRY at each transaction's own date rate", () => {
    const rows = run({
      rates: [
        rate("2026-01-01", { usd_try: 40 }),
        rate("2026-02-01", { usd_try: 50 }),
      ],
      transactions: [
        transferIn(100, 1, { date: "2026-01-10" }), // 100 USD × 40
        transferIn(100, 1, { date: "2026-02-10" }), // 100 USD × 50
      ],
    })
    expect(rows[0].investedTry.toNumber()).toBe(4000)
    expect(rows[1].investedTry.toNumber()).toBe(5000)
  })

  it("keeps income transactions (dividend/interest) out of invested", () => {
    const rows = run({
      transactions: [
        tx({ type: "interest", amount: 25, unit_price: 1, date: "2026-01-20" }),
      ],
    })
    expect(rows[0].investedUsd.toNumber()).toBe(0)
  })
})

describe("computeMonthlyBudget — income, spent, savings rate", () => {
  it("sums explicit income entries, converting at the entry-date rate", () => {
    const rows = run({
      entries: [
        income("2026-01-05", 40000),
        income("2026-01-25", 10000),
      ],
    })
    expect(rows[0].incomeTry!.toNumber()).toBe(50000)
    expect(rows[0].incomeUsd!.toNumber()).toBe(1000) // 50 000 TRY ÷ 50
    expect(rows[0].incomeSource).toBe("entry")
  })

  it("derives spent as income − invested and the savings rate as invested ÷ income", () => {
    const rows = run({
      entries: [income("2026-01-05", 50000)],
      transactions: [transferIn(600, 1, { date: "2026-01-10" })],
    })
    // 1000 USD income, 600 USD invested → 400 spent, 60% savings rate
    expect(rows[0].spentUsd!.toNumber()).toBe(400)
    expect(rows[0].spentTry!.toNumber()).toBe(20000)
    expect(rows[0].savingsRatePct!.toNumber()).toBe(60)
  })

  it("lets spent exceed income on a net-withdrawal month", () => {
    const rows = run({
      entries: [income("2026-01-05", 50000)],
      transactions: [transferOut(200, 1, { date: "2026-01-10" })],
    })
    expect(rows[0].spentUsd!.toNumber()).toBe(1200)
    expect(rows[0].savingsRatePct!.toNumber()).toBe(-20)
  })

  it("reports null income/spent/rate on months with no data — never a fake zero", () => {
    const rows = run({
      transactions: [transferIn(100, 1, { date: "2026-02-10" })],
    })
    expect(rows[1].incomeUsd).toBeNull()
    expect(rows[1].spentUsd).toBeNull()
    expect(rows[1].savingsRatePct).toBeNull()
    expect(rows[1].incomeSource).toBe("none")
  })
})

describe("computeMonthlyBudget — salary schedule", () => {
  it("fills months with no explicit entry from the applicable default", () => {
    const rows = run({
      incomeDefaults: [salary("2026-01-01", 50000)],
    })
    expect(rows[0].incomeTry!.toNumber()).toBe(50000)
    expect(rows[0].incomeSource).toBe("default")
  })

  it("applies the latest effective_from at or before the month (a raise)", () => {
    const rows = run({
      incomeDefaults: [
        salary("2026-01-01", 50000),
        salary("2026-03-01", 60000),
      ],
    })
    expect(rows[0].incomeTry!.toNumber()).toBe(50000)
    expect(rows[1].incomeTry!.toNumber()).toBe(50000)
    expect(rows[2].incomeTry!.toNumber()).toBe(60000)
  })

  it("does not apply a default to months before its effective_from", () => {
    const rows = run({
      incomeDefaults: [salary("2026-02-01", 50000)],
    })
    expect(rows[0].incomeSource).toBe("none")
    expect(rows[1].incomeSource).toBe("default")
  })

  it("prefers an explicit entry over the default", () => {
    const rows = run({
      entries: [income("2026-01-05", 42000)],
      incomeDefaults: [salary("2026-01-01", 50000)],
    })
    expect(rows[0].incomeTry!.toNumber()).toBe(42000)
    expect(rows[0].incomeSource).toBe("entry")
  })
})
