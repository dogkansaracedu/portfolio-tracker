import type BigNumber from "bignumber.js"
import { BN_ZERO } from "@/lib/config"
import { applyTxToInvested } from "@/lib/performance"
import { normalizeToUsd, convertOnDate, fromUsdOnDate } from "@/lib/pnl/currency"
import type {
  CashflowEntry,
  ExchangeRate,
  IncomeDefault,
  Transaction,
} from "@/types/database"

/** Where a month's income figure came from. */
export type MonthlyIncomeSource = "entry" | "default" | "none"

/**
 * One month of the budgeting view (Component 14). Income legs are null when
 * the month has neither an explicit entry nor an applicable salary default —
 * "unknown" is never rendered as zero, so spent and the savings rate are null
 * with it.
 */
export interface MonthlyBudgetRow {
  /** "YYYY-MM" */
  month: string
  incomeUsd: BigNumber | null
  incomeTry: BigNumber | null
  /** Net external money into tracked platforms — can be negative. */
  investedUsd: BigNumber
  investedTry: BigNumber
  spentUsd: BigNumber | null
  spentTry: BigNumber | null
  /** invested ÷ income × 100, over the USD legs; null when income is unknown or ≤ 0. */
  savingsRatePct: BigNumber | null
  incomeSource: MonthlyIncomeSource
}

export interface MonthlyBudgetInput {
  entries: CashflowEntry[]
  incomeDefaults: IncomeDefault[]
  transactions: Transaction[]
  rates: ExchangeRate[]
  /** Inclusive "YYYY-MM" range; the caller owns the window (and "today"). */
  fromMonth: string
  toMonth: string
}

/** "2026-01" → "2026-02"; "2026-12" → "2027-01". */
function nextMonth(month: string): string {
  const [y, m] = month.split("-").map(Number)
  return m === 12
    ? `${y + 1}-01`
    : `${y}-${String(m + 1).padStart(2, "0")}`
}

/**
 * The budgeting derivation engine — pure, UI-free (Component 14).
 *
 * Per calendar month:
 * - **invested** — the month's delta of net invested capital: the sum of each
 *   transaction's contribution to the SAME pairing-aware fold the P&L engine
 *   uses (`applyTxToInvested`), so a buy and its cash leg cancel and only
 *   external money moves the figure. The fold is linear per transaction, which
 *   is what makes a per-month delta equal to the fold over that month's
 *   transactions alone.
 * - **income** — the month's `income` entries summed at their entry-date
 *   rates; with no entry, the salary default whose `effective_from` is the
 *   latest at or before the month (converted at the first of the month).
 * - **spent** = income − invested; **savingsRatePct** = invested ÷ income —
 *   both null when income is unknown.
 */
export function computeMonthlyBudget(
  input: MonthlyBudgetInput,
): MonthlyBudgetRow[] {
  const { entries, incomeDefaults, transactions, rates, fromMonth, toMonth } =
    input

  // Bucket per-transaction invested deltas by "YYYY-MM".
  const investedUsdByMonth = new Map<string, BigNumber>()
  const investedTryByMonth = new Map<string, BigNumber>()
  for (const tx of transactions) {
    const month = tx.date.slice(0, 7)
    const deltaUsd = applyTxToInvested(tx, rates, BN_ZERO)
    if (deltaUsd.isZero()) continue
    const deltaTry = fromUsdOnDate(deltaUsd, "TRY", tx.date, rates)
    investedUsdByMonth.set(
      month,
      (investedUsdByMonth.get(month) ?? BN_ZERO).plus(deltaUsd),
    )
    investedTryByMonth.set(
      month,
      (investedTryByMonth.get(month) ?? BN_ZERO).plus(deltaTry),
    )
  }

  // Bucket explicit income entries by month, both currency legs at entry-date rates.
  const incomeUsdByMonth = new Map<string, BigNumber>()
  const incomeTryByMonth = new Map<string, BigNumber>()
  for (const entry of entries) {
    if (entry.type !== "income") continue
    const month = entry.date.slice(0, 7)
    incomeUsdByMonth.set(
      month,
      (incomeUsdByMonth.get(month) ?? BN_ZERO).plus(
        normalizeToUsd(entry.amount, entry.currency, entry.date, rates),
      ),
    )
    incomeTryByMonth.set(
      month,
      (incomeTryByMonth.get(month) ?? BN_ZERO).plus(
        convertOnDate(entry.amount, entry.currency, "TRY", entry.date, rates),
      ),
    )
  }

  // Latest effective_from at or before the month wins.
  const sortedDefaults = [...incomeDefaults].sort((a, b) =>
    a.effective_from < b.effective_from ? -1 : 1,
  )
  function defaultForMonth(month: string): IncomeDefault | null {
    let applicable: IncomeDefault | null = null
    for (const d of sortedDefaults) {
      if (d.effective_from.slice(0, 7) <= month) applicable = d
      else break
    }
    return applicable
  }

  const rows: MonthlyBudgetRow[] = []
  for (let month = fromMonth; month <= toMonth; month = nextMonth(month)) {
    const investedUsd = investedUsdByMonth.get(month) ?? BN_ZERO
    const investedTry = investedTryByMonth.get(month) ?? BN_ZERO

    let incomeUsd = incomeUsdByMonth.get(month) ?? null
    let incomeTry = incomeTryByMonth.get(month) ?? null
    let incomeSource: MonthlyIncomeSource = incomeUsd !== null ? "entry" : "none"
    if (incomeUsd === null) {
      const fallback = defaultForMonth(month)
      if (fallback) {
        const monthStart = `${month}-01`
        incomeUsd = normalizeToUsd(
          fallback.amount,
          fallback.currency,
          monthStart,
          rates,
        )
        incomeTry = convertOnDate(
          fallback.amount,
          fallback.currency,
          "TRY",
          monthStart,
          rates,
        )
        incomeSource = "default"
      }
    }

    const spentUsd = incomeUsd === null ? null : incomeUsd.minus(investedUsd)
    const spentTry = incomeTry === null ? null : incomeTry.minus(investedTry)
    const savingsRatePct =
      incomeUsd !== null && incomeUsd.gt(0)
        ? investedUsd.div(incomeUsd).times(100)
        : null

    rows.push({
      month,
      incomeUsd,
      incomeTry,
      investedUsd,
      investedTry,
      spentUsd,
      spentTry,
      savingsRatePct,
      incomeSource,
    })
  }
  return rows
}
