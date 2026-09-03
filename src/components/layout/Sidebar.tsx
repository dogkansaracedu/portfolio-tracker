import { Link, useLocation } from "react-router"
import { APP_NAME } from "@/lib/constants/app"
import { navItems, isNavItemActive } from "@/lib/constants/navigation"
import Logo from "@/components/common/Logo"
import BuildBadge from "@/components/common/BuildBadge"

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
