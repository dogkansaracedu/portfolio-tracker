import { useLocation } from "react-router"
import { Eye, EyeOff } from "lucide-react"
import CurrencyToggle from "@/components/common/CurrencyToggle"
import ThemeToggle from "@/components/common/ThemeToggle"
import PriceRefreshButton from "@/components/prices/PriceRefreshButton"
import { usePrices } from "@/hooks/usePrices"
import { useDisplayCurrency } from "@/contexts/DisplayContext"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip"

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
  const { obfuscated, toggleObfuscated } = useDisplayCurrency()

  return (
    <header className="flex h-14 items-center justify-between border-b px-4 md:px-6">
      <h1 className="text-lg font-semibold md:hidden">{title}</h1>
      <div className="hidden md:block" />
      <div className="flex items-center gap-2">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={toggleObfuscated}
              />
            }
          >
            {obfuscated ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </TooltipTrigger>
          <TooltipContent>
            {obfuscated ? "Show values" : "Hide values"}
          </TooltipContent>
        </Tooltip>
        <ThemeToggle />
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
