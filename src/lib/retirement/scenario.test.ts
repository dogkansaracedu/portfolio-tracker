import { describe, it, expect } from "vitest"
import {
  normalizeScenarioInputs,
  type StoredRetirementScenarioInputs,
} from "@/lib/retirement/scenario"
import { scenario } from "@/lib/retirement/test-fixtures"

/**
 * Saved scenarios predate later inputs, so the read edge has to fill them in
 * with the behaviour those scenarios were saved under — never a new one.
 */
describe("normalizeScenarioInputs", () => {
  it("fills a missing contribution end age with the retirement age", () => {
    // A scenario saved before the field existed comes back without it.
    const stored: StoredRetirementScenarioInputs = { ...scenario() }
    delete stored.contributionEndAge
    expect(normalizeScenarioInputs(stored).contributionEndAge).toBe(
      stored.retirementAge,
    )
  })

  it("keeps a contribution end age the scenario already carries", () => {
    const stored = scenario({ contributionEndAge: 45 })
    expect(normalizeScenarioInputs(stored).contributionEndAge).toBe(45)
  })

  it("clamps a contribution end age past retirement back to it", () => {
    const stored = { ...scenario(), contributionEndAge: 70 }
    expect(normalizeScenarioInputs(stored).contributionEndAge).toBe(55)
  })

  it("clamps a contribution end age before today up to the current age", () => {
    const stored = { ...scenario(), contributionEndAge: 20 }
    expect(normalizeScenarioInputs(stored).contributionEndAge).toBe(35)
  })

  it("leaves every other input untouched", () => {
    const stored = scenario({ monthlyContributionUsd: 750 })
    expect(normalizeScenarioInputs(stored)).toEqual(stored)
  })
})
