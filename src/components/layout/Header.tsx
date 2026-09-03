import { useLocation } from "react-router"
import { Eye, EyeOff } from "lucide-react"
import CurrencyToggle from "@/components/common/CurrencyToggle"
import ThemeToggle from "@/components/common/ThemeToggle"
import PriceRefreshButton from "@/components/prices/PriceRefreshButton"
import UserMenu from "@/components/layout/UserMenu"
import { navItems, moreNavItem } from "@/lib/constants/navigation"
import { APP_NAME } from "@/lib/constants/app"
import { usePrices } from "@/hooks/usePrices"
import { useDisplayCurrency } from "@/contexts/DisplayContext"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip"

const pageTitles: Record<string, string> = {
  ...Object.fromEntries(
    [...navItems, moreNavItem].map((item) => [item.to, item.label]),
  ),
  // Parameterised drill-downs aren't nav items; title them explicitly.
  "/assets": "Asset",
}

// Exact route first, then longest-prefix match for parameterised routes
// (e.g. /assets/:assetId → "Asset").
function titleFor(pathname: string): string {
  if (pageTitles[pathname]) return pageTitles[pathname]
  const prefix = Object.keys(pageTitles)
    .filter((to) => to !== "/" && pathname.startsWith(`${to}/`))
    .sort((a, b) => b.length - a.length)[0]
  return prefix ? pageTitles[prefix] : APP_NAME
}

export default function Header() {
  const location = useLocation()
  const title = titleFor(location.pathname)
  const { lastUpdated, refreshing, refreshPrices } = usePrices()
  const { obfuscated, toggleObfuscated } = useDisplayCurrency()

  return (
    <header className="flex h-14 items-center justify-between gap-1 border-b px-4 sm:gap-2 md:px-6">
      <h1 className="truncate text-base font-semibold sm:text-lg md:hidden">
        {title}
      </h1>
      <div className="hidden md:block" />
      {/* Tight gaps below `sm`: the five controls are 40px tap targets there
          (M-07) and the row still has to hold the page title beside them. */}
      <div className="flex shrink-0 items-center gap-0.5 sm:gap-2">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={toggleObfuscated}
                aria-label={obfuscated ? "Show values" : "Hide values"}
                className="max-sm:size-10"
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
        <UserMenu />
      </div>
    </header>
  )
}
