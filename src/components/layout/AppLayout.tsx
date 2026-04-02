import { Outlet } from "react-router"
import Sidebar from "./Sidebar"
import MobileNav from "./MobileNav"
import Header from "./Header"
import { AddTransactionModal } from "@/components/transactions/AddTransactionModal"
import { useAssets } from "@/hooks/useAssets"
import { usePlatforms } from "@/hooks/usePlatforms"
import { useHoldings } from "@/hooks/useHoldings"

export default function AppLayout() {
  const { assets } = useAssets()
  const { platforms } = usePlatforms()
  const { refetch: refetchHoldings } = useHoldings()

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-4 pb-20 md:p-6 md:pb-6">
          <Outlet />
        </main>
      </div>
      <MobileNav />
      <AddTransactionModal
        assets={assets}
        platforms={platforms}
        onSuccess={refetchHoldings}
      />
    </div>
  )
}
