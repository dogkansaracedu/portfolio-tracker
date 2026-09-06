import type { RetirementScenarioInputs } from "@/lib/retirement/types"

/**
 * The read edge of a saved scenario. Inputs are persisted as JSON, so rows
 * written before an input existed come back missing it — every saved scenario
 * therefore passes through `normalizeScenarioInputs` before the engine or the
 * UI touches it, and nothing downstream has to defend against a missing field.
 */

/** A stored row: today's inputs, minus anything added after it was written. */
export type StoredRetirementScenarioInputs = Omit<
  RetirementScenarioInputs,
  "contributionEndAge"
> &
  Partial<Pick<RetirementScenarioInputs, "contributionEndAge">>

/**
 * GLOSSARY: plan start — the moment a scenario was committed to as THE plan.
 * Freezes what the plan promised, so later edits to the scenario's draft do
 * not move the yardstick "am I on track?" measures against. Stored as one
 * nullable JSON column on the scenario row (`plan_start`); null = not started.
 */
export interface RetirementPlanStart {
  /** Home-timezone calendar date ("YYYY-MM-DD") the plan was started. */
  startedAt: string
  /** The portfolio total the projection was anchored at that day, nominal USD. */
  startingAmountUsd: number
  /** The scenario inputs frozen at the start — stored shape, normalize on read. */
  inputs: StoredRetirementScenarioInputs
}

/**
 * Fills the inputs saved scenarios can be missing and clamps the ones whose
 * meaning depends on another age:
 * - `contributionEndAge` defaults to the retirement age (contribute right up to
 *   retirement — the behaviour every scenario saved before the field had), and
 *   is held between the current age and the retirement age.
 */
export function normalizeScenarioInputs(
  inputs: StoredRetirementScenarioInputs,
): RetirementScenarioInputs {
  const latestAge = Math.max(inputs.currentAge, inputs.retirementAge)
  const contributionEndAge = inputs.contributionEndAge ?? inputs.retirementAge

  return {
    ...inputs,
    contributionEndAge: Math.min(
      Math.max(contributionEndAge, inputs.currentAge),
      latestAge,
    ),
  }
}
