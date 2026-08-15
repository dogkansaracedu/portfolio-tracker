import { lazy } from "react"

// Dashboard charts (default exports)
export const DashboardHero = lazy(
  () => import("@/components/dashboard/DashboardHero"),
)
export const AllocationChart = lazy(
  () => import("@/components/dashboard/AllocationChart"),
)

// Performance charts (named exports — wrap to satisfy lazy()'s default-export requirement)
export const PortfolioValueChart = lazy(() =>
  import("@/components/performance/PortfolioValueChart").then((m) => ({
    default: m.PortfolioValueChart,
  })),
)
export const MonthlyReturnsChart = lazy(() =>
  import("@/components/performance/MonthlyReturnsChart").then((m) => ({
    default: m.MonthlyReturnsChart,
  })),
)
export const DrawdownChart = lazy(() =>
  import("@/components/performance/DrawdownChart").then((m) => ({
    default: m.DrawdownChart,
  })),
)

// Retirement charts (named exports)
export const RetirementPlanChart = lazy(() =>
  import("@/components/retirement/PlanChart").then((m) => ({
    default: m.PlanChart,
  })),
)
export const RetirementCompareChart = lazy(() =>
  import("@/components/retirement/CompareChart").then((m) => ({
    default: m.CompareChart,
  })),
)
export const RetirementCoastFireChart = lazy(() =>
  import("@/components/retirement/CoastFireChart").then((m) => ({
    default: m.CoastFireChart,
  })),
)

// Asset detail chart (named export)
export const AssetHistoryChart = lazy(() =>
  import("@/components/asset-detail/AssetHistoryChart").then((m) => ({
    default: m.AssetHistoryChart,
  })),
)
