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
import { FEATURES } from "@/lib/features"

// The app's navigation entries and the path-matching rules both shells use.
// Primary items get a dedicated tab in the mobile bottom bar; secondary
// items live behind its "More" hub tab. Desktop sidebar shows all of them.
export const primaryNavItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/portfolio", label: "Portfolio", icon: Briefcase },
  { to: "/transactions", label: "Transactions", icon: ArrowLeftRight },
]

export const secondaryNavItems = [
  // Performance page is feature-flagged off (frozen) — see lib/features.ts.
  ...(FEATURES.performancePage
    ? [{ to: "/performance", label: "Performance", icon: TrendingUp }]
    : []),
  { to: "/retirement", label: "Retirement", icon: PiggyBank },
  { to: "/budget", label: "Budget", icon: Wallet },
  { to: "/campaigns", label: CAMPAIGN_COPY.navLabel, icon: Megaphone },
  { to: "/settings", label: "Settings", icon: Settings },
]

export const navItems = [...primaryNavItems, ...secondaryNavItems]

export const moreNavItem = { to: "/more", label: "More", icon: Ellipsis }

// Exact match or a sub-path — "/budget" must not match a future "/budgets".
export const matchesPath = (pathname: string, to: string) =>
  pathname === to || pathname.startsWith(`${to}/`)

// Shared by Sidebar and MobileNav so both shells light the same entry.
// Asset detail is Portfolio's drill-down; it lights the Portfolio entry.
export const isNavItemActive = (pathname: string, to: string) =>
  to === "/"
    ? pathname === "/"
    : matchesPath(pathname, to) ||
      (to === "/portfolio" && matchesPath(pathname, "/assets"))
