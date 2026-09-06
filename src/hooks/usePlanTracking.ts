import { useMemo } from "react"
import type BigNumber from "bignumber.js"
import { bn, homeDayIso } from "@/lib/config"
import { useSnapshots } from "@/hooks/useSnapshots"
import { useTransactionData } from "@/contexts/TransactionDataContext"
import { computeMonthlyBudget } from "@/lib/budget"
import {
  computePlanTracking,
  type ActualMonthlyContribution,
  type ActualValuePoint,
  type PlanTracking,
  type RetirementPlanStart,
} from "@/lib/retirement"

/**
 * The data edge of "am I on track?": it gathers the two actual histories the
 * engine compares the frozen plan against — the daily portfolio snapshots and
 * the monthly [invested](GLOSSARY) figures — and runs `computePlanTracking`
 * once. Both sources are app-wide providers, so this adds no fetch of its own.
 *
 * `enabled` is the mode gate: re-projecting three bands over a whole retirement
 * horizon is not work a question nobody opened should pay for. The hook is
 * still called unconditionally (it always is) — the gate is inside the memo.
 */
export function usePlanTracking(
  planStart: RetirementPlanStart | null,
  liveValueUsd: BigNumber,
  enabled: boolean,
): PlanTracking | null {
  const { snapshots } = useSnapshots()
  const { transactions, rates } = useTransactionData()

  return useMemo(() => {
    if (!enabled || !planStart) return null
    const todayIso = homeDayIso()

    // A snapshot with no total is a gap in the history, not a zero portfolio.
    const actualValues: ActualValuePoint[] = snapshots.flatMap((snapshot) =>
      snapshot.total_usd === null
        ? []
        : [{ date: snapshot.snapshot_date, valueUsd: bn(snapshot.total_usd) }],
    )

    // The budgeting engine's monthly `investedUsd` is exactly the actual side
    // of the contribution gap. Income is irrelevant here, so it gets neither
    // entries nor defaults: those only drive the income/spent legs, which are
    // left null and ignored — `investedUsd` is derived from transactions alone.
    const actualContributions: ActualMonthlyContribution[] = computeMonthlyBudget(
      {
        entries: [],
        incomeDefaults: [],
        transactions,
        rates,
        fromMonth: planStart.startedAt.slice(0, 7),
        toMonth: todayIso.slice(0, 7),
      },
    ).map((row) => ({ month: row.month, investedUsd: row.investedUsd }))

    return computePlanTracking({
      planStart,
      todayIso,
      liveValueUsd,
      actualValues,
      actualContributions,
    })
  }, [enabled, planStart, liveValueUsd, snapshots, transactions, rates])
}
