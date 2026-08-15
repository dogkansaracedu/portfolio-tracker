// Retirement scenarios are managed by `RetirementScenarioProvider` (see
// contexts/RetirementScenarioContext) so every consumer shares one fetch instead
// of each call site firing its own `retirement_scenarios?select=*` on mount.
export { useRetirementScenarioContext as useRetirementScenarios } from "@/contexts/RetirementScenarioContext"
