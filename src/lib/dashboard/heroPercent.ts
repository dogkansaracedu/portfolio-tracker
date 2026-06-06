import type { TimeRange } from "@/lib/performance"

export interface HeroPctDenomInput {
  viewMode: "value" | "pnl"
  timeRange: TimeRange
  /** Portfolio value at the period's start (value-mode base). */
  startUsd: number
  /** Peak net invested (running max of the ledger). The money-weighted base. */
  peakInvested: number
}

/**
 * The denominator for the Dashboard hero's percent.
 *
 * - **P&L mode** → peak net invested, so the hero % shares the headline Total
 *   P&L %'s base (one denominator everywhere; stable across withdrawals).
 * - **Value mode, ALL window or ~$0 start** → also peak: ΔValue ÷ a ~$0 start is
 *   meaningless, so we fall back to the lifetime return base.
 * - **Value mode, normal window** → the period's starting value (classic
 *   "% on the value that was sitting there").
 *
 * Returns the raw base; the caller applies the `|| 1` divide-by-zero guard.
 */
export function resolveHeroPctDenom(input: HeroPctDenomInput): number {
  const { viewMode, timeRange, startUsd, peakInvested } = input
  if (viewMode === "pnl") return peakInvested
  if (timeRange === "ALL" || Math.abs(startUsd) < 1) return peakInvested
  return Math.abs(startUsd)
}
