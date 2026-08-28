import { Link, useLocation } from "react-router"
import {
  LayoutDashboard,
  Briefcase,
  ArrowLeftRight,
  TrendingUp,
  PiggyBank,
  Wallet,
  Megaphone,
  Settings,
  Ellipsis,
} from "lucide-react"
import { CAMPAIGN_COPY } from "@/lib/constants/campaigns"
import { APP_NAME } from "@/lib/constants/app"
import { FEATURES } from "@/lib/features"
import Logo from "@/components/common/Logo"
import BuildBadge from "@/components/common/BuildBadge"

// Primary items get a dedicated tab in the mobile bottom bar; secondary
// items live behind its "More" hub tab. Desktop sidebar shows all of them.
const primaryNavItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/portfolio", label: "Portfolio", icon: Briefcase },
  { to: "/transactions", label: "Transactions", icon: ArrowLeftRight },
]

const secondaryNavItems = [
  // Performance page is feature-flagged off (frozen) — see lib/features.ts.
  ...(FEATURES.performancePage
    ? [{ to: "/performance", label: "Performance", icon: TrendingUp }]
    : []),
  { to: "/retirement", label: "Retirement", icon: PiggyBank },
  { to: "/budget", label: "Budget", icon: Wallet },
  { to: "/campaigns", label: CAMPAIGN_COPY.navLabel, icon: Megaphone },
  { to: "/settings", label: "Settings", icon: Settings },
]

const navItems = [...primaryNavItems, ...secondaryNavItems]

const moreNavItem = { to: "/more", label: "More", icon: Ellipsis }

// Exact match or a sub-path — "/budget" must not match a future "/budgets".
const matchesPath = (pathname: string, to: string) =>
  pathname === to || pathname.startsWith(`${to}/`)

// Shared by Sidebar and MobileNav so both shells light the same entry.
// Asset detail is Portfolio's drill-down; it lights the Portfolio entry.
const isNavItemActive = (pathname: string, to: string) =>
  to === "/"
    ? pathname === "/"
    : matchesPath(pathname, to) ||
      (to === "/portfolio" && matchesPath(pathname, "/assets"))

export default function Sidebar() {
  const { pathname } = useLocation()
  return (
    <aside className="hidden md:flex md:w-60 md:flex-col md:border-r bg-sidebar">
      <div className="flex h-14 items-center gap-2.5 border-b px-4">
        <Logo size={26} />
        <span className="text-base font-semibold tracking-tight">{APP_NAME}</span>
      </div>
      <nav className="flex-1 space-y-1 p-2">
        {navItems.map((item) => {
          const active = isNavItemActive(pathname, item.to)
          return (
            <Link
              key={item.to}
              to={item.to}
              aria-current={active ? "page" : undefined}
              className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent/50"
              }`}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          )
        })}
      </nav>
      <div className="border-t px-4 py-2.5">
        <BuildBadge />
      </div>
    </aside>
  )
}

export {
  navItems,
  primaryNavItems,
  secondaryNavItems,
  moreNavItem,
  matchesPath,
  isNavItemActive,
}
