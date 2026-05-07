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
