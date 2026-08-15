/**
 * Component 13 — Retirement Planning: the pure math core.
 * Behavioral spec: docs/components/13-retirement-planning.md.
 *
 * Everything here is a pure function over plain scenario inputs — no data
 * access, no React, no formatting. `projectGrowth` is the single core; targets,
 * Coast FIRE, solvers and insights all resolve to it.
 */

export * from "@/lib/retirement/types"
export * from "@/lib/retirement/constants"
export * from "@/lib/retirement/projection"
export * from "@/lib/retirement/target"
export * from "@/lib/retirement/coast"
export * from "@/lib/retirement/solvers"
export * from "@/lib/retirement/real"
export * from "@/lib/retirement/insights"
export * from "@/lib/retirement/tax/constants"
export * from "@/lib/retirement/tax/brackets"
export * from "@/lib/retirement/tax/lots"
export * from "@/lib/retirement/tax/bes"
export * from "@/lib/retirement/tax/rules"
export * from "@/lib/retirement/compare"
export * from "@/lib/retirement/presets"
