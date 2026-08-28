import { NavLink } from "react-router"
import {
  LayoutDashboard,
  Briefcase,
  ArrowLeftRight,
  TrendingUp,
  PiggyBank,
  Wallet,
  Megaphone,
  Settings,
} from "lucide-react"
import { CAMPAIGN_COPY } from "@/lib/constants/campaigns"
import { FEATURES } from "@/lib/features"
import Logo from "@/components/common/Logo"
import BuildBadge from "@/components/common/BuildBadge"

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/portfolio", label: "Portfolio", icon: Briefcase },
  { to: "/transactions", label: "Transactions", icon: ArrowLeftRight },
  // Performance page is feature-flagged off (frozen) — see lib/features.ts.
  ...(FEATURES.performancePage
    ? [{ to: "/performance", label: "Performance", icon: TrendingUp }]
    : []),
  { to: "/retirement", label: "Retirement", icon: PiggyBank },
  { to: "/budget", label: "Budget", icon: Wallet },
  { to: "/campaigns", label: CAMPAIGN_COPY.navLabel, icon: Megaphone },
  { to: "/settings", label: "Settings", icon: Settings },
]

export default function Sidebar() {
  return (
    <aside className="hidden md:flex md:w-60 md:flex-col md:border-r bg-sidebar">
      <div className="flex h-14 items-center gap-2.5 border-b px-4">
        <Logo size={26} />
        <span className="text-base font-semibold tracking-tight">Portfolio Tracker</span>
      </div>
      <nav className="flex-1 space-y-1 p-2">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent/50"
              }`
            }
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div className="border-t px-4 py-2.5">
        <BuildBadge />
      </div>
    </aside>
  )
}

export { navItems }
