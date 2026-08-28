import { NavLink, useLocation } from "react-router"
import { primaryNavItems, secondaryNavItems, moreNavItem } from "./Sidebar"

const tabClass = (isActive: boolean) =>
  `flex flex-1 flex-col items-center gap-1 py-2 text-xs transition-colors ${
    isActive ? "text-primary" : "text-muted-foreground"
  }`

export default function MobileNav() {
  const { pathname } = useLocation()
  // The More tab stays highlighted while on any of its hub's sections.
  const moreActive =
    pathname === moreNavItem.to ||
    secondaryNavItems.some((item) => pathname.startsWith(item.to))

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 flex border-t bg-background md:hidden">
      {primaryNavItems.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === "/"}
          className={({ isActive }) => tabClass(isActive)}
        >
          <item.icon className="h-5 w-5" />
          <span>{item.label}</span>
        </NavLink>
      ))}
      <NavLink to={moreNavItem.to} className={tabClass(moreActive)}>
        <moreNavItem.icon className="h-5 w-5" />
        <span>{moreNavItem.label}</span>
      </NavLink>
    </nav>
  )
}
