import BigNumber from "bignumber.js"
import { bn } from "@/lib/config"
import type { ForeignIncomeReconciliation } from "@/types/database"

const CENT_TOLERANCE = new BigNumber(0.01)

export type ForeignIncomeReconciliationStatus =
  | "not-started"
  | "matched"
  | "difference"
  | "stale"

export interface ForeignIncomeReconciliationState {
  status: ForeignIncomeReconciliationStatus
  /** Verified/statement amount minus the app's current recorded amount. */
  differenceTry: BigNumber
}

/**
 * Derive the audit status from the saved checkpoint and the current transaction
 * fold. A checkpoint becomes stale whenever the underlying total changes,
 * even if that change happens to land on the verified total: the owner still
 * needs to acknowledge the new transaction set.
 */
export function foreignIncomeReconciliationState(
  reconciliation: ForeignIncomeReconciliation | null,
  currentRecordedTry: BigNumber.Value,
  currentFingerprint: string,
): ForeignIncomeReconciliationState {
  const current = bn(currentRecordedTry)
  if (!reconciliation) {
    return { status: "not-started", differenceTry: bn(0) }
  }

  const differenceTry = bn(reconciliation.statement_amount_try).minus(current)
  const recordedChanged =
    reconciliation.recorded_fingerprint !== currentFingerprint ||
    bn(reconciliation.recorded_amount_try)
      .minus(current)
      .abs()
      .gte(CENT_TOLERANCE)

  if (recordedChanged) return { status: "stale", differenceTry }
  return {
    status: differenceTry.abs().lt(CENT_TOLERANCE) ? "matched" : "difference",
    differenceTry,
  }
}
