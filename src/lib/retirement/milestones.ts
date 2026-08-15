import {
  MILESTONE_STEP_YEARS,
  MONTHS_PER_YEAR,
  PROJECTION_PHASE,
} from "@/lib/retirement/constants"
import {
  monthsToContributionEnd,
  monthsToRetirement,
} from "@/lib/retirement/projection"
import type {
  ProjectionPhase,
  RetirementScenarioInputs,
} from "@/lib/retirement/types"

/**
 * The ages the Plan tab tabulates — "how much do I have at age X?" answered
 * without hovering the chart. Pure age arithmetic over the scenario: the values
 * themselves come from the projections the chart already drew, so the table and
 * the line can never disagree.
 */

export interface PlanMilestone {
  age: number
  /** Months from now the age falls at; indexes the same projections the chart reads. */
  monthsFromNow: number
  /**
   * The phase of the month ENDING at this age — the month whose end-of-month
   * value the row shows. So the contribution-end row reads "contributing" (the
   * last contribution just landed) and the retirement row "coasting" whenever a
   * coasting window exists.
   */
  phase: ProjectionPhase
}

/**
 * Contribution end age (only when it is short of retirement), retirement age,
 * then every `MILESTONE_STEP_YEARS` years out to the chart horizon — the
 * depletion age under capital depletion, the show-until age under preservation —
 * with the horizon age itself always included even when the stride overshoots
 * it. Deduped, ascending.
 */
export function planMilestones(
  inputs: RetirementScenarioInputs,
): PlanMilestone[] {
  const horizonAge = Math.max(inputs.retirementAge, inputs.depletionAge)
  const ages: number[] = []

  if (inputs.contributionEndAge < inputs.retirementAge) {
    ages.push(inputs.contributionEndAge)
  }
  ages.push(inputs.retirementAge)
  for (
    let age = inputs.retirementAge + MILESTONE_STEP_YEARS;
    age < horizonAge;
    age += MILESTONE_STEP_YEARS
  ) {
    ages.push(age)
  }
  ages.push(horizonAge)

  return [...new Set(ages)]
    .filter((age) => age >= inputs.currentAge)
    .sort((a, b) => a - b)
    .map((age) => milestoneAt(inputs, age))
}

function milestoneAt(
  inputs: RetirementScenarioInputs,
  age: number,
): PlanMilestone {
  const monthsFromNow = Math.max(
    0,
    Math.round((age - inputs.currentAge) * MONTHS_PER_YEAR),
  )
  return {
    age,
    monthsFromNow,
    phase: phaseAtMonthIndex(inputs, Math.max(0, monthsFromNow - 1)),
  }
}

/** The phase of projection month `monthIndex` — the same boundaries the core runs. */
export function phaseAtMonthIndex(
  inputs: RetirementScenarioInputs,
  monthIndex: number,
): ProjectionPhase {
  if (monthIndex >= monthsToRetirement(inputs)) return PROJECTION_PHASE.retirement
  if (monthIndex >= monthsToContributionEnd(inputs)) {
    return PROJECTION_PHASE.coasting
  }
  return PROJECTION_PHASE.contributing
}
