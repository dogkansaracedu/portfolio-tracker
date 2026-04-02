import { BrowserRouter, Routes, Route } from "react-router"
import AppLayout from "@/components/layout/AppLayout"
import ProtectedRoute from "@/components/auth/ProtectedRoute"
import DashboardPage from "@/pages/DashboardPage"
import PortfolioPage from "@/pages/PortfolioPage"
import TransactionsPage from "@/pages/TransactionsPage"
import PerformancePage from "@/pages/PerformancePage"
import SettingsPage from "@/pages/SettingsPage"
import LoginPage from "@/pages/LoginPage"
import SignupPage from "@/pages/SignupPage"

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />

        {/* Protected routes */}
        <Route element={<ProtectedRoute />}>
          <Route element={<AppLayout />}>
            <Route index element={<DashboardPage />} />
            <Route path="portfolio" element={<PortfolioPage />} />
            <Route path="transactions" element={<TransactionsPage />} />
            <Route path="performance" element={<PerformancePage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
