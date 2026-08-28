import { Link, useLocation } from "react-router"
import {
  primaryNavItems,
  secondaryNavItems,
  moreNavItem,
  matchesPath,
  isNavItemActive,
} from "./Sidebar"

const tabClass = (isActive: boolean) =>
  `flex flex-1 flex-col items-center gap-1 py-2 text-xs transition-colors ${
    isActive ? "text-primary" : "text-muted-foreground"
  }`

export default function MobileNav() {
  const { pathname } = useLocation()

  // The More tab stays highlighted while on any of its hub's sections.
  const moreActive =
    matchesPath(pathname, moreNavItem.to) ||
    secondaryNavItems.some((item) => matchesPath(pathname, item.to))

  const tabs = [
    ...primaryNavItems.map((item) => ({
      ...item,
      active: isNavItemActive(pathname, item.to),
    })),
    { ...moreNavItem, active: moreActive },
  ]

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 flex border-t bg-background md:hidden">
      {tabs.map((item) => (
        <Link
          key={item.to}
          to={item.to}
          aria-current={item.active ? "page" : undefined}
          className={tabClass(item.active)}
        >
          <item.icon className="h-5 w-5" />
          <span>{item.label}</span>
        </Link>
      ))}
    </nav>
  )
}
