import { BrowserRouter, Routes, Route } from "react-router"
import { lazy, Suspense } from "react"
import AppLayout from "@/components/layout/AppLayout"
import ProtectedRoute from "@/components/auth/ProtectedRoute"
import RouteSkeleton from "@/components/layout/RouteSkeleton"
import DashboardPage from "@/pages/DashboardPage"
import LoginPage from "@/pages/LoginPage"
import SignupPage from "@/pages/SignupPage"

const PortfolioPage = lazy(() => import("@/pages/PortfolioPage"))
const TransactionsPage = lazy(() => import("@/pages/TransactionsPage"))
const TransactionsEditPage = lazy(() => import("@/pages/TransactionsEditPage"))
const PerformancePage = lazy(() => import("@/pages/PerformancePage"))
const SettingsPage = lazy(() => import("@/pages/SettingsPage"))

function Lazy({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<RouteSkeleton />}>{children}</Suspense>
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />

        {/* Protected routes */}
        <Route element={<ProtectedRoute />}>
          {/* Dedicated full-screen pages — no sidebar, no app header. */}
          <Route path="transactions/edit" element={<Lazy><TransactionsEditPage /></Lazy>} />
          <Route path="transactions/edit/:assetId" element={<Lazy><TransactionsEditPage /></Lazy>} />

          {/* Standard app layout. */}
          <Route element={<AppLayout />}>
            <Route index element={<DashboardPage />} />
            <Route path="portfolio" element={<Lazy><PortfolioPage /></Lazy>} />
            <Route path="transactions" element={<Lazy><TransactionsPage /></Lazy>} />
            <Route path="performance" element={<Lazy><PerformancePage /></Lazy>} />
            <Route path="settings" element={<Lazy><SettingsPage /></Lazy>} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
