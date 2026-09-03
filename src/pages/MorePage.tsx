import { Link } from "react-router"
import { ChevronRight } from "lucide-react"
import { PageHeading } from "@/components/common/PageHeading"
import { secondaryNavItems } from "@/lib/constants/navigation"

export default function MorePage() {
  return (
    <div className="space-y-6">
      {/* This hub is only ever reached at phone widths, where the header
          already names it; the heading exists for wider viewports. */}
      <PageHeading title="More" />
      <nav className="w-full max-w-md divide-y overflow-hidden rounded-lg border">
        {secondaryNavItems.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className="flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors hover:bg-accent/50 active:bg-accent"
          >
            <item.icon className="h-5 w-5 text-muted-foreground" />
            <span className="flex-1">{item.label}</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </Link>
        ))}
      </nav>
    </div>
  )
}
