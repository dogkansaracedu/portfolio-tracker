import { describe, it, expect } from "vitest"
import { PROJECTION_PHASE, WITHDRAWAL_STRATEGY } from "@/lib/retirement/constants"
import { planMilestones } from "@/lib/retirement/milestones"
import { projectScenario } from "@/lib/retirement/projection"
import { scenario } from "@/lib/retirement/test-fixtures"

/**
 * The Plan tab's milestone rows: which ages get a row, and what phase each one
 * reports. The phases must be the ones the projection core actually runs.
 */
describe("planMilestones", () => {
  it("runs retirement age, then every five years to the horizon", () => {
    // 35 → 55 → 80: retirement, then 60/65/70/75, then the horizon age.
    expect(planMilestones(scenario()).map((m) => m.age)).toEqual([
      55, 60, 65, 70, 75, 80,
    ])
  })

  it("opens with the contribution end age when the plan coasts", () => {
    const milestones = planMilestones(
      scenario({ contributionEndAge: 45, depletionAge: 65 }),
    )
    expect(milestones.map((m) => m.age)).toEqual([45, 55, 60, 65])
    expect(milestones.map((m) => m.phase)).toEqual([
      PROJECTION_PHASE.contributing,
      PROJECTION_PHASE.coasting,
      PROJECTION_PHASE.retirement,
      PROJECTION_PHASE.retirement,
    ])
  })

  it("omits the contribution end age when contributions run to retirement", () => {
    const milestones = planMilestones(scenario({ depletionAge: 60 }))
    expect(milestones.map((m) => m.age)).toEqual([55, 60])
    expect(milestones[0].phase).toBe(PROJECTION_PHASE.contributing)
  })

  it("always includes the horizon age even when the stride overshoots it", () => {
    // 55 + 5 = 60, then 63 is the horizon — kept, and no 65 beyond it.
    expect(
      planMilestones(scenario({ depletionAge: 63 })).map((m) => m.age),
    ).toEqual([55, 60, 63])
  })

  it("dedupes an age two rules both produce", () => {
    // A depletion age five years past retirement is both a stride step and the
    // horizon; the contribution end age at retirement is not a row of its own.
    expect(
      planMilestones(scenario({ depletionAge: 60 })).map((m) => m.age),
    ).toEqual([55, 60])
  })

  it("reads the horizon from the depletion age under either strategy", () => {
    const depleting = scenario({
      withdrawalStrategy: WITHDRAWAL_STRATEGY.depletion,
      depletionAge: 70,
    })
    expect(planMilestones(depleting).map((m) => m.age)).toEqual([55, 60, 65, 70])
  })

  it("collapses to the retirement row when the horizon is not past retirement", () => {
    expect(
      planMilestones(scenario({ depletionAge: 50 })).map((m) => m.age),
    ).toEqual([55])
  })

  it("agrees with the projection's own phase at every milestone month", () => {
    const inputs = scenario({ contributionEndAge: 45 })
    const projection = projectScenario(inputs, {
      includeRetirementDrawdown: true,
    })
    for (const milestone of planMilestones(inputs)) {
      const month = projection.months[milestone.monthsFromNow - 1]
      expect(month).toBeDefined()
      expect(milestone.phase).toBe(month.phase)
    }
  })

  it("indexes the months the chart reads (end-of-month values)", () => {
    const milestones = planMilestones(scenario({ contributionEndAge: 45 }))
    expect(milestones[0]).toMatchObject({ age: 45, monthsFromNow: 120 })
    expect(milestones[1]).toMatchObject({ age: 55, monthsFromNow: 240 })
  })
})
