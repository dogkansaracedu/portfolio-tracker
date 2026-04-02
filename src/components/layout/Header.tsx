import { useLocation } from "react-router"
import CurrencyToggle from "@/components/common/CurrencyToggle"
import PriceRefreshButton from "@/components/prices/PriceRefreshButton"
import { usePrices } from "@/hooks/usePrices"

const pageTitles: Record<string, string> = {
  "/": "Dashboard",
  "/portfolio": "Portfolio",
  "/transactions": "Transactions",
  "/performance": "Performance",
  "/settings": "Settings",
}

export default function Header() {
  const location = useLocation()
  const title = pageTitles[location.pathname] ?? "Portfolio Tracker"
  const { lastUpdated, refreshing, refreshPrices } = usePrices()

  return (
    <header className="flex h-14 items-center justify-between border-b px-4 md:px-6">
      <h1 className="text-lg font-semibold md:hidden">{title}</h1>
      <div className="hidden md:block" />
      <div className="flex items-center gap-2">
        <CurrencyToggle />
        <PriceRefreshButton
          lastUpdated={lastUpdated}
          refreshing={refreshing}
          onRefresh={refreshPrices}
        />
      </div>
    </header>
  )
}
